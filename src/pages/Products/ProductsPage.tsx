import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Download, Upload, Pencil, Trash2, RotateCcw } from 'lucide-react'
import { db } from '../../db/database'
import type { Product, Category } from '../../types/models'
import * as XLSX from 'xlsx'
import { downloadCsv, exportExcel } from '../../services/exportService'
import { synchronizePending } from '../../services/syncService'
import { useAuthStore } from '../../stores/authStore'
import BarcodeScanner from '../../components/BarcodeScanner'

export default function ProductsPage() {
  const barcodeScannerRef = useRef<() => void>(() => {})
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', brand: '', categoryId: '', bottleSize: '750 ml', barcode: '', sku: '', purchasePrice: '', sellingPrice: '', mrp: '', openingStock: '' })
  const [importMessage, setImportMessage] = useState('')
  const currentUserId = useAuthStore((state) => state.user?.id || 'admin-1')

  const load = () => db.products.toArray().then(setProducts)
  useEffect(() => {
    const loadCatalog = () => {
      load()
      db.categories.toArray().then(setCategories)
    }
    loadCatalog()
    window.addEventListener('winebar:catalog-updated', loadCatalog)
    return () => window.removeEventListener('winebar:catalog-updated', loadCatalog)
  }, [])
  const syncAfterChange = (savedMessage: string) => {
    setImportMessage(`${savedMessage} Syncing…`)
    void synchronizePending().then((result) => {
      setImportMessage(result.error
        ? `${savedMessage} Sync failed: ${result.error}`
        : `${savedMessage} Shared with connected devices.`)
    }).catch((error: unknown) => {
      setImportMessage(`${savedMessage} Sync failed: ${error instanceof Error ? error.message : 'Server is unavailable'}`)
    })
  }

  const beginAdd = () => {
    setEditingProduct(null)
    setForm({ name: '', brand: '', categoryId: '', bottleSize: '750 ml', barcode: '', sku: '', purchasePrice: '', sellingPrice: '', mrp: '', openingStock: '' })
    setOpen(true)
  }

  const beginEdit = (product: Product) => {
    setEditingProduct(product)
    setForm({
      name: product.name,
      brand: product.brand,
      categoryId: product.categoryId,
      bottleSize: product.bottleSize,
      barcode: product.barcode,
      sku: product.sku,
      purchasePrice: (product.purchasePrice / 100).toFixed(2),
      sellingPrice: (product.sellingPrice / 100).toFixed(2),
      mrp: (product.mrp / 100).toFixed(2),
      openingStock: String(product.openingStock),
    })
    setOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const now = new Date().toISOString()
    const openingStock = editingProduct?.openingStock ?? Number(form.openingStock || 0)
    const product: Product = {
      id: editingProduct?.id ?? crypto.randomUUID(), name: form.name, brand: form.brand, categoryId: form.categoryId,
      bottleSize: form.bottleSize, barcode: form.barcode, sku: form.sku,
      purchasePrice: Math.round(Number(form.purchasePrice) * 100),
      sellingPrice: Math.round(Number(form.sellingPrice) * 100),
      mrp: Math.round(Number(form.mrp) * 100),
      taxRate: editingProduct?.taxRate ?? 0, openingStock,
      currentStock: editingProduct?.currentStock ?? openingStock,
      minimumStock: editingProduct?.minimumStock ?? 10,
      active: editingProduct?.active ?? true,
      createdAt: editingProduct?.createdAt ?? now,
      updatedAt: now,
    }
    await db.transaction('rw', db.products, db.inventoryTransactions, async () => {
      if (editingProduct) await db.products.put(product)
      else await db.products.add(product)
      if (!editingProduct && openingStock > 0) await db.inventoryTransactions.add({
        id: crypto.randomUUID(), reference: `OPEN-${product.sku}`, productId: product.id, productName: product.name,
        type: 'OPENING_STOCK', stockIn: openingStock, stockOut: 0, balance: openingStock,
        userId: currentUserId, createdAt: product.createdAt, syncStatus: 'pending',
      })
    })
    setOpen(false)
    setEditingProduct(null)
    load()
    syncAfterChange(editingProduct ? 'Product updated on this device.' : 'Product saved on this device.')
  }

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}? It will be hidden from sales and stock selection, but its history will be kept.`)) return
    await db.products.update(product.id, { active: false, updatedAt: new Date().toISOString() })
    await load()
    syncAfterChange('Product deleted from the active catalog.')
  }

  const restoreProduct = async (product: Product) => {
    await db.products.update(product.id, { active: true, updatedAt: new Date().toISOString() })
    await load()
    syncAfterChange('Product restored to the active catalog.')
  }

  const filtered = products.filter((product) => `${product.name} ${product.brand} ${product.barcode}`.toLowerCase().includes(search.toLowerCase()))
  const exportProducts = () => {
    const headers = ['name','brand','categoryId','bottleSize','barcode','sku','purchasePrice','sellingPrice','mrp','openingStock','minimumStock','active']
    const rows = filtered.map((product) => [product.name,product.brand,product.categoryId,product.bottleSize,product.barcode,product.sku,(product.purchasePrice/100).toFixed(2),(product.sellingPrice/100).toFixed(2),(product.mrp/100).toFixed(2),product.openingStock,product.minimumStock,product.active ? 'true' : 'false'])
    exportExcel('products.xlsx', 'Products', headers, rows)
  }
  const exportCsv = () => {
    const headers = ['name','brand','categoryId','bottleSize','barcode','sku','purchasePrice','sellingPrice','mrp','openingStock','minimumStock','active']
    const rows = filtered.map((product) => [product.name,product.brand,product.categoryId,product.bottleSize,product.barcode,product.sku,(product.purchasePrice/100).toFixed(2),(product.sellingPrice/100).toFixed(2),(product.mrp/100).toFixed(2),product.openingStock,product.minimumStock,product.active ? 'true' : 'false'])
    downloadCsv('products.csv', headers, rows)
  }
  const importProducts = async (file?: File) => {
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
      let added = 0
      await db.transaction('rw', db.products, db.inventoryTransactions, async () => {
        for (const row of rows) {
          if (!row.name || !row.barcode) continue
          const openingStock = Number(row.openingStock || 0)
          const categoryId = row.categoryId || categories[0]?.id || 'cat-other'
          const product: Product = {
            id: crypto.randomUUID(), name: String(row.name), brand: String(row.brand || ''),
            categoryId, bottleSize: String(row.bottleSize || '750 ml'), barcode: String(row.barcode),
            sku: String(row.sku || row.barcode), purchasePrice: Math.round(Number(row.purchasePrice || 0) * 100),
            sellingPrice: Math.round(Number(row.sellingPrice || 0) * 100), mrp: Math.round(Number(row.mrp || row.sellingPrice || 0) * 100),
            taxRate: 0, openingStock, currentStock: openingStock, minimumStock: Number(row.minimumStock || 10),
            active: String(row.active || 'true').toLowerCase() !== 'false',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          }
          await db.products.add(product)
          if (openingStock > 0) await db.inventoryTransactions.add({
            id: crypto.randomUUID(), reference: `IMPORT-${product.sku}`, productId: product.id,
            productName: product.name, type: 'OPENING_STOCK', stockIn: openingStock, stockOut: 0,
            balance: openingStock, userId: currentUserId, createdAt: product.createdAt, syncStatus: 'pending',
          })
          added++
        }
      })
      setImportMessage(`${added} products imported`)
      load()
      syncAfterChange(`${added} products saved on this device.`)
    } catch {
      setImportMessage('Import failed. Check the CSV or Excel columns.')
    }
  }
  return (
    <div>
      <div className="page-heading"><div><h1>Products</h1><p>{products.length} active and inactive products</p></div><div className="heading-actions"><label className="secondary file-button"><Upload size={16}/> Import<input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => importProducts(event.target.files?.[0])}/></label><button className="secondary" onClick={exportCsv}><Download size={16}/> CSV</button><button className="secondary" onClick={exportProducts}><Download size={16}/> Excel</button><button className="primary" onClick={beginAdd}><Plus size={17}/> Add product</button></div></div>
      {importMessage && <div className="toast static-toast">{importMessage}<button onClick={() => setImportMessage('')}>×</button></div>}
      <div className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products"/></div></div>
        <table><thead><tr><th>Product</th><th>Brand</th><th>Size</th><th>Barcode</th><th>Purchase</th><th>MRP</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{filtered.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.brand}</td><td>{product.bottleSize}</td><td>{product.barcode}</td><td>₹{(product.purchasePrice / 100).toFixed(2)}</td><td>₹{(product.mrp / 100).toFixed(2)}</td><td><span className={product.currentStock <= product.minimumStock ? 'badge danger' : 'badge'}>{product.currentStock}</span></td><td><span className={product.active ? 'badge success' : 'badge'}>{product.active ? 'Active' : 'Inactive'}</span></td><td><div className="row-actions"><button className="secondary" onClick={() => beginEdit(product)} aria-label={`Edit ${product.name}`} title="Edit"><Pencil size={14}/></button>{product.active ? <button className="secondary danger-action" onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`} title="Delete"><Trash2 size={14}/></button> : <button className="secondary" onClick={() => restoreProduct(product)} aria-label={`Restore ${product.name}`} title="Restore"><RotateCcw size={14}/></button>}</div></td></tr>)}</tbody>
        </table>
      </div>
      {open && <div className="modal-backdrop"><form className="modal form-modal" onSubmit={save}><div className="modal-header"><h2>{editingProduct ? 'Edit product' : 'Add product'}</h2><button type="button" onClick={() => { setOpen(false); setEditingProduct(null) }}>×</button></div>
        <div className="form-grid">
          {(['name','brand'] as const).map((field) => <label key={field}>{field.replace(/([A-Z])/g,' $1').replace(/^./, (s) => s.toUpperCase())}<input required={field === 'name'} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })}/></label>)}
          <label>Barcode
            <div className="barcode-input-row">
              <input required inputMode="none" value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} onClick={(event) => {
                if (window.matchMedia('(max-width: 760px)').matches) {
                  event.preventDefault()
                  barcodeScannerRef.current()
                }
              }}/>
              <BarcodeScanner
                onScan={(barcode) => setForm((current) => ({ ...current, barcode }))}
                onOpenScannerReady={(openScanner) => { barcodeScannerRef.current = openScanner }}
                buttonLabel="Scan"
              />
            </div>
          </label>
          {(['sku','bottleSize','purchasePrice','sellingPrice','mrp'] as const).map((field) => <label key={field}>{field.replace(/([A-Z])/g,' $1').replace(/^./, (s) => s.toUpperCase())}<input type={['purchasePrice','sellingPrice','mrp'].includes(field) ? 'number' : 'text'} step={['purchasePrice','sellingPrice','mrp'].includes(field) ? '0.01' : undefined} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })}/></label>)}
          {!editingProduct && <label>Opening Stock<input type="number" value={form.openingStock} onChange={(event) => setForm({ ...form, openingStock: event.target.value })}/></label>}
          <label>Category<select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Select category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        </div><button className="primary wide">{editingProduct ? 'Save changes' : 'Save product'}</button></form></div>}
    </div>
  )
}
