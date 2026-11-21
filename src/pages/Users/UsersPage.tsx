import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { db } from '../../db/database'
import { Page, DataTable } from '../../components/ui/Shared'

export default function UsersPage() {
  const [users,setUsers] = useState<any[]>([])
  useEffect(() => { db.users.toArray().then(setUsers) }, [])
  const add = async () => {
    const name = window.prompt('User name')
    const username = window.prompt('Username')
    if (!name || !username) return
    await db.users.add({ id: crypto.randomUUID(), name, username, role: 'CASHIER', active: true })
    setUsers(await db.users.toArray())
  }
  return <Page title="Users" subtitle="Cashiers and role assignments" actions={<button className="primary" onClick={add}><Plus size={16}/> Add user</button>}><DataTable headers={['Name','Username','Role','Status']} rows={users.map((u) => [u.name,u.username,u.role,u.active?'Active':'Inactive'])}/></Page>
}
