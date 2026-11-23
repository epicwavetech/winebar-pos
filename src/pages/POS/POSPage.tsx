import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Trash2, Search, Barcode, CreditCard, Banknote, X } from 'lucide-react'
import { db } from '../../db/database'
import { useCartStore } from '../../stores/cartStore'
import { completeSale } from '../../services/saleService'
import type { Category, Product } from '../../types/models'
import { useAuthStore } from '../../stores/authStore'
import { printSale } from '../../services/printService'

export default function POSPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categoryId, setCategoryId] = useState('all')
  const [search, setSearch] = useState('')
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'OTHER'>('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [printReceipt, setPrintReceipt] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const cart = useCartStore()
  const authUser = useAuthStore((state) => state.user)

  useEffect(() => {
    const loadCatalog = () => {
      db.categories.where('active').equals(1).sortBy('sortOrder').then(setCategories)
      db.products.where('active').equals(1).toArray().then(setProducts)
    }
    loadCatalog()
    window.addEventListener('winebar:catalog-updated', loadCatalog)
    return () => window.removeEventListener('winebar:catalog-updated', loadCatalog)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'F4') { event.preventDefault(); cart.clear() }
      if (event.key === 'F8') { event.preventDefault(); setPaymentOpen(true) }
      if (event.key === 'Escape') setPaymentOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cart])

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = categoryId === 'all' || product.categoryId === categoryId
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || `${product.name} ${product.brand} ${product.barcode} ${product.sku}`.toLowerCase().includes(term)
    return matchesCategory && matchesSearch
  }), [products, categoryId, search])

  const addProduct = (product: Product) => {
    const error = cart.add({
      productId: product.id, name: product.name, brand: product.brand,
      bottleSize: product.bottleSize, barcode: product.barcode,
      unitPrice: product.sellingPrice, purchasePrice: product.purchasePrice,
      availableStock: product.currentStock,
    })
    setMessage(error || '')
  }

  const scanBarcode = () => {
    const code = barcode.trim()
    if (!code) return
    const product = products.find((value) => value.barcode === code)
    if (!product) { setMessage('Barcode not found or product is inactive'); setBarcode(''); return }
    addProduct(product)
    setBarcode('')
  }

  const checkout = async () => {
    if (!cart.items.length) { setMessage('Add at least one product'); return }
    const total = cart.total()
    const paid = method === 'CASH' ? Number(cashReceived || 0) * 100 : total
    if (paid < total) { setMessage(`Payment short by ₹${((total - paid) / 100).toFixed(2)}`); return }
    try {
      const sale = await completeSale({
        items: cart.items,
        cashierId: authUser?.id || 'cashier-1',
        cashierName: authUser?.name || 'Cashier',
        payments: [{ method, amount: paid }],
        cashReceived: paid,
      })
      if (printReceipt) {
        printSale(sale, cart.items.map((item) => ({
          id: crypto.randomUUID(), saleId: sale.id, productId: item.productId,
          productName: item.name, bottleSize: item.bottleSize, quantity: item.quantity,
          unitPrice: item.unitPrice, purchasePrice: item.purchasePrice, discount: item.discount,
          tax: 0, total: item.unitPrice * item.quantity - item.discount,
        })), '80mm')
      }
      setPaymentOpen(false)
      setCartOpen(false)
      setCashReceived('')
      cart.clear()
      setMessage('Sale completed successfully')
      db.products.where('active').equals(1).toArray().then(setProducts)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sale could not be completed')
    }
  }

  const subtotal = cart.subtotal()
  const total = cart.total()
  const cashValue = Number(cashReceived || 0) * 100

  return (
    <div className="pos-layout">
      <aside className="pos-categories">
        <button className={categoryId === 'all' ? 'category-chip active' : 'category-chip'} onClick={() => setCategoryId('all')}>
          <span>All</span><small>{products.length}</small>
        </button>
        {categories.map((category) => (
          <button key={category.id} className={categoryId === category.id ? 'category-chip active' : 'category-chip'} onClick={() => setCategoryId(category.id)}>
            <span className="category-dot" style={{ background: category.color }}>{category.icon}</span>
            <span>{category.name}</span>
          </button>
        ))}
      </aside>

      <section className="pos-products">
        <div className="pos-search">
          <div className="search-box"><Search size={18} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, brand, barcode or SKU (F2)" /></div>
          <div className="barcode-box"><Barcode size={18} /><input value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && scanBarcode()} placeholder="Scan barcode" /></div>
        </div>
        {message && <div className="toast">{message}<button onClick={() => setMessage('')}><X size={14} /></button></div>}
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <button className="product-card" key={product.id} onClick={() => addProduct(product)}>
              <div className="product-image"><span>{product.brand.slice(0, 2).toUpperCase()}</span></div>
              <div className="product-card-body">
                <strong>{product.name}</strong><small>{product.brand} · {product.bottleSize}</small>
                <div><b>₹{(product.sellingPrice / 100).toFixed(2)}</b><span className={product.currentStock <= product.minimumStock ? 'stock low' : 'stock'}>{product.currentStock} left</span></div>
              </div>
            </button>
          ))}
        </div>
        <button className="mobile-cart-button" onClick={() => setCartOpen(true)}>
          <span>View bill · {cart.items.length} items</span>
          <strong>₹{(total / 100).toFixed(2)}</strong>
        </button>
      </section>

      <aside className={`cart-panel${cartOpen ? ' cart-open' : ''}`}>
        <div className="cart-header"><div><strong>Current Bill</strong><small>{cart.items.length} items</small></div><div><button onClick={() => cart.clear()} disabled={!cart.items.length}>Clear</button><button className="mobile-cart-close" onClick={() => setCartOpen(false)} aria-label="Close bill"><X size={18}/></button></div></div>
        <div className="cart-items">
          {cart.items.length === 0 && <div className="cart-empty"><ShoppingIcon /><strong>No items yet</strong><small>Select a product to begin</small></div>}
          {cart.items.map((item) => (
            <div className="cart-item" key={item.productId}>
              <div className="cart-item-top"><div><strong>{item.name}</strong><small>{item.bottleSize} · ₹{(item.unitPrice / 100).toFixed(2)}</small></div><button className="remove" onClick={() => cart.remove(item.productId)}><Trash2 size={15} /></button></div>
              <div className="cart-item-bottom">
                <div className="quantity">
                  <button onClick={() => cart.setQuantity(item.productId, item.quantity - 1)}><Minus size={14} /></button>
                  <span>{item.quantity}</span>
                  <button onClick={() => cart.setQuantity(item.productId, item.quantity + 1)}><Plus size={14} /></button>
                </div>
                <strong>₹{((item.unitPrice * item.quantity - item.discount) / 100).toFixed(2)}</strong>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-summary">
          <div><span>Subtotal</span><strong>₹{(subtotal / 100).toFixed(2)}</strong></div>
          <div className="total-row"><span>Total</span><strong>₹{(total / 100).toFixed(2)}</strong></div>
          <button className="checkout" onClick={() => setPaymentOpen(true)} disabled={!cart.items.length}><CreditCard size={18} /> Pay · ₹{(total / 100).toFixed(2)} <kbd>F8</kbd></button>
        </div>
      </aside>

      {paymentOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPaymentOpen(false)}>
          <div className="modal payment-modal">
            <div className="modal-header"><div><small>Collect payment</small><h2>₹{(total / 100).toFixed(2)}</h2></div><button onClick={() => setPaymentOpen(false)}><X size={20} /></button></div>
            <div className="payment-methods">
              {(['CASH', 'UPI', 'CARD', 'OTHER'] as const).map((value) => (
                <button key={value} className={method === value ? 'active' : ''} onClick={() => setMethod(value)}>
                  {value === 'CASH' ? <Banknote /> : <CreditCard />}<span>{value}</span>
                </button>
              ))}
            </div>
            {method === 'CASH' && (
              <div className="payment-fields">
                <label>Amount received (₹)<input type="number" min="0" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} autoFocus /></label>
                <div className="change"><span>Change to return</span><strong>₹{(Math.max(0, cashValue - total) / 100).toFixed(2)}</strong></div>
              </div>
            )}
            <label className="print-option"><input type="checkbox" checked={printReceipt} onChange={(event) => setPrintReceipt(event.target.checked)} /> Print 80 mm receipt after sale</label>
            <button className="primary wide" onClick={checkout}>Complete sale</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShoppingIcon() {
  return <span className="empty-bag">□</span>
}
