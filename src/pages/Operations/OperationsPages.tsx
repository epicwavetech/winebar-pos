import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { db } from '../../db/database'
import { Page, DataTable } from '../../components/ui/Shared'
import type { Expense, Product, Purchase, PurchaseItem } from '../../types/models'
import { printSale } from '../../services/printService'
import { downloadCsv, exportExcel, exportPdf } from '../../services/exportService'
import { useAuthStore } from '../../stores/authStore'

export function CategoriesPage() {
  const [items, setItems] = useState<any[]>([])
  useEffect(() => { db.categories.toArray().then(setItems) }, [])
  const add = async () => {
    const name = window.prompt('Category name')
    if (!name) return
    await db.categories.add({ id: crypto.randomUUID(), name, icon: '●', color: '#7c3aed', sortOrder: items.length, active: true })
    setItems(await db.categories.toArray())
  }
  return <Page title="Categories" subtitle={`${items.length} categories`}><div className="category-grid">{items.map((item) => <div className="category-card" key={item.id}><span style={{ background: item.color }}>{item.icon}</span><strong>{item.name}</strong><small>{item.active ? 'Active' : 'Inactive'}</small></div>)}</div><button className="primary" onClick={add}><Plus size={16}/> Add category</button></Page>
}

export function StockInPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<{ productId: string; quantity: number; rate: number }[]>([])
  const userId = useAuthStore((state) => state.user?.id || 'admin-1')
  useEffect(() => { db.products.toArray().then((items) => setProducts(items.filter((item) => item.active))) }, [])
  const addLine = () => setItems([...items, { productId: '', quantity: 1, rate: 0 }])
  const save = async () => {
    if (!items.length || items.some((item) => !item.productId || item.quantity < 1)) return
    const id = crypto.randomUUID()
    const reference = `SI-${Date.now().toString().slice(-8)}`
    const total = items.reduce((sum, item) => sum + item.quantity * item.rate * 100, 0)
    await db.transaction('rw', [db.products, db.purchases, db.inventoryTransactions, db.syncQueue], async () => {
      const purchase: Purchase = { id, reference, createdAt: new Date().toISOString(), total, userId, items: [], syncStatus: 'pending' }
      await db.purchases.add(purchase)
      const purchaseItems: PurchaseItem[] = []
      for (const line of items) {
        const product = await db.products.get(line.productId)
        if (!product) continue
        purchaseItems.push({ id: crypto.randomUUID(), purchaseId: id, productId: product.id, productName: product.name, bottleSize: product.bottleSize, quantity: line.quantity, purchaseRate: Math.round(line.rate * 100) })
        const balance = product.currentStock + line.quantity
        await db.products.update(product.id, { currentStock: balance, updatedAt: new Date().toISOString() })
        await db.inventoryTransactions.add({ id: crypto.randomUUID(), reference, productId: product.id, productName: product.name, type: 'PURCHASE_IN', stockIn: line.quantity, stockOut: 0, balance, userId, createdAt: purchase.createdAt, syncStatus: 'pending' })
      }
      await db.purchases.update(id, { items: purchaseItems })
      await db.syncQueue.add({ id: crypto.randomUUID(), entityType: 'purchase', entityId: id, status: 'pending', createdAt: purchase.createdAt, attempts: 0 })
    })
    setItems([])
    setProducts((await db.products.toArray()).filter((item) => item.active))
  }
  return <Page title="Stock In" subtitle="Receive new inventory"><button className="primary" onClick={addLine}><Plus size={16}/> Add product</button>
    <div className="panel stock-form">{items.map((item, index) => <div className="stock-line" key={index}><select value={item.productId} onChange={(event) => setItems(items.map((value, i) => i === index ? { ...value, productId: event.target.value } : value))}><option value="">Select product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name} · {product.bottleSize}</option>)}</select><input type="number" min="1" value={item.quantity} onChange={(event) => setItems(items.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value))} placeholder="Quantity"/><input type="number" min="0" step="0.01" value={item.rate || ''} onChange={(event) => setItems(items.map((value, i) => i === index ? { ...value, rate: Number(event.target.value) } : value))} placeholder="Rate (₹)"/></div>)}
    {items.length > 0 && <button className="primary" onClick={save}>Confirm stock in</button>}</div>
  </Page>
}

export function StockOutPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('Damaged stock')
  const userId = useAuthStore((state) => state.user?.id || 'admin-1')
  useEffect(() => { db.products.toArray().then((items) => setProducts(items.filter((item) => item.active))) }, [])
  const save = async () => {
    const product = await db.products.get(productId)
    if (!product || quantity > product.currentStock) return
    await db.transaction('rw', db.products, db.inventoryTransactions, db.syncQueue, async () => {
      const balance = product.currentStock - quantity
      const createdAt = new Date().toISOString()
      await db.products.update(product.id, { currentStock: balance, updatedAt: createdAt })
      await db.inventoryTransactions.add({ id: crypto.randomUUID(), reference: `SO-${Date.now().toString().slice(-8)}`, productId: product.id, productName: product.name, type: reason === 'Expired stock' ? 'EXPIRED' : 'DAMAGE', stockIn: 0, stockOut: quantity, balance, reason, userId, createdAt, syncStatus: 'pending' })
    })
    setProductId(''); setQuantity(1)
    setProducts((await db.products.toArray()).filter((item) => item.active))
  }
  return <Page title="Stock Out" subtitle="Remove stock for an authorized reason"><div className="panel stock-form"><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.bottleSize} ({product.currentStock})</option>)}</select></label><label>Quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}/></label><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Damaged stock</option><option>Broken bottle</option><option>Expired stock</option><option>Internal consumption</option><option>Theft / missing stock</option><option>Stock correction</option><option>Other</option></select></label><button className="primary" onClick={save} disabled={!productId}>Confirm stock out</button></div></Page>
}

export function AdjustmentPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [physical, setPhysical] = useState('')
  const userId = useAuthStore((state) => state.user?.id || 'admin-1')
  useEffect(() => { db.products.toArray().then((items) => setProducts(items.filter((item) => item.active))) }, [])
  const product = products.find((item) => item.id === productId)
  const difference = product && physical !== '' ? Number(physical) - product.currentStock : 0
  const save = async () => {
    if (!product || physical === '') return
    const actual = Number(physical)
    await db.transaction('rw', db.products, db.inventoryTransactions, async () => {
      const createdAt = new Date().toISOString()
      await db.products.update(product.id, { currentStock: actual, updatedAt: createdAt })
      await db.inventoryTransactions.add({ id: crypto.randomUUID(), reference: `ADJ-${Date.now().toString().slice(-8)}`, productId: product.id, productName: product.name, type: difference >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', stockIn: Math.max(0, difference), stockOut: Math.max(0, -difference), balance: actual, reason: 'Physical stock adjustment', userId, createdAt, syncStatus: 'pending' })
    })
    setProducts((await db.products.toArray()).filter((item) => item.active))
  }
  return <Page title="Stock Adjustment" subtitle="Reconcile physical and system stock"><div className="panel stock-form"><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Select product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.bottleSize}</option>)}</select></label>{product && <div className="adjustment-summary"><span>System stock<strong>{product.currentStock}</strong></span><span>Physical stock<strong>{physical || 0}</strong></span><span>Difference<strong className={difference < 0 ? 'negative' : ''}>{difference >= 0 ? '+' : ''}{difference}</strong></span></div>}<label>Physical quantity<input type="number" min="0" value={physical} onChange={(event) => setPhysical(event.target.value)}/></label><button className="primary" onClick={save} disabled={!productId}>Confirm adjustment</button></div></Page>
}

export function PurchasesPage() {
  const [items, setItems] = useState<Purchase[]>([])
  useEffect(() => { db.purchases.toArray().then(setItems) }, [])
  return <Page title="Purchases" subtitle="Stock-in purchase history"><DataTable headers={['Reference','Date','Value','Sync']} rows={items.map((item) => [item.reference,new Date(item.createdAt).toLocaleString('en-IN'),`₹${(item.total/100).toFixed(2)}`,item.syncStatus])}/></Page>
}

export function SalesPage() {
  const [items, setItems] = useState<any[]>([])
  useEffect(() => { db.sales.reverse().toArray().then(setItems) }, [])
  const reprint = async (sale: any) => {
    const saleItems = await db.saleItems.where('saleId').equals(sale.id).toArray()
    const shop = await db.settings.get('shop')
    printSale(sale, saleItems, '80mm', {
      name: shop?.shopName || 'WineBar POS',
      address: shop?.address || '',
      phone: shop?.phone || '',
      gst: shop?.gst || '',
    })
  }
  const exportRows = items.map((sale) => [sale.invoiceNumber,new Date(sale.createdAt).toLocaleString('en-IN'),sale.cashierName,sale.payments.map((p: any) => p.method).join(' + '),(sale.total/100).toFixed(2)])
  const exportAll = (kind: 'csv'|'excel'|'pdf') => {
    const headers = ['Invoice','Date','Cashier','Payment','Total']
    if (kind === 'csv') downloadCsv('sales.csv', headers, exportRows)
    if (kind === 'excel') exportExcel('sales.xlsx', 'Sales', headers, exportRows)
    if (kind === 'pdf') exportPdf('sales.pdf', 'Sales History', headers, exportRows)
  }
  return <Page title="Sales" subtitle="Completed invoice history" actions={<><button className="secondary" onClick={() => exportAll('csv')}>CSV</button><button className="secondary" onClick={() => exportAll('excel')}>Excel</button><button className="secondary" onClick={() => exportAll('pdf')}>PDF</button></>}><div className="panel table-panel"><table><thead><tr>{['Invoice','Date','Cashier','Payment','Total','Action'].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{items.map((sale) => <tr key={sale.id}><td><strong>{sale.invoiceNumber}</strong></td><td>{new Date(sale.createdAt).toLocaleString('en-IN')}</td><td>{sale.cashierName}</td><td>{sale.payments.map((p: any) => p.method).join(' + ')}</td><td>₹{(sale.total/100).toFixed(2)}</td><td><button className="secondary" onClick={() => reprint(sale)}>Reprint</button></td></tr>)}</tbody></table>{items.length === 0 && <div className="empty-table">No sales found</div>}</div></Page>
}

export function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([])
  useEffect(() => { db.expenses.toArray().then(setItems) }, [])
  const add = async () => {
    const title = window.prompt('Expense title')
    const amount = Number(window.prompt('Amount (₹)') || 0)
    if (!title || amount <= 0) return
    const createdAt = new Date().toISOString()
    const id = crypto.randomUUID()
    await db.transaction('rw', db.expenses, db.syncQueue, async () => {
      await db.expenses.add({ id, title, category: 'Other operating expenses', amount: Math.round(amount * 100), date: createdAt.slice(0,10), paymentMethod: 'CASH', description: '', userId: 'admin-1', createdAt, syncStatus: 'pending' })
      await db.syncQueue.add({ id: crypto.randomUUID(), entityType: 'expense', entityId: id, status: 'pending', createdAt, attempts: 0 })
    })
    setItems(await db.expenses.toArray())
  }
  return <Page title="Expenses" subtitle="Operating expenses"><button className="primary" onClick={add}><Plus size={16}/> Add expense</button><DataTable headers={['Title','Date','Category','Payment','Amount']} rows={items.map((item) => [item.title,item.date,item.category,item.paymentMethod,`₹${(item.amount/100).toFixed(2)}`])}/></Page>
}
