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
  const value = products.reduce((sum, product) => sum + product.currentStock * product.purchasePrice, 0)
  return <Page title="Inventory" subtitle="Current stock and valuation"><div className="inventory-metrics"><div className="metric-card"><div><span>Total bottles</span><strong>{stock}</strong></div></div><div className="metric-card"><div><span>Inventory value</span><strong>₹{(value/100).toLocaleString('en-IN')}</strong></div></div><div className="metric-card"><div><span>Low stock</span><strong>{products.filter((p) => p.currentStock <= p.minimumStock).length}</strong></div></div></div>
    <DataTable headers={['Date','Reference','Product','Type','Stock In','Stock Out','Balance']} rows={transactions.map((item) => [new Date(item.createdAt).toLocaleString('en-IN'),item.reference,item.productName,item.type,item.stockIn || '-',item.stockOut || '-',item.balance])}/>
  </Page>
}
