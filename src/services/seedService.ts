import { db } from '../db/database'

export async function seedDatabase() {
  if (await db.users.count()) return
  const hash = async (value: string) => {
    const bytes = new TextEncoder().encode(value)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  const [adminHash, cashierHash] = await Promise.all([hash('admin123'), hash('cashier123')])
  await db.users.bulkAdd([
    { id: 'admin-1', name: 'Shop Admin', username: 'admin', role: 'ADMIN', active: true, pinHash: adminHash },
    { id: 'cashier-1', name: 'Rahul Cashier', username: 'cashier', role: 'CASHIER', active: true, pinHash: cashierHash },
  ])
  const categories = [
    ['cat-whisky', 'Whisky', '🥃', '#a855f7'],
    ['cat-rum', 'Rum', '◆', '#f97316'],
    ['cat-vodka', 'Vodka', '◇', '#06b6d4'],
    ['cat-beer', 'Beer', '🍺', '#eab308'],
    ['cat-wine', 'Wine', '🍷', '#ec4899'],
    ['cat-brandy', 'Brandy', '●', '#8b5cf6'],
    ['cat-gin', 'Gin', '○', '#10b981'],
    ['cat-other', 'Other', '■', '#64748b'],
  ] as const
  await db.categories.bulkAdd(categories.map(([id, name, icon, color], index) => ({
    id, name, icon, color, sortOrder: index, active: true,
  })))

  await db.settings.put({ key: 'shop', shopName: 'WineBar Guwahati', address: 'Guwahati, Assam', phone: '', gst: '', businessBoundaryHour: 0, timezone: 'Asia/Kolkata' })
}
