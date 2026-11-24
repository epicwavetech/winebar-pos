import { useEffect, useState, type FormEvent } from 'react'
import { Page } from '../../components/ui/Shared'
import { db } from '../../db/database'
import { EMPTY_COST_FORMULA } from '../../services/costingService'
import type { CostFormulaComponent, CostFormulaConfig } from '../../types/models'

const formulaComponents: Array<{ key: CostFormulaComponent; label: string }> = [
  { key: 'totalMrp', label: 'Total MRP' },
  { key: 'adValorem', label: 'Ad Valorem levy' },
  { key: 'vatAmount', label: 'VAT' },
  { key: 'tpfAmount', label: 'TPF' },
  { key: 'otherCharges', label: 'Other charges' },
  { key: 'discount', label: 'Discount' },
]

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
  const [costFormula, setCostFormula] = useState<CostFormulaConfig>(EMPTY_COST_FORMULA)
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
    db.settings.get('costFormula').then((value) => value && setCostFormula({
      ...EMPTY_COST_FORMULA,
      ...value,
      components: value.components || {},
    }))
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    try {
      if (costFormula.enabled && (
        !costFormula.verified
        || !costFormula.verifiedReference.trim()
        || !Object.keys(costFormula.components).length
      )) {
        setSaveMessage({ text: 'Enable a formula only after verification, with a reference and at least one component.', error: true })
        setSaving(false)
        return
      }
      const savedFormula = { ...costFormula, updatedAt: new Date().toISOString() }
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
        await db.settings.put({ key: 'costFormula', ...savedFormula })
      })
      setCostFormula(savedFormula)
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
        <p className="settings-note">Receipts print at 80mm through the browser dialog. Connect the USB printer and select it with 80mm paper configured.</p>
        <section className="cost-formula-settings">
          <h2>Verified purchase cost formula</h2>
          <p className="settings-note">Actual invoice payable always takes precedence. Permit MRP and levy fields are not treated as cost unless you configure and verify the exact formula first.</p>
          <p className="settings-note">This formula is stored in this browser. Configure it on each device that records stock-in batches.</p>
          <label className="checkbox-setting"><input type="checkbox" checked={costFormula.enabled} onChange={(event) => setCostFormula({ ...costFormula, enabled: event.target.checked })}/> Use configured formula when actual invoice payable is missing</label>
          <label className="checkbox-setting"><input type="checkbox" checked={costFormula.verified} onChange={(event) => setCostFormula({ ...costFormula, verified: event.target.checked })}/> I verified this formula against an applicable retailer purchase invoice / official pricing reference</label>
          <label>Verification reference<input value={costFormula.verifiedReference} onChange={(event) => setCostFormula({ ...costFormula, verifiedReference: event.target.value })} placeholder="Invoice type, order, circular, or reference"/></label>
          <div className="formula-components">
            {formulaComponents.map(({ key, label }) => (
              <label key={key}>{label}<select
                value={costFormula.components[key] || 'ignore'}
                onChange={(event) => {
                  const components = { ...costFormula.components }
                  if (event.target.value === 'ignore') delete components[key]
                  else components[key] = event.target.value as 'add' | 'subtract'
                  setCostFormula({ ...costFormula, components })
                }}
              >
                <option value="ignore">Exclude</option>
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
              </select></label>
            ))}
          </div>
          {costFormula.enabled && !costFormula.verified && <p className="cost-warning" role="status">The formula is not verified, so CP will remain pending.</p>}
        </section>
        {saveMessage && <p className={`settings-feedback${saveMessage.error ? ' error' : ''}`} role={saveMessage.error ? 'alert' : 'status'}>{saveMessage.text}</p>}
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>
    </Page>
  )
}
