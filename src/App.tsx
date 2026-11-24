import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/Dashboard/DashboardPage'
import POSPage from './pages/POS/POSPage'
import ProductsPage from './pages/Products/ProductsPage'
import InventoryPage from './pages/Inventory/InventoryPage'
import SettlementPage from './pages/Settlement/SettlementPage'
import ReportsPage from './pages/Reports/ReportsPage'
import UsersPage from './pages/Users/UsersPage'
import SettingsPage from './pages/Settings/SettingsPage'
import SyncSettingsPage from './pages/Settings/SyncSettingsPage'
import CustomersPage from './pages/Customers/CustomersPage'
import { CategoriesPage, StockInPage, StockOutPage, AdjustmentPage, PurchasesPage, SalesPage, ExpensesPage } from './pages/Operations/OperationsPages'
import { seedDatabase } from './services/seedService'
import { db } from './db/database'
import { useAuthStore, canAccess } from './stores/authStore'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const authUser = useAuthStore((state) => state.user)
  const [error, setError] = useState('')
  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    const pinHash = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const user = await db.users.where('username').equals(username.trim()).first()
    if (user?.active && user.pinHash === pinHash) {
      login(user)
      localStorage.setItem('winebar-user-id', user.id)
      navigate('/pos')
    } else {
      setError('Invalid username or password')
    }
  }
  if (authUser) return <Navigate to="/pos"/>
  return <div className="login-screen"><form className="login-card" onSubmit={onSubmit}><div className="login-logo">W</div><h1>WineBar POS</h1><p>Sign in to continue</p><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin or cashier" autoFocus/></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Use demo password"/></label>{error && <div className="login-error">{error}</div>}<button className="primary wide">Sign in</button><small>Admin: admin123 · Cashier: cashier123</small></form></div>
}

function ProtectedLayout() {
  const user = useAuthStore((state) => state.user)
  useEffect(() => {
    const restore = async () => {
      if (user) return
      const id = localStorage.getItem('winebar-user-id')
      if (id) {
        const restored = await db.users.get(id)
        if (restored) useAuthStore.getState().login(restored)
      }
    }
    restore()
  }, [user])
  if (!user) {
    const id = localStorage.getItem('winebar-user-id')
    if (!id) return <Navigate to="/login" replace/>
  }
  if (user && !canAccess(user.role, window.location.pathname) && window.location.pathname !== '/') {
    return <Navigate to="/pos" replace/>
  }
  return <AppLayout/>
}

export default function App() {
  useEffect(() => { seedDatabase() }, [])
  return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route element={<ProtectedLayout/>}>
    <Route path="/" element={<Navigate to="/pos"/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/pos" element={<POSPage/>}/><Route path="/customers" element={<CustomersPage/>}/>
    <Route path="/products" element={<ProductsPage/>}/><Route path="/categories" element={<CategoriesPage/>}/><Route path="/stock-in" element={<StockInPage/>}/><Route path="/stock-out" element={<StockOutPage/>}/><Route path="/adjustment" element={<AdjustmentPage/>}/><Route path="/inventory" element={<InventoryPage/>}/><Route path="/purchases" element={<PurchasesPage/>}/><Route path="/sales" element={<SalesPage/>}/><Route path="/expenses" element={<ExpensesPage/>}/><Route path="/settlement" element={<SettlementPage/>}/><Route path="/reports" element={<ReportsPage/>}/><Route path="/users" element={<UsersPage/>}/><Route path="/sync-settings" element={<SyncSettingsPage/>}/><Route path="/settings" element={<SettingsPage/>}/>
  </Route><Route path="*" element={<Navigate to="/pos"/>}/></Routes></BrowserRouter>
}
