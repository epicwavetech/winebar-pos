import { db } from '../db/database'

export interface SyncResult {
  synced: number
  pending: number
  error?: string
  lastSuccess?: string
}

export async function synchronizePending(): Promise<SyncResult> {
  const setting = await db.settings.get('sync')
  const endpoint = setting?.endpoint?.trim()
  if (!endpoint) return { synced: 0, pending: await db.syncQueue.where('status').equals('pending').count(), error: 'Synchronization endpoint is not configured' }

  try {
    const health = await fetch(`${endpoint.replace(/\/$/, '')}/health`, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!health.ok) throw new Error(`Server health check failed (${health.status})`)
  } catch (error) {
    return { synced: 0, pending: await db.syncQueue.where('status').equals('pending').count(), error: error instanceof Error ? error.message : 'Server is unavailable' }
  }

  let synced = 0
  const queue = await db.syncQueue.where('status').equals('pending').toArray()
  for (const entry of queue) {
    try {
      let payload: unknown = null
      if (entry.entityType === 'sale') payload = await db.sales.get(entry.entityId)
      if (entry.entityType === 'purchase') payload = await db.purchases.get(entry.entityId)
      if (entry.entityType === 'settlement') payload = await db.settlements.get(entry.entityId)
      if (entry.entityType === 'expense') payload = await db.expenses.get(entry.entityId)
      if (!payload) continue
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/${entry.entityType}s`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': entry.idempotencyKey || entry.entityId },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Sync rejected (${response.status})`)
      await db.syncQueue.update(entry.id, { status: 'synced', attempts: entry.attempts + 1, syncedAt: new Date().toISOString() })
      synced++
    } catch (error) {
      await db.syncQueue.update(entry.id, { status: 'error', attempts: entry.attempts + 1, lastError: error instanceof Error ? error.message : 'Unknown sync error' })
    }
  }
  const lastSuccess = synced ? new Date().toISOString() : await db.settings.get('lastSync').then((value) => value?.value)
  if (synced) await db.settings.put({ key: 'lastSync', value: lastSuccess })
  return { synced, pending: await db.syncQueue.where('status').notEqual('synced').count(), lastSuccess: lastSuccess || undefined }
}
