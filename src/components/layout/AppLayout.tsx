import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, Tags, ArrowDownToLine, ArrowUpFromLine,
  SlidersHorizontal, Boxes, ReceiptText, WalletCards, CircleDollarSign,
  Settings, Users, BarChart3, Moon, Sun, Wifi, WifiOff,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore, canAccess } from '../../stores/authStore'
import { db } from '../../db/database'
import { synchronizePending } from '../../services/syncService'
import { RefreshCw } from 'lucide-react'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pos', label: 'POS / Billing', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/stock-in', label: 'Stock In', icon: ArrowDownToLine },
  { to: '/stock-out', label: 'Stock Out', icon: ArrowUpFromLine },
  { to: '/adjustment', label: 'Adjustment', icon: SlidersHorizontal },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/purchases', label: 'Purchases', icon: ReceiptText },
  { to: '/sales', label: 'Sales', icon: CircleDollarSign },
  { to: '/expenses', label: 'Expenses', icon: WalletCards },
  { to: '/settlement', label: 'Settlement', icon: WalletCards },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout() {
  const [online, setOnline] = useState(navigator.onLine)
  const [dark, setDark] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [pending, setPending] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')
  useEffect(() => { db.syncQueue.where('status').equals('pending').count().then(setPending) }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const syncNow = async () => {
    setSyncMessage('Checking server...')
    const result = await synchronizePending()
    setPending(result.pending)
    setSyncMessage(result.error || `${result.synced} record(s) synchronized`)
  }
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('/dashboard')}>
          <span className="brand-mark">W</span>
          <span><strong>WineBar</strong><small>Retail POS</small></span>
        </button>
        <nav>
          {nav.filter(({ to }) => user ? canAccess(user.role, to) : false).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className={`connectivity ${online ? 'online' : 'offline'}`}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            {online ? 'Online' : 'Offline'}
            {pending > 0 && <span className="pending-count">{pending} pending</span>}
          </div>
          <button className="icon-button" onClick={() => setDark((value) => !value)} aria-label="Toggle theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-button sync-button" onClick={syncNow} aria-label="Synchronize" title={syncMessage || 'Synchronize'}><RefreshCw size={17}/></button>
          <div className="cashier"><span>{(user?.name || 'U').slice(0, 2).toUpperCase()}</span><div><strong>{user?.name || 'User'}</strong><small>{user?.role || 'Offline'}</small></div></div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
