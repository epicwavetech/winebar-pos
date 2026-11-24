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
import {
  AuthApiError, cacheUserForOffline, checkCloudSetup, hashPassword, loginCloud,
  setupCloudAdmin, verifyPassword,
} from './services/authService'
import { db } from './db/database'
import { useAuthStore, canAccess } from './stores/authStore'

function Login({ setupRequired, cloudStatusError, onSetupComplete }: { setupRequired: boolean; cloudStatusError: boolean; onSetupComplete: () => void }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const authUser = useAuthStore((state) => state.user)
  const [error, setError] = useState('')
  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      if (setupRequired) {
        const trimmedName = name.trim()
        const normalizedUsername = username.trim().toLowerCase()
        if (!trimmedName) {
          setError('Enter your name')
          return
        }
        if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
          setError('Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens')
          return
        }
        if (password.length < 8) {
          setError('Use a password with at least 8 characters')
          return
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          return
        }

        const cloudResult = await setupCloudAdmin(trimmedName, normalizedUsername, password)
        const user = await cacheUserForOffline(cloudResult.user, password)
        sessionStorage.setItem('winebar-auth-token', cloudResult.accessToken)
        login(user, cloudResult.accessToken)
        localStorage.setItem('winebar-user-id', user.id)
        onSetupComplete()
        navigate('/pos')
        return
      }

      try {
        const cloudResult = await loginCloud(username.trim(), password)
        const user = await cacheUserForOffline(cloudResult.user, password)
        sessionStorage.setItem('winebar-auth-token', cloudResult.accessToken)
        login(user, cloudResult.accessToken)
        localStorage.setItem('winebar-user-id', user.id)
        navigate('/pos')
      } catch (cloudError) {
        if (!(cloudError instanceof AuthApiError) || ![0, 404, 502, 503, 504].includes(cloudError.status)) throw cloudError
        const localUser = await db.users.where('username').equals(username.trim().toLowerCase()).first()
        if (!localUser?.active || !await verifyPassword(password, localUser.pinHash)) {
          setError('Cloud authentication is unavailable and this device has no saved offline login for that account')
          return
        }
        if (localUser.pinHash && /^[a-f0-9]{64}$/i.test(localUser.pinHash)) {
          localUser.pinHash = await hashPassword(password)
          await db.users.put(localUser)
        }
        sessionStorage.removeItem('winebar-auth-token')
        login(localUser)
        localStorage.setItem('winebar-user-id', localUser.id)
        navigate('/pos')
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete sign in')
    }
  }
  if (authUser) return <Navigate to="/pos"/>
  return <div className="login-screen"><form className="login-card" onSubmit={onSubmit}>
    <div className="login-logo">W</div>
    <h1>WineBar POS</h1>
    <p>{setupRequired ? 'Create your administrator account' : 'Sign in to continue'}</p>
    {cloudStatusError && !setupRequired && <div className="login-error" role="status">Cloud admin status is unavailable. Admin setup is disabled until the server can verify whether an account already exists.</div>}
    {setupRequired && <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" autoFocus/></label>}
    <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder={setupRequired ? 'Choose a username' : 'Username'} autoComplete="username" autoFocus={!setupRequired}/></label>
    <label>Password<input type="password" maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setupRequired ? 'At least 8 characters' : 'Password'} autoComplete={setupRequired ? 'new-password' : 'current-password'}/></label>
    {setupRequired && <label>Confirm password<input type="password" maxLength={256} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password"/></label>}
    {error && <div className="login-error">{error}</div>}
    <button className="primary wide">{setupRequired ? 'Create admin account' : 'Sign in'}</button>
  </form></div>
}

function ProtectedLayout() {
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const [restoring, setRestoring] = useState(true)
  useEffect(() => {
    let active = true
    const restore = async () => {
      if (!user) {
        const id = localStorage.getItem('winebar-user-id')
        if (id) {
          const restored = await db.users.get(id)
          if (restored) login(restored, sessionStorage.getItem('winebar-auth-token'))
          else localStorage.removeItem('winebar-user-id')
        }
      }
      if (active) setRestoring(false)
    }
    void restore()
    return () => { active = false }
  }, [user, login])
  if (restoring) return <div className="login-screen"><div className="login-card"><h1>WineBar POS</h1><p>Restoring session...</p></div></div>
  if (!user) return <Navigate to="/login" replace/>
  if (user && !canAccess(user.role, window.location.pathname) && window.location.pathname !== '/') {
    return <Navigate to="/pos" replace/>
  }
  return <AppLayout/>
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [cloudStatusError, setCloudStatusError] = useState(false)
  const [startupError, setStartupError] = useState('')
  useEffect(() => {
    let active = true
    seedDatabase().then(async () => {
      let needsSetup = false
      let statusUnavailable = false
      try {
        needsSetup = (await checkCloudSetup()).setupRequired
      } catch {
        statusUnavailable = true
      }
      if (!active) return
      setSetupRequired(needsSetup)
      setCloudStatusError(statusUnavailable)
      setReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      setStartupError(error instanceof Error ? error.message : 'Unable to initialize the application')
    })
    return () => { active = false }
  }, [])
  if (startupError) return <div className="login-screen"><div className="login-card"><h1>WineBar POS</h1><p>Unable to initialize the application</p><div className="login-error">{startupError}</div></div></div>
  if (!ready) return <div className="login-screen"><div className="login-card"><h1>WineBar POS</h1><p>Loading...</p></div></div>
  return <BrowserRouter><Routes><Route path="/login" element={<Login setupRequired={setupRequired} cloudStatusError={cloudStatusError} onSetupComplete={() => setSetupRequired(false)}/>}/><Route element={<ProtectedLayout/>}>
    <Route path="/" element={<Navigate to="/pos"/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/pos" element={<POSPage/>}/><Route path="/customers" element={<CustomersPage/>}/>
    <Route path="/products" element={<ProductsPage/>}/><Route path="/categories" element={<CategoriesPage/>}/><Route path="/stock-in" element={<StockInPage/>}/><Route path="/stock-out" element={<StockOutPage/>}/><Route path="/adjustment" element={<AdjustmentPage/>}/><Route path="/inventory" element={<InventoryPage/>}/><Route path="/purchases" element={<PurchasesPage/>}/><Route path="/sales" element={<SalesPage/>}/><Route path="/expenses" element={<ExpensesPage/>}/><Route path="/settlement" element={<SettlementPage/>}/><Route path="/reports" element={<ReportsPage/>}/><Route path="/users" element={<UsersPage/>}/><Route path="/sync-settings" element={<SyncSettingsPage/>}/><Route path="/settings" element={<SettingsPage/>}/>
  </Route><Route path="*" element={<Navigate to="/pos"/>}/></Routes></BrowserRouter>
}
