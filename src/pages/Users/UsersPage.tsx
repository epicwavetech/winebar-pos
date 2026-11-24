import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { db } from '../../db/database'
import { Page, DataTable } from '../../components/ui/Shared'
import { hashPassword } from '../../services/authService'
import type { User, UserRole } from '../../types/models'

type UserFormMode = 'create' | 'password' | null

const roles: UserRole[] = ['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF']

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [mode, setMode] = useState<UserFormMode>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole>('CASHIER')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loadingError, setLoadingError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    db.users.toArray()
      .then((loadedUsers) => { if (active) setUsers(loadedUsers) })
      .catch((loadError: unknown) => {
        if (active) setLoadingError(loadError instanceof Error ? loadError.message : 'Unable to load users')
      })
    return () => { active = false }
  }, [])

  const openCreate = () => {
    setSelectedUser(null)
    setName('')
    setUsername('')
    setRole('CASHIER')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setMode('create')
  }

  const openPassword = (user: User) => {
    setSelectedUser(user)
    setPassword('')
    setConfirmPassword('')
    setError('')
    setMode('password')
  }

  const closeForm = () => {
    if (saving) return
    setMode(null)
    setSelectedUser(null)
    setError('')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const trimmedName = name.trim()
    const normalizedUsername = username.trim().toLowerCase()

    if (mode === 'create') {
      if (!trimmedName) {
        setError('Enter the user name')
        return
      }
      if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
        setError('Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens')
        return
      }
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    try {
      const pinHash = await hashPassword(password)
      if (mode === 'create') {
        const newUser: User = {
          id: crypto.randomUUID(),
          name: trimmedName,
          username: normalizedUsername,
          role,
          active: true,
          pinHash,
        }
        await db.transaction('rw', db.users, async () => {
          const existingUsers = await db.users.toArray()
          if (existingUsers.some((user) => user.username.trim().toLowerCase() === normalizedUsername)) {
            throw new Error('That username is already in use')
          }
          await db.users.add(newUser)
        })
      } else {
        if (!selectedUser) throw new Error('Select a user before setting a password')
        await db.transaction('rw', db.users, async () => {
          const updated = await db.users.update(selectedUser.id, { pinHash })
          if (!updated) throw new Error('That user no longer exists')
        })
      }

      setUsers(await db.users.toArray())
      setMode(null)
      setSelectedUser(null)
      setPassword('')
      setConfirmPassword('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the user')
    } finally {
      setSaving(false)
    }
  }

  return <Page title="Users" subtitle="Staff accounts, roles, and passwords" actions={<button className="primary" onClick={openCreate}><Plus size={16}/> Add user</button>}>
    {loadingError && <div className="login-error">{loadingError}</div>}
    <DataTable headers={['Name', 'Username', 'Role', 'Status', 'Password']} rows={users.map((user) => [
      user.name,
      user.username,
      user.role,
      user.active ? 'Active' : 'Inactive',
      <button key={`password-${user.id}`} className="secondary" type="button" onClick={() => openPassword(user)}>{user.pinHash ? 'Change password' : 'Set password'}</button>,
    ])}/>
    {mode && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
      <form className="modal form-modal" onSubmit={(event) => void save(event)}>
        <div className="modal-header">
          <div><h2>{mode === 'create' ? 'Add user' : 'Set user password'}</h2>{selectedUser && <small>{selectedUser.name} · {selectedUser.username}</small>}</div>
          <button type="button" onClick={closeForm} disabled={saving} aria-label="Close">×</button>
        </div>
        {mode === 'create' && <div className="form-grid">
          <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name"/></label>
          <label>Username<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username"/></label>
          <label>Role<select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>{roles.map((userRole) => <option key={userRole} value={userRole}>{userRole.replace('_', ' ')}</option>)}</select></label>
        </div>}
        <div className="form-grid">
          <label>Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password"/></label>
          <label>Confirm password<input required type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password"/></label>
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        <div className="heading-actions"><button className="secondary" type="button" onClick={closeForm} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving...' : mode === 'create' ? 'Create user' : 'Save password'}</button></div>
      </form>
    </div>}
  </Page>
}
