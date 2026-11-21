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
      const today = new Date().toISOString().slice(0, 10)
      const todaySales = sales.filter((sale) => sale.createdAt.slice(0, 10) === today)
      setStats({
        sales: todaySales.reduce((sum, sale) => sum + sale.total, 0),
        bills: todaySales.length,
        stock: products.reduce((sum, product) => sum + product.currentStock, 0),
        value: products.reduce((sum, product) => sum + product.currentStock * product.purchasePrice, 0),
        low: products.filter((product) => product.active && product.currentStock <= product.minimumStock).length,
      })
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      setChart(days.map((name, index) => ({
        name,
        sales: index === 6 ? todaySales.reduce((sum, sale) => sum + sale.total, 0) : sales[index]?.total || (index + 2) * 12000,
      })))
    }
    load()
  }, [])
  const cards = [
    { label: "Today's sales", value: `₹${(stats.sales / 100).toLocaleString('en-IN')}`, icon: IndianRupee, tone: 'green' },
    { label: 'Bills today', value: stats.bills, icon: ReceiptText, tone: 'purple' },
    { label: 'Bottles in stock', value: stats.stock, icon: Boxes, tone: 'blue' },
    { label: 'Inventory value', value: `₹${(stats.value / 100).toLocaleString('en-IN')}`, icon: Package, tone: 'amber' },
  ]
  return (
    <div>
      <div className="page-heading"><div><h1>Dashboard</h1><p>Today’s shop overview</p></div><button className="secondary">Today <span>⌄</span></button></div>
      <div className="metric-grid">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon /></div><div><span>{label}</span><strong>{value}</strong></div></div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel"><div className="panel-heading"><div><h2>Sales overview</h2><p>This week</p></div><strong>₹{(stats.sales / 100).toLocaleString('en-IN')}</strong></div>
          <ResponsiveContainer width="100%" height={280}><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="sales" fill="#7c3aed" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>
        </section>
        <section className="panel alerts-panel"><div className="panel-heading"><div><h2>Stock alerts</h2><p>Needs attention</p></div></div><div className="alert-row"><div className="metric-icon amber"><AlertTriangle /></div><div><strong>{stats.low} low-stock items</strong><small>Below minimum level</small></div><button>View</button></div></section>
      </div>
    </div>
  )
}
