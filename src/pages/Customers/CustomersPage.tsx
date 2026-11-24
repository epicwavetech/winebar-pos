import { useEffect, useState, type FormEvent } from 'react'
import { Page } from '../../components/ui/Shared'
import { db } from '../../db/database'
import { synchronizePending } from '../../services/syncService'
import type { Customer } from '../../types/models'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const loadCustomers = () => db.customers.orderBy('name').toArray()
    .then(setCustomers)
    .catch((error: unknown) => {
      setMessage(`Could not load customer accounts: ${error instanceof Error ? error.message : 'Storage error'}`)
    })

  useEffect(() => {
    void loadCustomers()
    window.addEventListener('winebar:customers-updated', loadCustomers)
    return () => window.removeEventListener('winebar:customers-updated', loadCustomers)
  }, [])

  const saveCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const customerName = name.trim()
    if (!customerName) return

    const now = new Date().toISOString()
    const customer: Customer = {
      id: crypto.randomUUID(),
      name: customerName,
      phone: phone.trim(),
      creditBalance: 0,
      createdAt: now,
      updatedAt: now,
    }
    const queueId = crypto.randomUUID()

    setSaving(true)
    setMessage('')
    try {
      await db.transaction('rw', db.customers, db.syncQueue, async () => {
        await db.customers.add(customer)
        await db.syncQueue.add({
          id: queueId,
          entityType: 'customer',
          entityId: customer.id,
          status: 'pending',
          createdAt: now,
          attempts: 0,
        })
      })
      setName('')
      setPhone('')
      await loadCustomers()
      window.dispatchEvent(new Event('winebar:customers-updated'))
      window.dispatchEvent(new Event('winebar:sync-pending-updated'))
    } catch (error) {
      setMessage(`Could not save customer: ${error instanceof Error ? error.message : 'Storage error'}`)
      setSaving(false)
      return
    }
    try {
      const result = await synchronizePending()
      const queueEntry = await db.syncQueue.where('id').equals(queueId).first()
      setMessage(result.error
        ? `Customer saved on this device. Sync failed: ${result.error}`
        : queueEntry?.status === 'synced'
          ? 'Customer account saved and synced.'
          : 'Customer saved on this device. Sync is pending.')
    } catch (error) {
      setMessage(`Customer saved on this device. Sync failed: ${error instanceof Error ? error.message : 'Server is unavailable'}`)
    } finally {
      setSaving(false)
      window.dispatchEvent(new Event('winebar:sync-pending-updated'))
    }
  }

  return (
    <Page title="Customer accounts" subtitle="Manage customers and their outstanding Bill-to-Credit balances">
      {message && <div className="toast static-toast" role="status">{message}<button onClick={() => setMessage('')}>×</button></div>}
      <form className="panel stock-form" onSubmit={saveCustomer}>
        <div className="form-grid">
          <label>Customer name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Phone<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        </div>
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add customer account'}</button>
      </form>
      <div className="panel table-panel" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>Customer</th><th>Phone</th><th>Amount owed</th></tr></thead>
          <tbody>{customers.map((customer) => (
            <tr key={customer.id}>
              <td><strong>{customer.name}</strong></td>
              <td>{customer.phone || '—'}</td>
              <td>₹{(customer.creditBalance / 100).toFixed(2)}</td>
            </tr>
          ))}</tbody>
        </table>
        {!customers.length && <div className="empty-table">No customer accounts yet</div>}
      </div>
    </Page>
  )
}
