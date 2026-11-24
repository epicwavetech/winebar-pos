import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF'
type Row = {
  id: string
  name: string
  username: string
  role: UserRole
  active: boolean
  pin_hash: string | null
  updated_at?: string
}
type Claims = { sub: string; exp: number }
type Body = Record<string, unknown>

const reply = (body: unknown, status = 200) => Response.json(body, { status })
const usernamePattern = /^[a-z0-9._-]{3,30}$/
const passwordIterations = 32768

function supabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set on the server')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function passwordHash(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: passwordIterations, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${passwordIterations}$${salt.toString('hex')}$${hash.toString('hex')}`
}

function matchesPassword(password: string, stored: string | null) {
  if (!stored) return false
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const actual = createHash('sha256').update(password).digest()
    return timingSafeEqual(actual, Buffer.from(stored, 'hex'))
  }
  const [algorithm, iterations, saltHex, digestHex] = stored.split('$')
  if (algorithm !== 'scrypt' || Number(iterations) !== passwordIterations || !/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{128}$/i.test(digestHex || '')) return false
  const expected = Buffer.from(digestHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: passwordIterations, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  })
  return timingSafeEqual(actual, expected)
}

function tokenSecret() {
  const secret = process.env.SUPABASE_AUTH_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Set SUPABASE_AUTH_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY on the server')
  return secret
}

function createToken(user: Pick<Row, 'id'>) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 })).toString('base64url')
  const signature = createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readToken(value: string | null) {
  if (!value?.startsWith('Bearer ')) return null
  const [payload, signature] = value.slice(7).split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', tokenSecret()).update(payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Claims
    return claims.sub && claims.exp > Math.floor(Date.now() / 1000) ? claims : null
  } catch {
    return null
  }
}

async function requireAdmin(request: Request) {
  const claims = readToken(request.headers.get('authorization'))
  if (!claims) return null
  const { data, error } = await supabase().from('users')
    .select('id, name, username, role, active, pin_hash')
    .eq('id', claims.sub)
    .maybeSingle()
  if (error) throw new Error(`users: ${error.message}`)
  return data?.active && data.role === 'ADMIN' ? data as Row : null
}

function publicUser(user: Row) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    hasPassword: Boolean(user.pin_hash),
    updatedAt: user.updated_at,
  }
}

function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 256
}

function loginAttemptKey(request: Request, username: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  return createHash('sha256').update(`${ip}\n${username}`).digest('hex')
}

async function handle(request: Request) {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  try {
    const body = await request.json() as Body
    const action = body.action
    const client = supabase()

    if (action === 'status') {
      const { data, error } = await client.from('users').select('id').eq('role', 'ADMIN').limit(1)
      if (error) throw new Error(`users: ${error.message}`)
      return reply({ setupRequired: !data?.length })
    }

    if (action === 'setup') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const username = normalizeUsername(body.username)
      if (!name || name.length > 100) return reply({ error: 'Enter a valid name' }, 400)
      if (!usernamePattern.test(username)) return reply({ error: 'Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens' }, 400)
      if (!validPassword(body.password)) return reply({ error: 'Use a password with 8-256 characters' }, 400)

      const { data, error } = await client.rpc('create_initial_admin', {
        p_id: randomUUID(),
        p_name: name,
        p_username: username,
        p_pin_hash: passwordHash(body.password),
      })
      if (error) {
        if (error.code === '23505') return reply({ error: 'An administrator already exists or that username is already in use' }, 409)
        throw new Error(`Initial admin setup failed: ${error.message}`)
      }
      const user = Array.isArray(data) ? data[0] as Row : data as Row
      return reply({ user: publicUser(user), accessToken: createToken(user) }, 201)
    }

    if (action === 'login') {
      const username = normalizeUsername(body.username)
      const attemptKey = loginAttemptKey(request, username)
      const { data: locked, error: lockError } = await client.rpc('auth_login_is_locked', { p_attempt_key: attemptKey })
      if (lockError) throw new Error(`Login rate limit check failed: ${lockError.message}`)
      if (locked) return reply({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, 429)
      if (!usernamePattern.test(username) || !validPassword(body.password)) {
        const { error: attemptError } = await client.rpc('record_auth_login_failure', { p_attempt_key: attemptKey })
        if (attemptError) throw new Error(`Login rate limit update failed: ${attemptError.message}`)
        return reply({ error: 'Invalid username or password' }, 401)
      }
      const { data, error } = await client.from('users')
        .select('id, name, username, role, active, pin_hash')
        .eq('username', username)
        .maybeSingle()
      if (error) throw new Error(`users: ${error.message}`)
      if (!data?.active || !matchesPassword(body.password, data.pin_hash)) {
        const { error: attemptError } = await client.rpc('record_auth_login_failure', { p_attempt_key: attemptKey })
        if (attemptError) throw new Error(`Login rate limit update failed: ${attemptError.message}`)
        return reply({ error: 'Invalid username or password' }, 401)
      }
      const { error: clearError } = await client.rpc('clear_auth_login_failures', { p_attempt_key: attemptKey })
      if (clearError) throw new Error(`Unable to reset login rate limit: ${clearError.message}`)
      if (/^[a-f0-9]{64}$/i.test(data.pin_hash || '')) {
        const { error: upgradeError } = await client.from('users').update({
          pin_hash: passwordHash(body.password),
          updated_at: new Date().toISOString(),
        }).eq('id', data.id)
        if (upgradeError) throw new Error(`Unable to upgrade password storage: ${upgradeError.message}`)
      }
      return reply({ user: publicUser(data as Row), accessToken: createToken(data as Row) })
    }

    if (action === 'list-users') {
      const admin = await requireAdmin(request)
      if (!admin) return reply({ error: 'Admin sign-in is required to manage users' }, 401)
      const { data, error } = await client.from('users')
        .select('id, name, username, role, active, pin_hash, updated_at')
        .order('username')
      if (error) throw new Error(`users: ${error.message}`)
      return reply((data ?? []).map((user) => publicUser(user as Row)))
    }

    if (action === 'create-user') {
      const admin = await requireAdmin(request)
      if (!admin) return reply({ error: 'Admin sign-in is required to manage users' }, 401)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const username = normalizeUsername(body.username)
      const role = body.role
      if (!name || name.length > 100) return reply({ error: 'Enter a valid name' }, 400)
      if (!usernamePattern.test(username)) return reply({ error: 'Username must be 3-30 characters using letters, numbers, dots, underscores, or hyphens' }, 400)
      if (!['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'].includes(String(role))) return reply({ error: 'Choose a valid user role' }, 400)
      if (!validPassword(body.password)) return reply({ error: 'Use a password with 8-256 characters' }, 400)
      const { data, error } = await client.from('users').insert({
        id: randomUUID(), name, username, role, active: true, pin_hash: passwordHash(body.password),
      }).select('id, name, username, role, active, pin_hash, updated_at').single()
      if (error) {
        if (error.code === '23505') return reply({ error: 'That username is already in use' }, 409)
        throw new Error(`Unable to create user: ${error.message}`)
      }
      return reply(publicUser(data as Row), 201)
    }

    if (action === 'set-password') {
      const admin = await requireAdmin(request)
      if (!admin) return reply({ error: 'Admin sign-in is required to manage users' }, 401)
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!userId || !validPassword(body.password)) return reply({ error: 'Provide a user and a password with 8-256 characters' }, 400)
      const { data, error } = await client.from('users').update({
        pin_hash: passwordHash(body.password),
        updated_at: new Date().toISOString(),
      }).eq('id', userId).select('id, name, username, role, active, pin_hash, updated_at').maybeSingle()
      if (error) throw new Error(`Unable to save password: ${error.message}`)
      if (!data) return reply({ error: 'That user no longer exists' }, 404)
      return reply(publicUser(data as Row))
    }

    return reply({ error: 'Unknown authentication action' }, 404)
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Authentication request failed' }, 500)
  }
}

export function POST(request: Request) { return handle(request) }
