import Dexie, { type EntityTable } from 'dexie'
import type {
  Category, DailySettlement, Expense, InventoryTransaction,
  Product, Purchase, Sale, SaleItem, User,
} from '../types/models'

export class WineBarDatabase extends Dexie {
  users!: EntityTable<User, 'id'>
  categories!: EntityTable<Category, 'id'>
  products!: EntityTable<Product, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleItems!: EntityTable<SaleItem, 'id'>
  purchases!: EntityTable<Purchase, 'id'>
  inventoryTransactions!: EntityTable<InventoryTransaction, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  settlements!: EntityTable<DailySettlement, 'id'>
  auditLogs!: EntityTable<any, 'id'>
  syncQueue!: EntityTable<any, 'id'>
  settings!: Dexie.Table<any, string>

  constructor() {
    super('WineBarPOS')
    this.version(1).stores({
      users: 'id, username, role, active',
      categories: 'id, name, sortOrder, active',
      products: 'id, name, brand, categoryId, barcode, sku, active, currentStock',
      sales: 'id, invoiceNumber, cashierId, createdAt, syncStatus, idempotencyKey',
      saleItems: 'id, saleId, productId',
      purchases: 'id, reference, createdAt, syncStatus',
      inventoryTransactions: 'id, reference, productId, type, createdAt, syncStatus',
      expenses: 'id, date, category, paymentMethod, syncStatus',
      settlements: 'id, businessDate, status, syncStatus',
      auditLogs: 'id, action, entityType, userId, createdAt',
      syncQueue: 'id, entityType, status, createdAt',
      settings: 'key',
    })
  }
}

export const db = new WineBarDatabase()
