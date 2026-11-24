import { useEffect, useState } from 'react'
import { db } from '../../db/database'
import { Page, DataTable } from '../../components/ui/Shared'
import type { Product } from '../../types/models'

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  useEffect(() => {
    db.products.toArray().then(setProducts)
    db.inventoryTransactions.reverse().toArray().then(setTransactions)
  }, [])
  const stock = products.reduce((sum, product) => sum + product.currentStock, 0)
  const verifiedValue = products.reduce((sum, product) => sum + (product.purchasePriceStatus === 'verified' ? product.currentStock * product.purchasePrice : 0), 0)
  const pendingStock = products.reduce((sum, product) => sum + (product.purchasePriceStatus === 'verified' ? 0 : product.currentStock), 0)
  return <Page title="Inventory" subtitle="Current stock and verified cost valuation"><div className="inventory-metrics"><div className="metric-card"><div><span>Total bottles</span><strong>{stock}</strong></div></div><div className="metric-card"><div><span>Verified inventory value</span><strong>₹{(verifiedValue/100).toLocaleString('en-IN')}</strong></div></div><div className="metric-card"><div><span>Stock with CP pending</span><strong>{pendingStock}</strong></div></div><div className="metric-card"><div><span>Low stock</span><strong>{products.filter((p) => p.currentStock <= p.minimumStock).length}</strong></div></div></div>
    <DataTable headers={['Date','Reference','Product','Type','Stock In','Stock Out','Balance']} rows={transactions.map((item) => [new Date(item.createdAt).toLocaleString('en-IN'),item.reference,item.productName,item.type,item.stockIn || '-',item.stockOut || '-',item.balance])}/>
  </Page>
}
