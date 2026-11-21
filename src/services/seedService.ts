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

  const products = [
    ['Royal Stag', 'Royal Stag', 'cat-whisky', '180 ml', '8901234560011', 'RS180', 22000, 28000, 31000, 38],
    ['Royal Stag', 'Royal Stag', 'cat-whisky', '375 ml', '8901234560028', 'RS375', 43000, 52000, 56000, 42],
    ['Royal Stag', 'Royal Stag', 'cat-whisky', '750 ml', '8901234560035', 'RS750', 82000, 98000, 110000, 46],
    ['Old Monk', 'Old Monk', 'cat-rum', '180 ml', '8901234560042', 'OM180', 18000, 24000, 27000, 35],
    ['Old Monk', 'Old Monk', 'cat-rum', '375 ml', '8901234560059', 'OM375', 36000, 44000, 48000, 32],
    ['Magic Moments', 'Magic Moments', 'cat-vodka', '375 ml', '8901234560066', 'MM375', 41000, 51000, 55000, 28],
    ['Magic Moments', 'Magic Moments', 'cat-vodka', '750 ml', '8901234560073', 'MM750', 78000, 92000, 100000, 24],
    ['Kingfisher Premium', 'Kingfisher', 'cat-beer', '650 ml', '8901234560080', 'KF650', 8000, 11000, 12000, 120],
    ['Sula Red Zinfandel', 'Sula', 'cat-wine', '750 ml', '8901234560097', 'SULA750', 95000, 125000, 135000, 18],
    ['Mansion House Brandy', 'Mansion House', 'cat-brandy', '750 ml', '8901234560103', 'MH750', 68000, 84000, 90000, 20],
  ] as const
  await db.products.bulkAdd(products.map((p, index) => ({
    id: `product-${index + 1}`,
    name: p[0], brand: p[1], categoryId: p[2], bottleSize: p[3],
    barcode: p[4], sku: p[5], purchasePrice: p[6], sellingPrice: p[7],
    mrp: p[8], taxRate: 0, openingStock: p[9], currentStock: p[9],
    minimumStock: 10, active: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })))

  await db.settings.put({ key: 'shop', shopName: 'WineBar Guwahati', address: 'Guwahati, Assam', phone: '', gst: '', businessBoundaryHour: 0, timezone: 'Asia/Kolkata' })
}
