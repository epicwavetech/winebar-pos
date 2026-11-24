import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, Tags, ArrowDownToLine, ArrowUpFromLine,
  SlidersHorizontal, Boxes, ReceiptText, WalletCards, CircleDollarSign,
  Settings, Users, BarChart3, Moon, Sun, Wifi, WifiOff, MoreHorizontal, KeyRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore, canAccess } from '../../stores/authStore'
import { db } from '../../db/database'
import { synchronizePending } from '../../services/syncService'
import { RefreshCw, LogOut } from 'lucide-react'

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
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/expenses', label: 'Expenses', icon: WalletCards },
  { to: '/settlement', label: 'Settlement', icon: WalletCards },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/sync-settings', label: 'Device Sync', icon: Wifi },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout() {
  const [online, setOnline] = useState(navigator.onLine)
  const [dark, setDark] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{ message: string; error: boolean } | null>(null)
  const visibleNav = nav.filter(({ to }) => user ? canAccess(user.role, to) : false)
  const primaryNav = visibleNav.filter(({ to }) => ['/dashboard', '/pos', '/products', '/inventory'].includes(to))
  const moreNav = visibleNav.filter(({ to }) => !['/dashboard', '/pos', '/products', '/inventory'].includes(to))
  useEffect(() => {
    const refreshPending = () => {
      void Promise.all([
        db.syncQueue.where('status').anyOf('pending', 'error').count(),
        db.inventoryTransactions.where('syncStatus').equals('pending').count(),
      ]).then(([queued, ledger]) => setPending(queued + ledger)).catch((error: unknown) => {
        setSyncStatus({
          message: `Could not load pending sync count: ${error instanceof Error ? error.message : 'Storage error'}`,
          error: true,
        })
      })
    }
    refreshPending()
    window.addEventListener('winebar:sync-pending-updated', refreshPending)
    return () => window.removeEventListener('winebar:sync-pending-updated', refreshPending)
  }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const signOut = () => {
    localStorage.removeItem('winebar-user-id')
    sessionStorage.removeItem('winebar-auth-token')
    useAuthStore.getState().logout()
    navigate('/login', { replace: true })
  }
  const syncNow = async (manual = false) => {
    setSyncing(true)
    if (manual) setSyncStatus({ message: 'Syncing catalog and pending records…', error: false })
    try {
      const result = await synchronizePending()
      setPending(result.pending)
      setSyncStatus(result.error
        ? { message: `Sync failed: ${result.error}`, error: true }
        : manual
          ? { message: `Sync complete. Catalog: ${result.catalogProducts ?? 0} product(s); ${result.synced} pending record(s) sent; ${result.pending} still pending.`, error: false }
          : null)
    } catch (error) {
      setSyncStatus({
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unexpected error'}`,
        error: true,
      })
    } finally {
      setSyncing(false)
    }
  }
  useEffect(() => {
    if (!online) return
    void syncNow()
    const timer = window.setInterval(() => { void syncNow() }, 60000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])
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
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <nav className="mobile-nav" aria-label="Main navigation">
        {primaryNav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setMoreOpen(false)}>
            <Icon size={18} /><span>{label}</span>
          </NavLink>
        ))}
        <button className={`nav-link mobile-more-button${moreNav.some(({ to }) => to === location.pathname) ? ' active' : ''}`} onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}>
          <MoreHorizontal size={18}/><span>More</span>
        </button>
        {moreOpen && <div className="mobile-more-menu" aria-label="More navigation">
          {moreNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setMoreOpen(false)}>
              <Icon size={18}/><span>{label}</span>
            </NavLink>
          ))}
        </div>}
      </nav>
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
          <button className="icon-button sync-button" onClick={() => void syncNow(true)} aria-label={syncing ? 'Synchronizing' : 'Synchronize'} title={syncStatus?.message || 'Synchronize'} disabled={syncing}><RefreshCw size={17} className={syncing ? 'syncing-icon' : undefined}/></button>
          <button className="secondary device-sync-link" onClick={() => navigate('/sync-settings')}><KeyRound size={16}/><span>Device Sync</span></button>
          <div className="cashier"><span>{(user?.name || 'U').slice(0, 2).toUpperCase()}</span><div><strong>{user?.name || 'User'}</strong><small>{user?.role || 'Offline'}</small></div></div>
          <button className="icon-button" onClick={signOut} aria-label="Log out" title="Log out"><LogOut size={17}/></button>
        </header>
        {syncStatus && <div className={`sync-notice${syncStatus.error ? ' error' : ''}`} role={syncStatus.error ? 'alert' : 'status'}>
          <span>{syncStatus.message}</span>
          <button onClick={() => setSyncStatus(null)} aria-label="Dismiss sync message">×</button>
        </div>}
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
