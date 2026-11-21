import { db } from '../db/database'
import type { CartItem, Sale } from '../types/models'

function generateInvoice() {
  const date = new Date()
  const stamp = date.toISOString().slice(2, 10).replace(/-/g, '')
  return `WB-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
}

export async function completeSale(options: {
  items: CartItem[]
  cashierId: string
  cashierName: string
  payments: { method: 'CASH' | 'UPI' | 'CARD' | 'OTHER'; amount: number }[]
  cashReceived: number
}) {
  return db.transaction('rw', [db.products, db.sales, db.saleItems, db.inventoryTransactions, db.syncQueue, db.auditLogs], async () => {
    for (const item of options.items) {
      const product = await db.products.get(item.productId)
      if (!product || !product.active) throw new Error(`${item.name} is inactive or unavailable`)
      if (product.currentStock < item.quantity) throw new Error(`Insufficient stock for ${item.name}`)
    }

    const idempotencyKey = crypto.randomUUID()
    const subtotal = options.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const discount = options.items.reduce((sum, item) => sum + item.discount, 0)
    const total = subtotal - discount
    const paid = options.payments.reduce((sum, payment) => sum + payment.amount, 0)
    if (paid < total) throw new Error(`Payment short by ₹${((total - paid) / 100).toFixed(2)}`)
    const cashReceived = options.cashReceived || 0
    const cashPayment = options.payments.find((payment) => payment.method === 'CASH')?.amount || 0
    const changeReturned = cashPayment > 0 ? Math.max(0, cashReceived - cashPayment) : 0

    const sale: Sale = {
      id: crypto.randomUUID(),
      idempotencyKey,
      invoiceNumber: generateInvoice(),
      cashierId: options.cashierId,
      cashierName: options.cashierName,
      createdAt: new Date().toISOString(),
      subtotal,
      discount,
      tax: 0,
      total,
      payments: options.payments.map((payment) => ({ id: crypto.randomUUID(), ...payment })),
      cashReceived,
      changeReturned,
      syncStatus: 'pending',
    }
    await db.sales.add(sale)

    for (const item of options.items) {
      const product = await db.products.get(item.productId)
      if (!product) continue
      const newStock = product.currentStock - item.quantity
      await db.products.update(product.id, { currentStock: newStock, updatedAt: new Date().toISOString() })
      await db.saleItems.add({
        id: crypto.randomUUID(),
        saleId: sale.id,
        productId: item.productId,
        productName: item.name,
        bottleSize: item.bottleSize,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: item.purchasePrice,
        discount: item.discount,
        tax: 0,
        total: item.unitPrice * item.quantity - item.discount,
      })
      await db.inventoryTransactions.add({
        id: crypto.randomUUID(),
        reference: sale.invoiceNumber,
        productId: item.productId,
        productName: item.name,
        type: 'SALE_OUT',
        stockIn: 0,
        stockOut: item.quantity,
        balance: newStock,
        userId: options.cashierId,
        createdAt: sale.createdAt,
        syncStatus: 'pending',
      })
    }
    await db.syncQueue.add({
      id: crypto.randomUUID(),
      entityType: 'sale',
      entityId: sale.id,
      idempotencyKey,
      status: 'pending',
      createdAt: sale.createdAt,
      attempts: 0,
    })
    await db.auditLogs.add({
      id: crypto.randomUUID(),
      action: 'SALE_COMPLETED',
      entityType: 'sale',
      entityId: sale.id,
      userId: options.cashierId,
      createdAt: sale.createdAt,
      details: JSON.stringify({ invoiceNumber: sale.invoiceNumber, total }),
    })
    return sale
  })
}
