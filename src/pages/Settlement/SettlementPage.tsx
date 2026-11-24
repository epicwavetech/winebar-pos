import { useEffect, useState } from 'react'
import { db } from '../../db/database'
import { Page } from '../../components/ui/Shared'

export default function SettlementPage() {
  const [opening, setOpening] = useState('')
  const [actual, setActual] = useState('')
  const [summary, setSummary] = useState({ cash: 0, upi: 0, card: 0, other: 0, credit: 0, expenses: 0, bills: 0, bottles: 0 })
  useEffect(() => {
    db.sales.toArray().then(async (sales) => {
      const expenses = await db.expenses.toArray()
      const cash = sales.flatMap((sale) => sale.payments).filter((p) => p.method === 'CASH').reduce((sum, p) => sum + p.amount, 0)
      const upi = sales.flatMap((sale) => sale.payments).filter((p) => p.method === 'UPI').reduce((sum, p) => sum + p.amount, 0)
      const card = sales.flatMap((sale) => sale.payments).filter((p) => p.method === 'CARD').reduce((sum, p) => sum + p.amount, 0)
      const other = sales.flatMap((sale) => sale.payments).filter((p) => p.method === 'OTHER').reduce((sum, p) => sum + p.amount, 0)
      const credit = sales.flatMap((sale) => sale.payments).filter((p) => p.method === 'BTC').reduce((sum, p) => sum + p.amount, 0)
      setSummary({ cash, upi, card, other, credit, expenses: expenses.filter((e) => e.paymentMethod === 'CASH').reduce((sum,e) => sum + e.amount,0), bills: sales.length, bottles: (await db.saleItems.toArray()).reduce((sum,item) => sum + item.quantity,0) })
    })
  }, [])
  const openingCash = Number(opening || 0) * 100
  const actualCash = Number(actual || 0) * 100
  const expected = openingCash + summary.cash - summary.expenses
  const difference = actualCash - expected
  const close = async () => {
    const businessDate = new Date().toISOString().slice(0,10)
    const existing = await db.settlements.where('businessDate').equals(businessDate).first()
    if (existing) return
    const settlementId = crypto.randomUUID()
    await db.transaction('rw', db.settlements, db.auditLogs, db.syncQueue, async () => {
      await db.settlements.add({ id: settlementId, businessDate, openingCash, cashSales: summary.cash, upiSales: summary.upi, cardSales: summary.card, otherSales: summary.other, creditSales: summary.credit, cashExpenses: summary.expenses, expectedCash: expected, actualCash, shortage: difference < 0 ? -difference : 0, excess: difference > 0 ? difference : 0, totalBills: summary.bills, bottlesSold: summary.bottles, status: 'closed', closedBy: 'admin-1', closedAt: new Date().toISOString(), syncStatus: 'pending' })
      await db.auditLogs.add({ id: crypto.randomUUID(), action:'SETTLEMENT_CLOSED', entityType:'settlement', entityId:settlementId, userId:'admin-1', createdAt:new Date().toISOString(), details:JSON.stringify({businessDate,actualCash,expectedCash:expected}) })
      await db.syncQueue.add({ id:crypto.randomUUID(), entityType:'settlement', entityId:settlementId, status:'pending', createdAt:new Date().toISOString(), attempts:0 })
    })
  }
  const rows = [
    ['Opening cash', openingCash], ['Cash sales', summary.cash], ['UPI collections', summary.upi], ['Card collections', summary.card],
    ['Other collections', summary.other], ['Bill-to-Credit', summary.credit], ['Cash expenses', summary.expenses], ['Expected cash', expected], ['Actual cash', actualCash],
  ] as const
  return <Page title="Daily Settlement" subtitle="Reconcile today’s cash"><div className="settlement-layout"><section className="panel settlement-summary">{rows.map(([label,value]) => <div key={label}><span>{label}</span><strong>₹{(Number(value)/100).toFixed(2)}</strong></div>)}</section><section className="panel settlement-close"><label>Opening cash (₹)<input type="number" value={opening} onChange={(e) => setOpening(e.target.value)}/></label><label>Actual cash counted (₹)<input type="number" value={actual} onChange={(e) => setActual(e.target.value)}/></label><div className={difference < 0 ? 'difference negative' : 'difference'}><span>{difference < 0 ? 'Shortage' : 'Excess'}</span><strong>₹{(Math.abs(difference)/100).toFixed(2)}</strong></div><button className="primary wide" onClick={close}>Close settlement</button></section></div></Page>
}
