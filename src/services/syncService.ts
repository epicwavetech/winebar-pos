import { db } from '../db/database'
import type { Category, Product } from '../types/models'

export interface SyncResult {
  synced: number
  pending: number
  error?: string
  lastSuccess?: string
}

// Default to the same-origin Vercel API (/api) when no endpoint is saved in Settings.
const DEFAULT_ENDPOINT = '/api'
let running: Promise<SyncResult> | undefined

interface CatalogResponse {
  categories: Array<{
    id: string
    name: string
    icon?: string | null
    color?: string | null
    sort_order?: number | null
    active?: boolean | null
  }>
  products: Array<{
    id: string
    name: string
    brand?: string | null
    category_id?: string | null
    bottle_size?: string | null
    barcode?: string | null
    sku?: string | null
    purchase_price?: number | string | null
    selling_price?: number | string | null
    mrp?: number | string | null
    tax_rate?: number | string | null
    opening_stock?: number | null
    current_stock?: number | null
    minimum_stock?: number | null
    image?: string | null
    active?: boolean | null
    created_at?: string | null
    updated_at?: string | null
  }>
}

async function send<T>(url: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined
    ? { method: 'GET', headers }
    : { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok) {
    let detail = ''
    try { detail = (await response.json())?.error || '' } catch { /* body was not JSON */ }
    throw new Error(detail || `Request failed (${response.status})`)
  }
  return response.json()
}

const unsyncedCount = async () => {
  const [queued, ledger] = await Promise.all([
    db.syncQueue.where('status').anyOf('pending', 'error').count(),
    db.inventoryTransactions.where('syncStatus').equals('pending').count(),
  ])
  return queued + ledger
}
const timestamp = (value?: string) => {
  const parsed = value ? Date.parse(value) : 0
  return Number.isNaN(parsed) ? 0 : parsed
}

function fromCatalog(catalog: CatalogResponse) {
  const categories: Category[] = catalog.categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon ?? '',
    color: category.color ?? '#64748b',
    sortOrder: category.sort_order ?? 0,
    active: category.active ?? true,
  }))
  const products: Product[] = catalog.products.map((product) => {
    const createdAt = product.created_at ?? new Date().toISOString()
    return {
      id: product.id,
      name: product.name,
      brand: product.brand ?? '',
      categoryId: product.category_id ?? '',
      bottleSize: product.bottle_size ?? '',
      barcode: product.barcode ?? '',
      sku: product.sku ?? '',
      purchasePrice: Number(product.purchase_price ?? 0),
      sellingPrice: Number(product.selling_price ?? 0),
      mrp: Number(product.mrp ?? 0),
      taxRate: Number(product.tax_rate ?? 0),
      openingStock: product.opening_stock ?? 0,
      currentStock: product.current_stock ?? 0,
      minimumStock: product.minimum_stock ?? 0,
      image: product.image ?? undefined,
      active: product.active ?? true,
      createdAt,
      updatedAt: product.updated_at ?? createdAt,
    }
  })
  return { categories, products }
}

export function synchronizePending(): Promise<SyncResult> {
  if (running) return running
  running = runSync().finally(() => { running = undefined })
  return running
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

  // 2. Pull the shared catalog, then push only newer local products to avoid stale devices overwriting it.
  try {
    const [categories, products] = await Promise.all([db.categories.toArray(), db.products.toArray()])
    const initialCatalog = await send<CatalogResponse>(`${base}/catalog`, headers)
    const initial = fromCatalog(initialCatalog)
    const remoteById = new Map(initial.products.map((product) => [product.id, product]))
    const changedProducts = products.filter((product) => {
      const remote = remoteById.get(product.id)
      return !remote || timestamp(product.updatedAt) > timestamp(remote.updatedAt)
    })
    await send(`${base}/catalog`, headers, { categories, products: changedProducts })

    const latestCatalog = fromCatalog(await send<CatalogResponse>(`${base}/catalog`, headers))
    const localById = new Map(products.map((product) => [product.id, product]))
    await db.transaction('rw', db.categories, db.products, async () => {
      await db.categories.bulkPut(latestCatalog.categories)
      const productsToSave = latestCatalog.products.filter((remote) => {
        const local = localById.get(remote.id)
        return !local || timestamp(remote.updatedAt) >= timestamp(local.updatedAt)
      })
      await db.products.bulkPut(productsToSave)
    })
    window.dispatchEvent(new Event('winebar:catalog-updated'))
  } catch (error) {
    return { synced: 0, pending: await unsyncedCount(), error: `Catalog sync failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }

  // 3. Push queued records (failed ones are retried on the next sync)
  let synced = 0
  let failed = 0
  const queue = await db.syncQueue.where('status').anyOf('pending', 'error').toArray()
  const queuedExpenseIds = new Set(queue.filter((entry) => entry.entityType === 'expense').map((entry) => entry.entityId))
  const unqueuedExpenses = await db.expenses.where('syncStatus').anyOf('pending', 'error').toArray()
  const missingExpenseEntries = unqueuedExpenses
    .filter((expense) => !queuedExpenseIds.has(expense.id))
    .map((expense) => ({
      id: crypto.randomUUID(),
      entityType: 'expense',
      entityId: expense.id,
      status: 'pending',
      createdAt: expense.createdAt,
      attempts: 0,
    }))
  if (missingExpenseEntries.length) await db.syncQueue.bulkAdd(missingExpenseEntries)
  const recordsToSync = [...queue, ...missingExpenseEntries]
  for (const entry of recordsToSync) {
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
      synced += chunk.length
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
