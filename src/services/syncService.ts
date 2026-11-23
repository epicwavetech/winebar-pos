import { db } from '../db/database'

export interface SyncResult {
  synced: number
  pending: number
  error?: string
  lastSuccess?: string
}

// Default to the same-origin Vercel API (/api) when no endpoint is saved in Settings.
const DEFAULT_ENDPOINT = '/api'
let running = false

async function send(url: string, headers: Record<string, string>, body?: unknown) {
  const response = await fetch(url, body === undefined
    ? { method: 'GET', headers }
    : { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok) {
    let detail = ''
    try { detail = (await response.json())?.error || '' } catch { /* body was not JSON */ }
    throw new Error(detail || `Request failed (${response.status})`)
  }
}

const unsyncedCount = () => db.syncQueue.where('status').anyOf('pending', 'error').count()

export async function synchronizePending(): Promise<SyncResult> {
  if (running) return { synced: 0, pending: await unsyncedCount(), error: 'Sync already in progress' }
  running = true
  try {
    return await runSync()
  } finally {
    running = false
  }
}

async function runSync(): Promise<SyncResult> {
  const setting = await db.settings.get('sync')
  const base = (setting?.endpoint?.trim() || DEFAULT_ENDPOINT).replace(/\/$/, '')
  const apiKey: string = setting?.apiKey?.trim() || ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (apiKey) headers['x-api-key'] = apiKey

  // 1. Health check (also verifies the API key and the database connection)
  try {
    await send(`${base}/health`, headers)
  } catch (error) {
    return { synced: 0, pending: await unsyncedCount(), error: error instanceof Error ? error.message : 'Server is unavailable' }
  }

  // 2. Push catalog first so products/categories exist before sales and stock rows reference them
  try {
    const [categories, products] = await Promise.all([db.categories.toArray(), db.products.toArray()])
    await send(`${base}/catalog`, headers, { categories, products })
  } catch (error) {
    return { synced: 0, pending: await unsyncedCount(), error: `Catalog sync failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }

  // 3. Push queued records (failed ones are retried on the next sync)
  let synced = 0
  let failed = 0
  const queue = await db.syncQueue.where('status').anyOf('pending', 'error').toArray()
  for (const entry of queue) {
    try {
      let payload: unknown = null
      if (entry.entityType === 'sale') {
        const sale = await db.sales.get(entry.entityId)
        if (sale) payload = { ...sale, items: await db.saleItems.where('saleId').equals(sale.id).toArray() }
      }
      if (entry.entityType === 'purchase') payload = await db.purchases.get(entry.entityId)
      if (entry.entityType === 'settlement') payload = await db.settlements.get(entry.entityId)
      if (entry.entityType === 'expense') payload = await db.expenses.get(entry.entityId)
      if (!payload) continue
      await send(`${base}/${entry.entityType}s`, { ...headers, 'Idempotency-Key': entry.idempotencyKey || entry.entityId }, payload)

      const done = { syncStatus: 'synced' as const }
      if (entry.entityType === 'sale') await db.sales.update(entry.entityId, done)
      if (entry.entityType === 'purchase') await db.purchases.update(entry.entityId, done)
      if (entry.entityType === 'settlement') await db.settlements.update(entry.entityId, done)
      if (entry.entityType === 'expense') await db.expenses.update(entry.entityId, done)
      await db.syncQueue.update(entry.id, { status: 'synced', attempts: entry.attempts + 1, syncedAt: new Date().toISOString(), lastError: undefined })
      synced++
    } catch (error) {
      failed++
      await db.syncQueue.update(entry.id, { status: 'error', attempts: entry.attempts + 1, lastError: error instanceof Error ? error.message : 'Unknown sync error' })
    }
  }

  // 4. Push stock ledger rows (sales, purchases, damage, adjustments, opening stock)
  let ledgerError: string | undefined
  try {
    const ledger = await db.inventoryTransactions.where('syncStatus').equals('pending').toArray()
    for (let i = 0; i < ledger.length; i += 500) {
      const chunk = ledger.slice(i, i + 500)
      await send(`${base}/inventory`, headers, { transactions: chunk })
      await db.inventoryTransactions.where('id').anyOf(chunk.map((row) => row.id)).modify({ syncStatus: 'synced' })
    }
  } catch (error) {
    ledgerError = `Stock ledger sync failed: ${error instanceof Error ? error.message : 'unknown error'}`
  }

  const lastSuccess = synced ? new Date().toISOString() : await db.settings.get('lastSync').then((value) => value?.value)
  if (synced) await db.settings.put({ key: 'lastSync', value: lastSuccess })
  return {
    synced,
    pending: await unsyncedCount(),
    lastSuccess: lastSuccess || undefined,
    error: ledgerError || (failed ? `${failed} record(s) failed to sync — will retry` : undefined),
  }
}
