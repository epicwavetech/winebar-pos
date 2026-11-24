import { useEffect, useState, type FormEvent } from 'react'
import { Page } from '../../components/ui/Shared'
import { db } from '../../db/database'

export default function SyncSettingsPage() {
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    void db.settings.get('sync').then((setting) => {
      if (!setting) return
      setEndpoint(setting.endpoint || '')
      setApiKey(setting.apiKey || '')
    }).catch((error: unknown) => {
      setMessage({ text: `Could not load device sync settings: ${error instanceof Error ? error.message : 'Storage error'}`, error: true })
    })
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await db.settings.put({ key: 'sync', endpoint: endpoint.trim(), apiKey: apiKey.trim() })
      setMessage({ text: 'Sync settings saved on this device. Use the Sync button to test the connection.', error: false })
    } catch (error) {
      setMessage({ text: `Could not save sync settings: ${error instanceof Error ? error.message : 'Storage error'}`, error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title="Device Sync Setup" subtitle="Configure the sync connection for this cashier device">
      <form className="panel settings-panel" onSubmit={save}>
        <div className="form-grid">
          <label>Server synchronization endpoint
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="/api (default)"/>
          </label>
          <label>Sync API key (provided by Admin)
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Enter the SYNC_API_KEY from Vercel"/>
          </label>
        </div>
        <p className="settings-note">Use the same SYNC_API_KEY configured for the WineBar server. This key is saved in this browser only; configure each cashier device separately.</p>
        {message && <p className={`settings-feedback${message.error ? ' error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save device sync settings'}</button>
      </form>
    </Page>
  )
}
