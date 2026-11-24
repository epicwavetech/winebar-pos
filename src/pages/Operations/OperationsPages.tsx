import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { db } from '../../db/database'
import { Page, DataTable } from '../../components/ui/Shared'
import type { CostFormulaConfig, Expense, Product, Purchase, PurchaseItem } from '../../types/models'
import { EMPTY_COST_FORMULA, EMPTY_INVOICE_COST_DRAFT, buildInvoiceValues, calculatePurchaseCost, hasInvoiceQuantity, invoiceQuantity, isValidInvoiceDraft, type InvoiceCostDraft } from '../../services/costingService'
import { InvoiceCostFields } from '../../components/costing/InvoiceCostFields'
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
  const [items, setItems] = useState<{ productId: string; invoice: InvoiceCostDraft }[]>([])
  const [formula, setFormula] = useState<CostFormulaConfig>(EMPTY_COST_FORMULA)
  const [message, setMessage] = useState('')
  const userId = useAuthStore((state) => state.user?.id || 'admin-1')
  useEffect(() => {
    db.products.toArray().then((items) => setProducts(items.filter((item) => item.active)))
    db.settings.get('costFormula').then((value) => value && setFormula({ ...EMPTY_COST_FORMULA, ...value, components: value.components || {} }))
  }, [])
  const addLine = () => setItems([...items, { productId: '', invoice: { ...EMPTY_INVOICE_COST_DRAFT } }])
  const updateLine = (index: number, patch: Partial<{ productId: string; invoice: InvoiceCostDraft }>) => {
    setItems((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, ...patch } : item))
  }
  const chooseProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId)
    const draft = { ...EMPTY_INVOICE_COST_DRAFT }
    if (product) {
      draft.bottleSizeMl = String(Number.parseInt(product.bottleSize, 10) || '')
      draft.mrpPerBottle = (product.mrp / 100).toFixed(2)
    }
    updateLine(index, { productId, invoice: draft })
  }
  const save = async () => {
    if (!items.length || items.some((item) => !item.productId || !isValidInvoiceDraft(item.invoice) || invoiceQuantity(item.invoice) < 1)) {
      setMessage('Select a product, enter a valid whole-bottle quantity, and provide bottles per case when cases are entered.')
      return
    }
    const id = crypto.randomUUID()
    const reference = `SI-${Date.now().toString().slice(-8)}`
    const createdAt = new Date().toISOString()
    try {
      await db.transaction('rw', [db.products, db.purchases, db.inventoryTransactions, db.syncQueue], async () => {
        const purchaseItems: PurchaseItem[] = []
        let total = 0
        let costStatus: Purchase['costStatus'] = 'verified'
        for (const line of items) {
          const product = await db.products.get(line.productId)
          if (!product) throw new Error('A selected product is no longer available')
          const quantity = invoiceQuantity(line.invoice)
          const invoiceValues = buildInvoiceValues(line.invoice, product.brand, product.bottleSize, product.mrp, quantity)
          const calculation = calculatePurchaseCost(invoiceValues, formula)
          if (calculation.status === 'pending') costStatus = 'pending'
          total += calculation.acquisitionCost ?? 0
          purchaseItems.push({
            id: crypto.randomUUID(),
            purchaseId: id,
            productId: product.id,
            productName: product.name,
            bottleSize: product.bottleSize,
            quantity,
            purchaseRate: calculation.costPerBottle ?? 0,
            acquisitionCost: calculation.acquisitionCost,
            costStatus: calculation.status,
            costSource: calculation.source,
            invoiceValues,
            formulaSnapshot: calculation.source === 'configured-formula' ? formula : undefined,
          })
          const balance = product.currentStock + quantity
          await db.products.update(product.id, {
            currentStock: balance,
            purchasePrice: calculation.costPerBottle ?? 0,
            purchasePriceStatus: calculation.status,
            purchasePriceSource: calculation.source,
            updatedAt: createdAt,
          })
          await db.inventoryTransactions.add({
            id: crypto.randomUUID(), reference, productId: product.id, productName: product.name,
            type: 'PURCHASE_IN', stockIn: quantity, stockOut: 0, balance, userId, createdAt, syncStatus: 'pending',
          })
        }
        const purchase: Purchase = { id, reference, createdAt, supplierNote: 'Invoice details stored per product batch', total, costStatus, userId, items: purchaseItems, syncStatus: 'pending' }
        await db.purchases.add(purchase)
        await db.syncQueue.add({ id: crypto.randomUUID(), entityType: 'purchase', entityId: id, status: 'pending', createdAt, attempts: 0 })
      })
      setItems([])
      setMessage('Stock received. Any line without a verified cost basis remains pending verification.')
      setProducts((await db.products.toArray()).filter((item) => item.active))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Stock-in could not be saved')
    }
  }
  return <Page title="Stock In" subtitle="Receive inventory with the original permit and purchase invoice values"><div className="heading-actions"><button className="primary" onClick={addLine}><Plus size={16}/> Add product</button></div>
    <div className="panel stock-form">{message && <p className="settings-note" role="status">{message}</p>}
      {items.map((item, index) => {
        const product = products.find((value) => value.id === item.productId)
        return <div className="stock-batch" key={index}>
          <div className="stock-batch-heading"><strong>Product batch {index + 1}</strong><button className="secondary" type="button" onClick={() => setItems((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove product batch ${index + 1}`}><Trash2 size={15}/></button></div>
          <label>Product<select value={item.productId} onChange={(event) => chooseProduct(index, event.target.value)}><option value="">Select product</option>{products.map((value) => <option value={value.id} key={value.id}>{value.name} · {value.bottleSize}</option>)}</select></label>
          {product && <InvoiceCostFields draft={item.invoice} onChange={(invoice) => updateLine(index, { invoice })} brandName={product.brand} bottleSize={product.bottleSize} mrp={product.mrp} formula={formula}/>}
        </div>
      })}
      {items.length > 0 && <button className="primary" onClick={save}>Confirm stock in</button>}
    </div>
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
  const [selected, setSelected] = useState<Purchase | null>(null)
  const [formula, setFormula] = useState<CostFormulaConfig>(EMPTY_COST_FORMULA)
  const [editingBatch, setEditingBatch] = useState<{
    purchaseId: string
    itemId: string
    brandName: string
    bottleSize: string
    mrp: number
    draft: InvoiceCostDraft
  } | null>(null)
  const [editMessage, setEditMessage] = useState('')
  const isAdmin = useAuthStore((state) => state.user?.role === 'ADMIN')
  const loadPurchases = async () => {
    const purchases = await db.purchases.reverse().toArray()
    setItems(purchases)
    return purchases
  }
  useEffect(() => {
    let disposed = false
    const load = async () => {
      const [purchases, value] = await Promise.all([
        db.purchases.reverse().toArray(),
        db.settings.get('costFormula'),
      ])
      if (disposed) return
      setItems(purchases)
      if (value) setFormula({ ...EMPTY_COST_FORMULA, ...value, components: value.components || {} })
    }
    void load().catch((error: unknown) => {
      if (!disposed) setEditMessage(`Could not load purchase history: ${error instanceof Error ? error.message : 'Storage error'}`)
    })
    return () => { disposed = true }
  }, [])
  const beginBatchEdit = async (purchase: Purchase, item: PurchaseItem) => {
    const product = await db.products.get(item.productId)
    const originalInputs = item.invoiceValues?.originalInputs
    const draft = { ...EMPTY_INVOICE_COST_DRAFT, ...originalInputs }
    if (!hasInvoiceQuantity(draft)) draft.looseBottles = String(item.quantity)
    setEditingBatch({
      purchaseId: purchase.id,
      itemId: item.id,
      brandName: item.invoiceValues?.brandName || product?.brand || '',
      bottleSize: item.bottleSize,
      mrp: item.invoiceValues?.mrpPerBottle ?? product?.mrp ?? 0,
      draft,
    })
    setEditMessage('')
  }
  const saveBatchEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingBatch || !isValidInvoiceDraft(editingBatch.draft)) {
      setEditMessage('Enter valid non-negative invoice values and whole bottle/case quantities.')
      return
    }
    const purchase = await db.purchases.get(editingBatch.purchaseId)
    const item = purchase?.items.find((value) => value.id === editingBatch.itemId)
    if (!purchase || !item) {
      setEditMessage('This purchase batch could not be found. Refresh the Purchases page and try again.')
      return
    }
    if (invoiceQuantity(editingBatch.draft) !== item.quantity) {
      setEditMessage(`The invoice quantity must remain ${item.quantity} bottles. Use Stock Adjustment to change recorded stock quantity.`)
      return
    }
    const invoiceValues = buildInvoiceValues(
      editingBatch.draft,
      editingBatch.brandName,
      editingBatch.bottleSize,
      editingBatch.mrp,
      item.quantity,
    )
    const calculation = calculatePurchaseCost(invoiceValues, formula)
    const updatedItems = purchase.items.map((value) => value.id === item.id ? {
      ...value,
      purchaseRate: calculation.costPerBottle ?? 0,
      acquisitionCost: calculation.acquisitionCost,
      costStatus: calculation.status,
      costSource: calculation.source,
      invoiceValues,
      formulaSnapshot: calculation.source === 'configured-formula' ? formula : undefined,
    } : value)
    const total = updatedItems.reduce((sum, value) => sum + (value.acquisitionCost ?? 0), 0)
    const costStatus = updatedItems.every((value) => value.costStatus === 'verified') ? 'verified' : 'pending'
    const updatedAt = new Date().toISOString()
    try {
      await db.transaction('rw', db.products, db.purchases, db.syncQueue, async () => {
        await db.purchases.update(purchase.id, {
          items: updatedItems,
          total,
          costStatus,
          syncStatus: 'pending',
        })
        const allPurchases = await db.purchases.toArray()
        const latestPurchase = allPurchases
          .filter((entry) => entry.items.some((entryItem) => entryItem.productId === item.productId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        const latestItem = latestPurchase?.items.find((entryItem) => entryItem.productId === item.productId)
        if (latestItem?.id === item.id) {
          await db.products.update(item.productId, {
            purchasePrice: calculation.costPerBottle ?? 0,
            purchasePriceStatus: calculation.status,
            purchasePriceSource: calculation.source,
            updatedAt,
          })
        }
        const queued = await db.syncQueue.where('entityType').equals('purchase')
          .and((entry) => entry.entityId === purchase.id && entry.status !== 'synced')
          .first()
        if (queued) {
          await db.syncQueue.update(queued.id, { status: 'pending', lastError: undefined })
        } else {
          await db.syncQueue.add({
            id: crypto.randomUUID(),
            entityType: 'purchase',
            entityId: purchase.id,
            status: 'pending',
            createdAt: updatedAt,
            attempts: 0,
          })
        }
      })
      const purchases = await loadPurchases()
      setSelected(purchases.find((value) => value.id === purchase.id) || null)
      setEditingBatch(null)
      setEditMessage('')
    } catch (error) {
      setEditMessage(`Could not save invoice changes: ${error instanceof Error ? error.message : 'Storage error'}`)
    }
  }
  return <Page title="Purchases" subtitle="Stock-in history and invoice verification — Admin can edit a batch from Review values">
    <div className="panel table-panel"><table><thead><tr>{['Reference','Date','Verified cost','Cost status','Sync','Invoice'].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>
      {items.map((item) => <tr key={item.id}>
        <td><strong>{item.reference}</strong></td>
        <td>{new Date(item.createdAt).toLocaleString('en-IN')}</td>
        <td>{item.costStatus === 'verified' ? `₹${(item.total/100).toFixed(2)}` : '—'}</td>
        <td>{item.costStatus === 'verified' ? 'Verified' : 'Pending verification'}</td>
        <td>{item.syncStatus}</td>
        <td><button className="secondary" onClick={() => setSelected(item)}>Review values</button></td>
      </tr>)}
    </tbody></table>{items.length === 0 && <div className="empty-table">No purchase batches recorded</div>}</div>
    {selected && <div className="panel invoice-audit-panel">
      <div className="stock-batch-heading"><h2>{selected.reference} · Original invoice values</h2><button className="secondary" onClick={() => setSelected(null)}>Close</button></div>
      {selected.items.map((item) => <section className="invoice-audit-item" key={item.id}>
        <strong>{item.productName} · {item.bottleSize}</strong>
        <p>Quantity: {item.quantity} bottles · CP: {item.costStatus === 'verified' ? `₹${(item.purchaseRate/100).toFixed(2)} per bottle · Total purchase cost ₹${((item.acquisitionCost ?? 0)/100).toFixed(2)} (${item.costSource})` : 'Pending verification'}</p>
        {isAdmin && <button className="secondary" onClick={() => void beginBatchEdit(selected, item)}>Edit / verify invoice</button>}
        {item.costStatus === 'verified' && item.invoiceValues && (() => {
          const profitLoss = item.invoiceValues.mrpPerBottle - item.purchaseRate
          const percentage = item.purchaseRate > 0 ? profitLoss / item.purchaseRate * 100 : undefined
          return <p className={profitLoss < 0 ? 'loss-warning' : ''}>
            MRP: ₹{(item.invoiceValues.mrpPerBottle/100).toFixed(2)} · Profit/loss: ₹{(profitLoss/100).toFixed(2)} per bottle
            {percentage === undefined ? '' : ` · ${percentage.toFixed(2)}%`}
            {profitLoss < 0 ? ' · LOSS' : ''}
          </p>
        })()}
        {item.invoiceValues ? <div className="invoice-audit-grid">
          <span>Brand Name: {item.invoiceValues.brandName}</span>
          <span>Case: {item.invoiceValues.originalInputs.numberOfCases || 'Not provided'}</span>
          <span>Btls: {item.invoiceValues.originalInputs.looseBottles || 'Not provided'}</span>
          <span>ML: {item.invoiceValues.bottleSizeMl}</span>
          <span>BL: {(item.invoiceValues.totalBottles * item.invoiceValues.bottleSizeMl / 1000).toFixed(2)} (calculated)</span>
          <span>Bottles per case (stock calculation): {item.invoiceValues.originalInputs.bottlesPerCase || 'Not provided'}</span>
          <span>MRP: {item.invoiceValues.originalInputs.mrpPerBottle || 'Not provided'} per bottle</span>
          <span>Total MRP: {item.invoiceValues.originalInputs.invoiceTotalMrp || `₹${(item.invoiceValues.calculatedTotalMrp/100).toFixed(2)} (calculated)`}</span>
          <span>Ad Valorem: {item.invoiceValues.originalInputs.adValorem || 'Not provided'}</span>
          <span>VAT Amount: {item.invoiceValues.originalInputs.vatAmount || 'Not provided'}</span>
          <span>TPF Amount: {item.invoiceValues.originalInputs.tpfAmount || 'Not provided'}</span>
          <span>Other Charges: {item.invoiceValues.originalInputs.otherCharges || 'Not provided'}</span>
          <span>Discount: {item.invoiceValues.originalInputs.discount || 'Not provided'}</span>
          <span>Actual Invoice Payable: {item.invoiceValues.originalInputs.actualInvoicePayable || 'Not provided'}</span>
          <span>Formula used: {item.costSource === 'configured-formula' ? item.formulaSnapshot?.verifiedReference || 'Configured formula' : 'None'}</span>
        </div> : <p>No invoice details were retained for this older purchase record.</p>}
      </section>)}
    </div>}
    {editingBatch && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingBatch(null)}>
      <form className="modal form-modal" onSubmit={(event) => void saveBatchEdit(event)}>
        <div className="modal-header"><div><small>Admin verification</small><h2>Edit purchase invoice</h2></div><button type="button" onClick={() => setEditingBatch(null)} aria-label="Close">×</button></div>
        <p className="settings-note">Recorded stock quantity is locked by validation. Correct invoice fields here; use Stock Adjustment for quantity changes. CP becomes verified only from actual invoice payable or the configured verified formula.</p>
        <label>Brand Name<input value={editingBatch.brandName} onChange={(event) => setEditingBatch({ ...editingBatch, brandName: event.target.value })}/></label>
        <InvoiceCostFields
          draft={editingBatch.draft}
          onChange={(draft) => setEditingBatch({ ...editingBatch, draft })}
          brandName={editingBatch.brandName}
          bottleSize={editingBatch.bottleSize}
          mrp={editingBatch.mrp}
          formula={formula}
        />
        {editMessage && <p className="cost-warning" role="alert">{editMessage}</p>}
        <button className="primary wide" type="submit">Save and recalculate CP</button>
      </form>
    </div>}
  </Page>
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
  const exportRows = items.map((sale) => [sale.invoiceNumber,new Date(sale.createdAt).toLocaleString('en-IN'),sale.cashierName,sale.customerName || '',sale.payments.map((p: any) => p.method).join(' + '),(sale.total/100).toFixed(2)])
  const exportAll = (kind: 'csv'|'excel'|'pdf') => {
    const headers = ['Invoice','Date','Cashier','Customer','Payment','Total']
    if (kind === 'csv') downloadCsv('sales.csv', headers, exportRows)
    if (kind === 'excel') exportExcel('sales.xlsx', 'Sales', headers, exportRows)
    if (kind === 'pdf') exportPdf('sales.pdf', 'Sales History', headers, exportRows)
  }
  return <Page title="Sales" subtitle="Completed invoice history" actions={<><button className="secondary" onClick={() => exportAll('csv')}>CSV</button><button className="secondary" onClick={() => exportAll('excel')}>Excel</button><button className="secondary" onClick={() => exportAll('pdf')}>PDF</button></>}><div className="panel table-panel"><table><thead><tr>{['Invoice','Date','Cashier','Customer','Payment','Total','Action'].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{items.map((sale) => <tr key={sale.id}><td><strong>{sale.invoiceNumber}</strong></td><td>{new Date(sale.createdAt).toLocaleString('en-IN')}</td><td>{sale.cashierName}</td><td>{sale.customerName || '—'}</td><td>{sale.payments.map((p: any) => p.method).join(' + ')}</td><td>₹{(sale.total/100).toFixed(2)}</td><td><button className="secondary" onClick={() => reprint(sale)}>Reprint</button></td></tr>)}</tbody></table>{items.length === 0 && <div className="empty-table">No sales found</div>}</div></Page>
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
