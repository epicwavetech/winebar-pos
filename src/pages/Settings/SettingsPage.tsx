import { useEffect, useState } from 'react'
import { Page } from '../../components/ui/Shared'
import { db } from '../../db/database'

export default function SettingsPage() {
  const [form,setForm] = useState({ shopName:'', address:'', phone:'', gst:'', timezone:'Asia/Kolkata', businessBoundaryHour:'0', syncEndpoint:'' })
  useEffect(() => {
    db.settings.get('shop').then((value) => value && setForm((current) => ({ ...current, shopName:value.shopName||'',address:value.address||'',phone:value.phone||'',gst:value.gst||'',timezone:value.timezone||'Asia/Kolkata',businessBoundaryHour:String(value.businessBoundaryHour||0) })))
    db.settings.get('sync').then((value) => value && setForm((current) => ({ ...current, syncEndpoint:value.endpoint || '' })))
  }, [])
  const save = async () => { await db.settings.put({ key:'shop', shopName:form.shopName,address:form.address,phone:form.phone,gst:form.gst,timezone:form.timezone,businessBoundaryHour:Number(form.businessBoundaryHour) }); await db.settings.put({ key:'sync', endpoint:form.syncEndpoint }) }
  return <Page title="Settings" subtitle="Shop and operational configuration"><section className="panel settings-panel"><div className="form-grid"><label>Shop name<input value={form.shopName} onChange={(e)=>setForm({...form,shopName:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></label><label>Address<input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})}/></label><label>GST / statutory details<input value={form.gst} onChange={(e)=>setForm({...form,gst:e.target.value})}/></label><label>Timezone<input value={form.timezone} onChange={(e)=>setForm({...form,timezone:e.target.value})}/></label><label>Business-day boundary hour (0–23)<input type="number" min="0" max="23" value={form.businessBoundaryHour} onChange={(e)=>setForm({...form,businessBoundaryHour:e.target.value})}/></label><label>Server synchronization endpoint<input value={form.syncEndpoint} onChange={(e)=>setForm({...form,syncEndpoint:e.target.value})} placeholder="https://your-server.example/api"/></label></div><button className="primary" onClick={save}>Save settings</button></section></Page>
}
