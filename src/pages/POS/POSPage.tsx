import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Trash2, Search, Barcode, CreditCard, Banknote, X } from 'lucide-react'
import { db } from '../../db/database'
import { useCartStore } from '../../stores/cartStore'
import { completeSale } from '../../services/saleService'
import type { Category, Customer, Product, SalePaymentMethod } from '../../types/models'
import { useAuthStore } from '../../stores/authStore'
import { printSale } from '../../services/printService'
import BarcodeScanner from '../../components/BarcodeScanner'
import { formatRupees, productCostMetrics } from '../../services/costingService'

export default function POSPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categoryId, setCategoryId] = useState('all')
  const [search, setSearch] = useState('')
  const [barcode, setBarcode] = useState('')
  const [message, setMessage] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [method, setMethod] = useState<SalePaymentMethod>('CASH')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [billDiscountMode, setBillDiscountMode] = useState<'none' | 'percentage' | 'amount'>('none')
  const [billDiscountInput, setBillDiscountInput] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [printReceipt, setPrintReceipt] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const barcodeScannerRef = useRef<() => void>(() => {})
  const cart = useCartStore()
  const authUser = useAuthStore((state) => state.user)
  const clearCart = useCallback(() => {
    cart.clear()
    setBillDiscountMode('none')
    setBillDiscountInput('')
  }, [cart])

  useEffect(() => {
    let disposed = false
    let loadId = 0
    const loadCatalog = async () => {
      const currentLoadId = ++loadId
      const [categoryItems, productItems] = await Promise.all([
        db.categories.toArray(),
        db.products.toArray(),
      ])
      if (disposed || currentLoadId !== loadId) return
      setCategories(categoryItems.filter((item) => item.active).sort((a, b) => a.sortOrder - b.sortOrder))
      setProducts(productItems.filter((item) => item.active))
    }
    const refreshCatalog = () => {
      void loadCatalog().catch((error: unknown) => {
        if (!disposed) setMessage(error instanceof Error ? `Could not load products: ${error.message}` : 'Could not load products')
      })
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCatalog()
    }
    refreshCatalog()
    window.addEventListener('winebar:catalog-updated', refreshCatalog)
    window.addEventListener('focus', refreshCatalog)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      disposed = true
      window.removeEventListener('winebar:catalog-updated', refreshCatalog)
      window.removeEventListener('focus', refreshCatalog)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const loadCustomers = () => {
      void db.customers.toArray().then((items) => {
        if (!disposed) setCustomers(items.sort((a, b) => a.name.localeCompare(b.name)))
      }).catch((error: unknown) => {
        if (!disposed) setMessage(error instanceof Error ? `Could not load customer accounts: ${error.message}` : 'Could not load customer accounts')
      })
    }
    loadCustomers()
    window.addEventListener('winebar:customers-updated', loadCustomers)
    return () => {
      disposed = true
      window.removeEventListener('winebar:customers-updated', loadCustomers)
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia('(min-width: 761px)').matches) barcodeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'F4') { event.preventDefault(); clearCart() }
      if (event.key === 'F8') { event.preventDefault(); setPaymentOpen(true) }
      if (event.key === 'Escape') setPaymentOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cart, clearCart])

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = categoryId === 'all' || product.categoryId === categoryId
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || `${product.name} ${product.brand} ${product.barcode} ${product.sku}`.toLowerCase().includes(term)
    return matchesCategory && matchesSearch
  }), [products, categoryId, search])

  const addProduct = useCallback((product: Product) => {
    const error = cart.add({
      productId: product.id, name: product.name, brand: product.brand,
      bottleSize: product.bottleSize, barcode: product.barcode,
      unitPrice: product.sellingPrice, purchasePrice: product.purchasePriceStatus === 'verified' ? product.purchasePrice : 0,
      purchasePriceStatus: product.purchasePriceStatus === 'verified' ? 'verified' : 'pending',
      availableStock: product.currentStock,
    })
    setMessage(error || '')
  }, [cart])

  const subtotal = cart.subtotal()
  const itemDiscountTotal = cart.items.reduce((sum, item) => sum + item.discountPerBottle * item.quantity, 0)
  const subtotalAfterItemDiscounts = subtotal - itemDiscountTotal
  const selectedCustomer = customers.find((customer) => customer.id === customerId)
  const discountInputValue = Number(billDiscountInput)
  const billDiscount = billDiscountMode === 'percentage'
    ? Math.min(subtotalAfterItemDiscounts, Number.isFinite(discountInputValue)
      ? Math.round(subtotalAfterItemDiscounts * Math.min(100, Math.max(0, discountInputValue)) / 100)
      : 0)
    : billDiscountMode === 'amount'
      ? Math.min(subtotalAfterItemDiscounts, Number.isFinite(discountInputValue)
        ? Math.max(0, Math.round(discountInputValue * 100))
        : 0)
      : 0
  const total = subtotalAfterItemDiscounts - billDiscount

  const handleBarcode = useCallback((value: string) => {
    const code = value.trim()
    if (!code) return
    const product = products.find((item) => item.barcode === code)
    if (!product) setMessage('Barcode not found or product is inactive')
    else addProduct(product)
    setBarcode('')
  }, [products, addProduct])

  const scanBarcode = useCallback(() => {
    handleBarcode(barcode)
    barcodeRef.current?.focus()
  }, [barcode, handleBarcode])

  useEffect(() => {
    if (!barcode) return
    const timer = window.setTimeout(scanBarcode, 150)
    return () => window.clearTimeout(timer)
  }, [barcode, scanBarcode])

  const checkout = async () => {
    if (!cart.items.length) { setMessage('Add at least one product'); return }
    if (method === 'BTC' && !customerId) { setMessage('Select an existing customer account for Bill to Credit'); return }
    const cashTender = Math.round(Number(cashReceived || 0) * 100)
    if (method === 'CASH' && cashTender < total) { setMessage(`Payment short by ₹${((total - cashTender) / 100).toFixed(2)}`); return }
    try {
      const sale = await completeSale({
        items: cart.items,
        cashierId: authUser?.id || 'cashier-1',
        cashierName: authUser?.name || 'Cashier',
        customerId: method === 'BTC' ? customerId : undefined,
        billDiscount,
        payments: [{ method, amount: total }],
        cashReceived: method === 'CASH' ? cashTender : 0,
      })
      if (printReceipt) {
        const shop = await db.settings.get('shop')
        const saleItems = await db.saleItems.where('saleId').equals(sale.id).toArray()
        printSale(sale, saleItems, '80mm', {
          name: shop?.shopName || 'WineBar POS',
          address: shop?.address || '',
          phone: shop?.phone || '',
          gst: shop?.gst || '',
        })
      }
      setPaymentOpen(false)
      setCartOpen(false)
      setCashReceived('')
      setCustomerId('')
      setBillDiscountMode('none')
      setBillDiscountInput('')
      cart.clear()
      setMessage('Sale completed successfully')
      db.products.toArray().then((items) => setProducts(items.filter((item) => item.active)))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sale could not be completed')
    }
  }

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
          <div className="barcode-box" onClick={(event) => {
            if (window.matchMedia('(max-width: 760px)').matches) {
              event.preventDefault()
              barcodeScannerRef.current()
            }
          }}><Barcode size={18} /><input ref={barcodeRef} inputMode="none" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && scanBarcode()} placeholder="Scan barcode (auto add)" /></div>
          <BarcodeScanner onScan={handleBarcode} onOpenScannerReady={(openScanner) => { barcodeScannerRef.current = openScanner }} />
        </div>
        {message && <div className="toast">{message}<button onClick={() => setMessage('')}><X size={14} /></button></div>}
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <button className="product-card" key={product.id} onClick={() => addProduct(product)}>
              {(() => {
                const metrics = productCostMetrics(product)
                return <>
              <div className="product-image"><span>{product.brand.slice(0, 2).toUpperCase()}</span></div>
              <div className="product-card-body">
                <strong>{product.name}</strong><small>{product.brand} · {product.bottleSize}</small>
                <div><b>₹{(product.sellingPrice / 100).toFixed(2)}</b><span className={product.currentStock <= product.minimumStock ? 'stock low' : 'stock'}>{product.currentStock} left</span></div>
                <small className="product-cost-breakdown">MRP {formatRupees(product.mrp)} · CP {metrics.verified ? formatRupees(metrics.costPerBottle) : 'Pending'}</small>
                {metrics.verified && <small className={metrics.lossWarning ? 'product-cost-warning' : 'product-cost-profit'}>
                  {metrics.lossWarning ? 'LOSS WARNING · ' : ''}{formatRupees(metrics.profitLossPerBottle)} / bottle{metrics.profitPercentage === undefined ? '' : ` · ${metrics.profitPercentage.toFixed(2)}%`}
                </small>}
              </div>
                </>
              })()}
            </button>
          ))}
        </div>
        <button className="mobile-cart-button" onClick={() => setCartOpen(true)}>
          <span>View bill · {cart.items.length} items</span>
          <strong>₹{(total / 100).toFixed(2)}</strong>
        </button>
      </section>

      <aside className={`cart-panel${cartOpen ? ' cart-open' : ''}`}>
        <div className="cart-header"><div><strong>Current Bill</strong><small>{cart.items.length} items</small></div><div><button onClick={clearCart} disabled={!cart.items.length}>Clear</button><button className="mobile-cart-close" onClick={() => setCartOpen(false)} aria-label="Close bill"><X size={18}/></button></div></div>
        <div className="cart-items">
          {cart.items.length === 0 && <div className="cart-empty"><ShoppingIcon /><strong>No items yet</strong><small>Select a product to begin</small></div>}
          {cart.items.map((item) => (
            <div className="cart-item" key={item.productId}>
              <div className="cart-item-top"><div><strong>{item.name}</strong><small>{item.bottleSize} · ₹{(item.unitPrice / 100).toFixed(2)} · CP {item.purchasePriceStatus === 'verified' ? formatRupees(item.purchasePrice) : 'pending verification'}</small></div><button className="remove" onClick={() => cart.remove(item.productId)}><Trash2 size={15} /></button></div>
              <label className="cart-item-discount">Discount / bottle (₹)<input type="number" min="0" max={(item.unitPrice / 100).toFixed(2)} step="0.01" value={(item.discountPerBottle / 100).toFixed(2)} onChange={(event) => cart.setDiscountPerBottle(item.productId, Math.round(Number(event.target.value || 0) * 100))} /></label>
              <div className="cart-item-bottom">
                <div className="quantity">
                  <button onClick={() => cart.setQuantity(item.productId, item.quantity - 1)}><Minus size={14} /></button>
                  <span>{item.quantity}</span>
                  <button onClick={() => cart.setQuantity(item.productId, item.quantity + 1)}><Plus size={14} /></button>
                </div>
                <strong>₹{(((item.unitPrice - item.discountPerBottle) * item.quantity) / 100).toFixed(2)}</strong>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-summary">
          <div><span>Subtotal</span><strong>₹{(subtotal / 100).toFixed(2)}</strong></div>
          {itemDiscountTotal > 0 && <div><span>Bottle discounts</span><strong>-₹{(itemDiscountTotal / 100).toFixed(2)}</strong></div>}
          <label className="bill-discount">Bill discount
            <select value={billDiscountMode} onChange={(event) => {
              setBillDiscountMode(event.target.value as 'none' | 'percentage' | 'amount')
              setBillDiscountInput('')
            }}>
              <option value="none">No discount</option>
              <option value="percentage">Percentage</option>
              <option value="amount">Fixed amount</option>
            </select>
            {billDiscountMode !== 'none' && <input type="number" min="0" max={billDiscountMode === 'percentage' ? 100 : (subtotalAfterItemDiscounts / 100).toFixed(2)} step="0.01" value={billDiscountInput} onChange={(event) => setBillDiscountInput(event.target.value)} placeholder={billDiscountMode === 'percentage' ? 'Discount %' : 'Discount ₹'} />}
          </label>
          {billDiscount > 0 && <div><span>Bill discount</span><strong>-₹{(billDiscount / 100).toFixed(2)}</strong></div>}
          <div className="total-row"><span>Total</span><strong>₹{(total / 100).toFixed(2)}</strong></div>
          <button className="checkout" onClick={() => setPaymentOpen(true)} disabled={!cart.items.length}><CreditCard size={18} /> Pay · ₹{(total / 100).toFixed(2)} <kbd>F8</kbd></button>
        </div>
      </aside>

      {paymentOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPaymentOpen(false)}>
          <div className="modal payment-modal">
            <div className="modal-header"><div><small>Collect payment</small><h2>₹{(total / 100).toFixed(2)}</h2></div><button onClick={() => setPaymentOpen(false)}><X size={20} /></button></div>
            <div className="payment-methods">
              {(['CASH', 'UPI', 'CARD', 'OTHER', 'BTC'] as const).map((value) => (
                <button key={value} className={method === value ? 'active' : ''} onClick={() => setMethod(value)}>
                  {value === 'CASH' ? <Banknote /> : <CreditCard />}<span>{value === 'BTC' ? 'BTC · Credit' : value}</span>
                </button>
              ))}
            </div>
            {method === 'BTC' && (
              <div className="payment-fields">
                <label>Customer account<select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Select existing customer</option>
                  {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
                </select></label>
                {selectedCustomer && <p className="credit-note">Current amount owed: ₹{(selectedCustomer.creditBalance / 100).toFixed(2)}. After this sale: ₹{((selectedCustomer.creditBalance + total) / 100).toFixed(2)}.</p>}
                {!customers.length && <p className="credit-note">No customer accounts exist. Add one from Customers before using BTC.</p>}
              </div>
            )}
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
