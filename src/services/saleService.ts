import { db } from '../db/database'
import type { CartItem, Sale, SalePaymentMethod } from '../types/models'

function allocateDiscount(totalDiscount: number, lineTotals: number[]) {
  const total = lineTotals.reduce((sum, lineTotal) => sum + lineTotal, 0)
  if (!total || !totalDiscount) return lineTotals.map(() => 0)

  const shares = lineTotals.map((lineTotal) => {
    const exact = totalDiscount * lineTotal / total
    return { amount: Math.floor(exact), remainder: exact % 1 }
  })
  let remaining = totalDiscount - shares.reduce((sum, share) => sum + share.amount, 0)
  const order = shares.map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => b.remainder - a.remainder)
  for (const { index } of order) {
    if (!remaining) break
    if (shares[index].amount < lineTotals[index]) {
      shares[index].amount++
      remaining--
    }
  }
  return shares.map((share) => share.amount)
}

function generateInvoice() {
  const date = new Date()
  const stamp = date.toISOString().slice(2, 10).replace(/-/g, '')
  return `WB-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
}

export async function completeSale(options: {
  items: CartItem[]
  cashierId: string
  cashierName: string
  payments: { method: SalePaymentMethod; amount: number }[]
  cashReceived: number
  customerId?: string
  billDiscount?: number
}) {
  const sale = await db.transaction('rw', [db.products, db.customers, db.sales, db.saleItems, db.inventoryTransactions, db.syncQueue, db.auditLogs], async () => {
    for (const item of options.items) {
      const product = await db.products.get(item.productId)
      if (!product || !product.active) throw new Error(`${item.name} is inactive or unavailable`)
      if (product.currentStock < item.quantity) throw new Error(`Insufficient stock for ${item.name}`)
      if (item.discountPerBottle < 0 || item.discountPerBottle > item.unitPrice) {
        throw new Error(`Invalid per-bottle discount for ${item.name}`)
      }
    }

    const creditPayments = options.payments.filter((payment) => payment.method === 'BTC')
    const creditAmount = creditPayments
      .reduce((sum, payment) => sum + payment.amount, 0)
    const customer = options.customerId ? await db.customers.get(options.customerId) : undefined
    if (creditPayments.length && !customer) throw new Error('Select an existing customer for Bill to Credit')

    const idempotencyKey = crypto.randomUUID()
    const subtotal = options.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const lineTotals = options.items.map((item) => (item.unitPrice - item.discountPerBottle) * item.quantity)
    const itemDiscount = options.items.reduce((sum, item) => sum + item.discountPerBottle * item.quantity, 0)
    const subtotalAfterItemDiscounts = lineTotals.reduce((sum, lineTotal) => sum + lineTotal, 0)
    const requestedBillDiscount = Math.round(options.billDiscount ?? 0)
    if (!Number.isFinite(requestedBillDiscount) || requestedBillDiscount < 0) {
      throw new Error('Bill discount must be a non-negative amount')
    }
    const billDiscount = Math.min(requestedBillDiscount, subtotalAfterItemDiscounts)
    const allocatedBillDiscount = allocateDiscount(billDiscount, lineTotals)
    const discount = itemDiscount + billDiscount
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
      customerId: customer?.id,
      customerName: customer?.name,
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

    for (let index = 0; index < options.items.length; index++) {
      const item = options.items[index]
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
        purchasePriceStatus: item.purchasePriceStatus === 'verified' ? 'verified' : 'pending',
        discount: item.discountPerBottle * item.quantity + allocatedBillDiscount[index],
        tax: 0,
        total: lineTotals[index] - allocatedBillDiscount[index],
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
    if (customer && creditAmount > 0) {
      await db.customers.update(customer.id, {
        creditBalance: customer.creditBalance + creditAmount,
        updatedAt: sale.createdAt,
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
  if (sale.customerId) window.dispatchEvent(new Event('winebar:customers-updated'))
  return sale
}
