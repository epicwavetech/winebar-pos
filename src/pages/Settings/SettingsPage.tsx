import { useEffect, useState, type FormEvent } from 'react'
import { Page } from '../../components/ui/Shared'
import { db } from '../../db/database'

export default function SettingsPage() {
  const [form, setForm] = useState({
    shopName: '',
    address: '',
    phone: '',
    gst: '',
    timezone: 'Asia/Kolkata',
    businessBoundaryHour: '0',
    syncEndpoint: '',
    syncApiKey: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    db.settings.get('shop').then((value) => value && setForm((current) => ({
      ...current,
      shopName: value.shopName || '',
      address: value.address || '',
      phone: value.phone || '',
      gst: value.gst || '',
      timezone: value.timezone || 'Asia/Kolkata',
      businessBoundaryHour: String(value.businessBoundaryHour || 0),
    })))
    db.settings.get('sync').then((value) => value && setForm((current) => ({
      ...current,
      syncEndpoint: value.endpoint || '',
      syncApiKey: value.apiKey || '',
    })))
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    try {
      await db.transaction('rw', db.settings, async () => {
        await db.settings.put({
          key: 'shop',
          shopName: form.shopName,
          address: form.address,
          phone: form.phone,
          gst: form.gst,
          timezone: form.timezone,
          businessBoundaryHour: Number(form.businessBoundaryHour),
        })
        await db.settings.put({ key: 'sync', endpoint: form.syncEndpoint, apiKey: form.syncApiKey })
      })
      setSaveMessage({ text: 'Settings saved on this device.', error: false })
    } catch (error) {
      setSaveMessage({
        text: `Could not save settings: ${error instanceof Error ? error.message : 'Storage error'}`,
        error: true,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title="Settings" subtitle="Shop and operational configuration">
      <form className="panel settings-panel" onSubmit={save}>
        <div className="form-grid">
          <label>Shop name<input value={form.shopName} onChange={(event) => setForm({ ...form, shopName: event.target.value })}/></label>
          <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label>
          <label>Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })}/></label>
          <label>GST / statutory details<input value={form.gst} onChange={(event) => setForm({ ...form, gst: event.target.value })}/></label>
          <label>Timezone<input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}/></label>
          <label>Business-day boundary hour (0–23)<input type="number" min="0" max="23" value={form.businessBoundaryHour} onChange={(event) => setForm({ ...form, businessBoundaryHour: event.target.value })}/></label>
          <label>Server synchronization endpoint<input value={form.syncEndpoint} onChange={(event) => setForm({ ...form, syncEndpoint: event.target.value })} placeholder="/api (default)"/></label>
          <label>Sync API key<input type="password" value={form.syncApiKey} onChange={(event) => setForm({ ...form, syncApiKey: event.target.value })} placeholder="Same value as SYNC_API_KEY on Vercel"/></label>
        </div>
        <p className="settings-note">Sync settings are stored in this browser only. Enter the same API key on each device to share products.</p>
        {saveMessage && <p className={`settings-feedback${saveMessage.error ? ' error' : ''}`} role={saveMessage.error ? 'alert' : 'status'}>{saveMessage.text}</p>}
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>
    </Page>
  )
}
