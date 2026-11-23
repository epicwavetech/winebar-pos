// Vercel serverless function: handles /api/health, /api/catalog, /api/sales,
// /api/purchases, /api/expenses, /api/settlements and /api/inventory.
// Uses the Supabase SERVICE ROLE key (server-side only — never put it in a VITE_ variable).
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

type Row = Record<string, any>

const reply = (body: unknown, status = 200) => Response.json(body, { status })

function authorized(request: Request) {
  const expected = process.env.SYNC_API_KEY
  if (!expected) return false // fail closed if the secret was never configured
  const given = request.headers.get('x-api-key') || ''
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function supabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set on the server')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function upsertChunks(table: string, rows: Row[], onConflict = 'id') {
  const client = supabase()
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + 500), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function readAll(client: ReturnType<typeof supabase>, table: string) {
  const rows: Row[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from(table).select('*').range(offset, offset + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

const toCategory = (c: Row) => ({ id: c.id, name: c.name, icon: c.icon ?? '', color: c.color ?? '#64748b', sort_order: c.sortOrder ?? 0, active: c.active ?? true })

const toProduct = (p: Row) => ({
  id: p.id, name: p.name, brand: p.brand ?? '', category_id: p.categoryId || null,
  bottle_size: p.bottleSize ?? '', barcode: p.barcode ?? '', sku: p.sku ?? '',
  purchase_price: p.purchasePrice ?? 0, selling_price: p.sellingPrice ?? 0, mrp: p.mrp ?? 0,
  tax_rate: p.taxRate ?? 0, opening_stock: p.openingStock ?? 0, current_stock: p.currentStock ?? 0,
  minimum_stock: p.minimumStock ?? 0, image: p.image ?? null, active: p.active ?? true,
  created_at: p.createdAt, updated_at: p.updatedAt ?? p.createdAt,
})

const toLedger = (t: Row) => ({
  id: t.id, reference: t.reference, product_id: t.productId || null, product_name: t.productName,
  type: t.type, stock_in: t.stockIn ?? 0, stock_out: t.stockOut ?? 0, balance: t.balance ?? 0,
  reason: t.reason ?? null, user_id: t.userId ?? null, created_at: t.createdAt,
})

async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) return reply({ error: 'Unauthorized: check SYNC_API_KEY on Vercel and the API key in app Settings' }, 401)

  const entity = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop()
  try {
    const client = supabase()

    if (entity === 'health') {
      const { error } = await client.from('settings').select('key').limit(1)
      if (error) throw new Error(`Database check failed: ${error.message}`)
      return reply({ ok: true })
    }
    if (request.method === 'GET' && entity === 'catalog') {
      const [categories, products, reset] = await Promise.all([
        readAll(client, 'categories'),
        readAll(client, 'products'),
        client.from('settings').select('value').eq('key', 'product_catalog_reset').maybeSingle(),
      ])
      if (reset.error) throw new Error(`Catalog reset marker: ${reset.error.message}`)
      return reply({ categories, products, productResetAt: reset.data?.value?.resetAt })
    }
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
    const body = (await request.json()) as Row

    switch (entity) {
      case 'catalog':
        await upsertChunks('categories', (body.categories ?? []).map(toCategory))
        await upsertChunks('products', (body.products ?? []).map(toProduct))
        return reply({ ok: true })

      case 'inventory':
        await upsertChunks('inventory_transactions', (body.transactions ?? []).map(toLedger))
        return reply({ ok: true })

      case 'sales': {
        const { data, error } = await client.rpc('sync_sale', { payload: body })
        if (error) throw new Error(`sales: ${error.message}`)
        return reply({ ok: true, result: data })
      }

      case 'purchases': {
        await upsertChunks('purchases', [{
          id: body.id, reference: body.reference, created_at: body.createdAt,
          supplier_note: body.supplierNote ?? null, total: body.total ?? 0, user_id: body.userId ?? null,
        }])
        await upsertChunks('purchase_items', (body.items ?? []).map((i: Row) => ({
          id: i.id, purchase_id: body.id, product_id: i.productId || null, product_name: i.productName,
          bottle_size: i.bottleSize ?? '', quantity: i.quantity, purchase_rate: i.purchaseRate ?? 0,
          batch_number: i.batchNumber ?? null,
        })))
        return reply({ ok: true })
      }

      case 'expenses':
        await upsertChunks('expenses', [{
          id: body.id, title: body.title, category: body.category ?? 'Other operating expenses',
          amount: body.amount ?? 0, date: body.date, payment_method: body.paymentMethod ?? 'CASH',
          description: body.description ?? '', user_id: body.userId ?? null, created_at: body.createdAt,
        }])
        return reply({ ok: true })

      case 'settlements':
        await upsertChunks('settlements', [{
          id: body.id, business_date: body.businessDate, opening_cash: body.openingCash ?? 0,
          cash_sales: body.cashSales ?? 0, upi_sales: body.upiSales ?? 0, card_sales: body.cardSales ?? 0,
          other_sales: body.otherSales ?? 0, cash_expenses: body.cashExpenses ?? 0,
          expected_cash: body.expectedCash ?? 0, actual_cash: body.actualCash ?? 0,
          shortage: body.shortage ?? 0, excess: body.excess ?? 0, total_bills: body.totalBills ?? 0,
          bottles_sold: body.bottlesSold ?? 0, status: body.status ?? 'open',
          closed_by: body.closedBy ?? null, closed_at: body.closedAt ?? null,
        }])
        return reply({ ok: true })

      default:
        return reply({ error: `Unknown endpoint: ${entity}` }, 404)
    }
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Server error' }, 500)
  }
}

export function GET(request: Request) { return handle(request) }
export function POST(request: Request) { return handle(request) }
