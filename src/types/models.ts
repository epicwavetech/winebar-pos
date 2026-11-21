export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF'

export interface User {
  id: string
  name: string
  username: string
  role: UserRole
  active: boolean
  pinHash?: string
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  sortOrder: number
  active: boolean
}

export interface Product {
  id: string
  name: string
  brand: string
  categoryId: string
  bottleSize: string
  barcode: string
  sku: string
  purchasePrice: number
  sellingPrice: number
  mrp: number
  taxRate: number
  openingStock: number
  currentStock: number
  minimumStock: number
  image?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CartItem {
  productId: string
  name: string
  brand: string
  bottleSize: string
  barcode: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  availableStock: number
  discount: number
}

export interface Payment {
  id: string
  method: 'CASH' | 'UPI' | 'CARD' | 'OTHER'
  amount: number
}

export interface Sale {
  id: string
  idempotencyKey: string
  invoiceNumber: string
  cashierId: string
  cashierName: string
  createdAt: string
  subtotal: number
  discount: number
  tax: number
  total: number
  payments: Payment[]
  cashReceived: number
  changeReturned: number
  syncStatus: 'pending' | 'synced' | 'error'
  serverRecordId?: string
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  productName: string
  bottleSize: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  discount: number
  tax: number
  total: number
}

export interface InventoryTransaction {
  id: string
  reference: string
  productId: string
  productName: string
  type: 'OPENING_STOCK' | 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'EXPIRED'
  stockIn: number
  stockOut: number
  balance: number
  reason?: string
  userId: string
  createdAt: string
  syncStatus: 'pending' | 'synced' | 'error'
}

export interface Purchase {
  id: string
  reference: string
  createdAt: string
  supplierNote?: string
  total: number
  userId: string
  items: PurchaseItem[]
  syncStatus: 'pending' | 'synced' | 'error'
}

export interface PurchaseItem {
  id: string
  purchaseId: string
  productId: string
  productName: string
  bottleSize: string
  quantity: number
  purchaseRate: number
  batchNumber?: string
}

export interface Expense {
  id: string
  title: string
  category: string
  amount: number
  date: string
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'OTHER'
  description: string
  userId: string
  createdAt: string
  syncStatus: 'pending' | 'synced' | 'error'
}

export interface DailySettlement {
  id: string
  businessDate: string
  openingCash: number
  cashSales: number
  upiSales: number
  cardSales: number
  otherSales: number
  cashExpenses: number
  expectedCash: number
  actualCash: number
  shortage: number
  excess: number
  totalBills: number
  bottlesSold: number
  status: 'open' | 'closed'
  closedBy?: string
  closedAt?: string
  syncStatus: 'pending' | 'synced' | 'error'
}
