import { db } from '../db/database'

const legacySeededAccounts = [
  { id: 'admin-1', pinHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9' },
  { id: 'cashier-1', pinHash: 'b4c94003c562bb0d89535eca77f07284fe560fd48a7cc1ed99f0a56263d616ba' },
]

export async function seedDatabase() {
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

  return db.transaction('rw', db.users, db.categories, db.settings, async () => {
    for (const account of legacySeededAccounts) {
      const user = await db.users.get(account.id)
      if (user?.pinHash === account.pinHash) await db.users.delete(account.id)
    }

    for (const [sortOrder, [id, name, icon, color]] of categories.entries()) {
      if (!await db.categories.get(id)) {
        await db.categories.add({
          id, name, icon, color, sortOrder, active: true,
        })
      }
    }

    if (!await db.settings.get('shop')) {
      await db.settings.put({ key: 'shop', shopName: 'WineBar Guwahati', address: 'Guwahati, Assam', phone: '', gst: '', businessBoundaryHour: 0, timezone: 'Asia/Kolkata' })
    }

    return await db.users.where('role').equals('ADMIN').filter((user) => user.active).count() === 0
  })
}
