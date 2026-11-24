import { create } from 'zustand'
import type { User, UserRole } from '../types/models'

interface AuthState {
  user: User | null
  accessToken: string | null
  login: (user: User, accessToken?: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  login: (user, accessToken = null) => set({ user, accessToken }),
  logout: () => set({ user: null, accessToken: null }),
}))

export const rolePages: Record<UserRole, string[]> = {
  ADMIN: ['*'],
  MANAGER: ['/dashboard','/pos','/products','/categories','/stock-in','/stock-out','/adjustment','/inventory','/purchases','/sales','/customers','/expenses','/settlement','/reports','/sync-settings'],
  CASHIER: ['/pos','/sales','/customers','/dashboard','/products','/categories','/stock-in','/stock-out','/adjustment','/inventory','/purchases','/reports','/sync-settings'],
  INVENTORY_STAFF: ['/products','/stock-in','/stock-out','/adjustment','/inventory','/purchases','/reports','/sync-settings'],
}

export function canAccess(role: UserRole, path: string) {
  return rolePages[role].includes('*') || rolePages[role].includes(path)
}
