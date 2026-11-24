export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF'

export interface User {
  id: string
  name: string
  username: string
  role: UserRole
  active: boolean
  pinHash?: string
  hasPassword?: boolean
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  sortOrder: number
  active: boolean
}

export interface Customer {
  id: string
  name: string
  phone: string
  creditBalance: number
  createdAt: string
  updatedAt: string
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
  purchasePriceStatus?: 'verified' | 'pending'
  purchasePriceSource?: 'actual-invoice-payable' | 'configured-formula' | 'pending'
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
  purchasePriceStatus?: 'verified' | 'pending'
  availableStock: number
  discountPerBottle: number
}

export type SalePaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'OTHER' | 'BTC'

export interface Payment {
  id: string
  method: SalePaymentMethod
  amount: number
}

export interface Sale {
  id: string
  idempotencyKey: string
  invoiceNumber: string
  cashierId: string
  cashierName: string
  customerId?: string
  customerName?: string
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
  purchasePriceStatus?: 'verified' | 'pending'
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
  costStatus?: 'verified' | 'pending'
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
  acquisitionCost?: number
  costStatus?: 'verified' | 'pending'
  costSource?: 'actual-invoice-payable' | 'configured-formula' | 'pending'
  invoiceValues?: PurchaseInvoiceValues
  formulaSnapshot?: CostFormulaConfig
  batchNumber?: string
}

export type CostFormulaComponent = 'totalMrp' | 'adValorem' | 'vatAmount' | 'tpfAmount' | 'otherCharges' | 'discount'

export interface CostFormulaConfig {
  enabled: boolean
  verified: boolean
  verifiedReference: string
  components: Partial<Record<CostFormulaComponent, 'add' | 'subtract'>>
  updatedAt?: string
}

export interface PurchaseInvoiceValues {
  originalInputs: {
    numberOfCases: string
    bottlesPerCase: string
    looseBottles: string
    bottleSizeMl: string
    mrpPerBottle: string
    invoiceTotalMrp: string
    adValorem: string
    vatAmount: string
    tpfAmount: string
    otherCharges: string
    discount: string
    actualInvoicePayable: string
  }
  brandName: string
  bottleSizeMl: number
  numberOfCases: number
  bottlesPerCase: number
  looseBottles: number
  totalBottles: number
  mrpPerBottle: number
  invoiceTotalMrp?: number
  calculatedTotalMrp: number
  adValorem: number
  vatAmount: number
  tpfAmount: number
  otherCharges: number
  discount: number
  actualInvoicePayable?: number
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
  creditSales: number
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
