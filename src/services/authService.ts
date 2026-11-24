import { db } from '../db/database'
import type { User, UserRole } from '../types/models'

const passwordIterations = 310_000
const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')

export interface CloudUser extends Omit<User, 'pinHash'> {
  hasPassword: boolean
  updatedAt?: string
}

interface AuthResult {
  user: CloudUser
  accessToken: string
}

export class AuthApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

async function authUrl() {
  const setting = await db.settings.get('sync')
  const base = (setting?.endpoint?.trim() || '/api').replace(/\/$/, '')
  return `${base}/auth`
}

async function authRequest<T>(body: Record<string, unknown>, accessToken?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(await authUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthApiError('Cloud authentication is unavailable', 0)
  }

  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new AuthApiError(result.error || `Authentication request failed (${response.status})`, response.status)
  return result as T
}

export async function hashPassword(value: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: passwordIterations, hash: 'SHA-256' }, key, 256)
  return `pbkdf2_sha256$${passwordIterations}$${hex(salt)}$${hex(new Uint8Array(bits))}`
}

export async function verifyPassword(value: string, stored: string | undefined) {
  if (!stored) return false
  const [algorithm, rawIterations, saltHex, digestHex] = stored.split('$')
  if (algorithm === 'pbkdf2_sha256') {
    const iterations = Number(rawIterations)
    if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000
      || !/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{64}$/i.test(digestHex || '')) return false
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: Uint8Array.from(saltHex.match(/.{2}/g) || [], (byte) => parseInt(byte, 16)),
      iterations,
      hash: 'SHA-256',
    }, key, 256)
    return hex(new Uint8Array(bits)) === digestHex.toLowerCase()
  }
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const legacy = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return hex(new Uint8Array(legacy)) === stored.toLowerCase()
  }
  return false
}

export async function checkCloudSetup() {
  return authRequest<{ setupRequired: boolean }>({ action: 'status' })
}

export async function setupCloudAdmin(name: string, username: string, password: string) {
  return authRequest<AuthResult>({ action: 'setup', name, username, password })
}

export async function loginCloud(username: string, password: string) {
  return authRequest<AuthResult>({ action: 'login', username, password })
}

export async function listCloudUsers(accessToken: string) {
  return authRequest<CloudUser[]>({ action: 'list-users' }, accessToken)
}

export async function createCloudUser(accessToken: string, input: { name: string; username: string; role: UserRole; password: string }) {
  return authRequest<CloudUser>({ action: 'create-user', ...input }, accessToken)
}

export async function setCloudUserPassword(accessToken: string, userId: string, password: string) {
  return authRequest<CloudUser>({ action: 'set-password', userId, password }, accessToken)
}

export async function cacheUserForOffline(user: CloudUser, password: string) {
  const localUser: User = { ...user, pinHash: await hashPassword(password) }
  await db.transaction('rw', db.users, async () => {
    const duplicates = await db.users.where('username').equals(user.username).toArray()
    await db.users.bulkDelete(duplicates.filter((existing) => existing.id !== user.id).map((existing) => existing.id))
    await db.users.put(localUser)
  })
  return localUser
}
