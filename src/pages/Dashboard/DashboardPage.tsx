import { useEffect, useState } from 'react'
import { IndianRupee, ReceiptText, Package, Boxes, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { db } from '../../db/database'

export default function DashboardPage() {
  const [stats, setStats] = useState({ sales: 0, bills: 0, stock: 0, value: 0, low: 0 })
  const [chart, setChart] = useState<{ name: string; sales: number }[]>([])
  useEffect(() => {
    const load = async () => {
      const sales = await db.sales.toArray()
      const products = await db.products.toArray()
      const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayKey = dateKey(today)
      const todaySales = sales.filter((sale) => dateKey(new Date(sale.createdAt)) === todayKey)
      setStats({
        sales: todaySales.reduce((sum, sale) => sum + sale.total, 0),
        bills: todaySales.length,
        stock: products.reduce((sum, product) => sum + product.currentStock, 0),
        value: products.reduce((sum, product) => sum + (product.purchasePriceStatus === 'verified' ? product.currentStock * product.purchasePrice : 0), 0),
        low: products.filter((product) => product.active && product.currentStock <= product.minimumStock).length,
      })
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
      const dailySales = new Map<string, number>()
      for (const sale of sales) {
        const key = dateKey(new Date(sale.createdAt))
        dailySales.set(key, (dailySales.get(key) || 0) + sale.total)
      }
      setChart(Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart)
        date.setDate(weekStart.getDate() + index)
        return {
          name: date.toLocaleDateString('en-IN', { weekday: 'short' }),
          sales: dailySales.get(dateKey(date)) || 0,
        }
      }))
    }
    load()
  }, [])
  const cards = [
    { label: "Today's sales", value: `₹${(stats.sales / 100).toLocaleString('en-IN')}`, icon: IndianRupee, tone: 'green' },
    { label: 'Bills today', value: stats.bills, icon: ReceiptText, tone: 'purple' },
    { label: 'Bottles in stock', value: stats.stock, icon: Boxes, tone: 'blue' },
    { label: 'Verified inventory value', value: `₹${(stats.value / 100).toLocaleString('en-IN')}`, icon: Package, tone: 'amber' },
  ]
  const weeklySales = chart.reduce((sum, day) => sum + day.sales, 0)
  return (
    <div>
      <div className="page-heading"><div><h1>Dashboard</h1><p>Today’s shop overview</p></div><button className="secondary">Today <span>⌄</span></button></div>
      <div className="metric-grid">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon /></div><div><span>{label}</span><strong>{value}</strong></div></div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel"><div className="panel-heading"><div><h2>Sales overview</h2><p>This week</p></div><strong>₹{(weeklySales / 100).toLocaleString('en-IN')}</strong></div>
          {chart.some((day) => day.sales > 0)
            ? <ResponsiveContainer width="100%" height={280}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="sales" fill="#7c3aed" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>
            : <div className="empty-chart">No sales recorded this week</div>}
        </section>
        <section className="panel alerts-panel"><div className="panel-heading"><div><h2>Stock alerts</h2><p>Needs attention</p></div></div><div className="alert-row"><div className="metric-icon amber"><AlertTriangle /></div><div><strong>{stats.low} low-stock items</strong><small>Below minimum level</small></div><button>View</button></div></section>
      </div>
    </div>
  )
}
