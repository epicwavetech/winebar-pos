import { useEffect, useState } from 'react'
import { FileSpreadsheet, CalendarDays } from 'lucide-react'
import { Page } from '../../components/ui/Shared'
import { db } from '../../db/database'
import { downloadCsv, exportExcel, exportPdf } from '../../services/exportService'

const reports = ['Daily sales','Monthly sales','Product-wise sales','Brand-wise sales','Category-wise sales','Bottle-size-wise sales','Payment collections','Stock-in','Stock-out','Stock adjustments','Inventory movement','Current stock','Low stock','Purchase','Expense','Gross profit estimate','Daily settlement']

export default function ReportsPage() {
  const [selected, setSelected] = useState('Daily sales')
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<(string | number)[][]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const start = new Date(`${from}T00:00:00.000Z`).getTime()
      const end = new Date(`${to}T23:59:59.999Z`).getTime()
      let nextHeaders: string[] = []
      let nextRows: (string | number)[][] = []
      if (selected.endsWith('sales') || selected === 'Payment collections') {
        const sales = (await db.sales.toArray()).filter((sale) => {
          const time = new Date(sale.createdAt).getTime()
          return time >= start && time <= end
        })
        if (selected === 'Payment collections') {
          nextHeaders = ['Payment','Amount']
          const methods = ['CASH','UPI','CARD','OTHER'] as const
          nextRows = methods.map((method) => [method, (sales.flatMap((sale) => sale.payments).filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0) / 100).toFixed(2)])
        } else if (selected === 'Product-wise sales' || selected === 'Brand-wise sales' || selected === 'Category-wise sales' || selected === 'Bottle-size-wise sales') {
          const saleItems = await db.saleItems.toArray()
          const saleIds = new Set(sales.map((sale) => sale.id))
          const filtered = saleItems.filter((item) => saleIds.has(item.saleId))
          const key = selected === 'Bottle-size-wise sales' ? 'bottleSize' : 'productName'
          const map = new Map<string, { quantity: number; value: number }>()
          filtered.forEach((item) => {
            const label = key === 'bottleSize' ? item.bottleSize : item.productName
            const old = map.get(label) || { quantity: 0, value: 0 }
            map.set(label, { quantity: old.quantity + item.quantity, value: old.value + item.total })
          })
          nextHeaders = [selected === 'Bottle-size-wise sales' ? 'Bottle size' : 'Product','Quantity','Value']
          nextRows = Array.from(map.entries()).map(([label, value]) => [label, value.quantity, (value.value / 100).toFixed(2)])
        } else {
          nextHeaders = ['Invoice','Date','Cashier','Payment','Total']
          nextRows = sales.map((sale) => [sale.invoiceNumber, new Date(sale.createdAt).toLocaleString('en-IN'), sale.cashierName, sale.payments.map((payment) => payment.method).join(' + '), (sale.total / 100).toFixed(2)])
        }
      } else if (selected === 'Current stock' || selected === 'Low stock') {
        const products = await db.products.toArray()
        const filtered = selected === 'Low stock' ? products.filter((product) => product.currentStock <= product.minimumStock) : products
        nextHeaders = ['Product','Brand','Size','Stock','Minimum','Value']
        nextRows = filtered.map((product) => [product.name,product.brand,product.bottleSize,product.currentStock,product.minimumStock,(product.currentStock * product.purchasePrice / 100).toFixed(2)])
      } else if (selected === 'Stock-in' || selected === 'Inventory movement' || selected === 'Stock-out' || selected === 'Stock adjustments') {
        const transactions = (await db.inventoryTransactions.toArray()).filter((item) => {
          const time = new Date(item.createdAt).getTime()
          return time >= start && time <= end
        })
        const filtered = selected === 'Stock-out' ? transactions.filter((item) => item.stockOut > 0) : selected === 'Stock adjustments' ? transactions.filter((item) => item.type.includes('ADJUSTMENT')) : selected === 'Stock-in' ? transactions.filter((item) => item.type === 'PURCHASE_IN') : transactions
        nextHeaders = ['Date','Reference','Product','Type','Stock In','Stock Out','Balance']
        nextRows = filtered.map((item) => [new Date(item.createdAt).toLocaleString('en-IN'),item.reference,item.productName,item.type,item.stockIn,item.stockOut,item.balance])
      } else if (selected === 'Purchase') {
        const purchases = (await db.purchases.toArray()).filter((item) => { const time = new Date(item.createdAt).getTime(); return time >= start && time <= end })
        nextHeaders = ['Reference','Date','Value','Status']
        nextRows = purchases.map((item) => [item.reference,new Date(item.createdAt).toLocaleString('en-IN'),(item.total/100).toFixed(2),item.syncStatus])
      } else if (selected === 'Expense') {
        const expenses = (await db.expenses.toArray()).filter((item) => item.date >= from && item.date <= to)
        nextHeaders = ['Title','Date','Category','Payment','Amount']
        nextRows = expenses.map((item) => [item.title,item.date,item.category,item.paymentMethod,(item.amount/100).toFixed(2)])
      } else if (selected === 'Gross profit estimate') {
        const sales = await db.sales.toArray()
        const items = await db.saleItems.toArray()
        const gross = sales.reduce((sum, sale) => sum + sale.total, 0)
        const cost = items.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0)
        nextHeaders = ['Metric','Amount']
        nextRows = [['Gross sales',(gross/100).toFixed(2)],['Estimated product cost',(cost/100).toFixed(2)],['Estimated gross profit',((gross-cost)/100).toFixed(2)]]
      } else {
        const settlements = (await db.settlements.toArray()).filter((item) => item.businessDate >= from && item.businessDate <= to)
        nextHeaders = ['Date','Opening Cash','Cash Sales','Expected Cash','Actual Cash','Status']
        nextRows = settlements.map((item) => [item.businessDate,(item.openingCash/100).toFixed(2),(item.cashSales/100).toFixed(2),(item.expectedCash/100).toFixed(2),(item.actualCash/100).toFixed(2),item.status])
      }
      if (!cancelled) { setHeaders(nextHeaders); setRows(nextRows) }
    }
    load()
    return () => { cancelled = true }
  }, [selected, from, to])

  const exportReport = (kind: 'csv'|'excel'|'pdf') => {
    const name = selected.toLowerCase().replace(/[^a-z0-9]+/g,'-')
    if (kind === 'csv') downloadCsv(`${name}.csv`, headers, rows)
    if (kind === 'excel') exportExcel(`${name}.xlsx`, selected.slice(0,31), headers, rows)
    if (kind === 'pdf') exportPdf(`${name}.pdf`, selected, headers, rows)
  }

  return <Page title="Reports" subtitle="Filter, preview and export shop reports"><div className="reports-layout"><aside className="report-list">{reports.map((report) => <button key={report} className={selected === report ? 'active' : ''} onClick={() => setSelected(report)}>{report}</button>)}</aside><section className="panel report-view"><div className="report-toolbar"><div><h2>{selected}</h2><p>Report preview</p></div><div><label className="date-input"><CalendarDays size={16}/><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="date-input"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="secondary" onClick={() => exportReport('csv')}><FileSpreadsheet size={16}/> CSV</button><button className="secondary" onClick={() => exportReport('excel')}>Excel</button><button className="secondary" onClick={() => exportReport('pdf')}>PDF</button></div></div>{rows.length > 0 ? <div className="table-panel"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{row.map((cell,cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <div className="empty-report"><FileSpreadsheet size={44}/><strong>No report data for this selection</strong><small>Choose a date range or add matching operations</small></div>}</section></div></Page>
}
