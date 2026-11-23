import { create } from 'zustand'
import type { User, UserRole } from '../types/models'

interface AuthState {
  user: User | null
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
}))

export const rolePages: Record<UserRole, string[]> = {
  ADMIN: ['*'],
  MANAGER: ['/dashboard','/pos','/products','/categories','/stock-in','/stock-out','/adjustment','/inventory','/purchases','/sales','/expenses','/settlement','/reports'],
  CASHIER: ['/pos','/sales','/dashboard','/products','/categories','/stock-in','/stock-out','/adjustment','/inventory','/purchases','/reports'],
  INVENTORY_STAFF: ['/products','/stock-in','/stock-out','/adjustment','/inventory','/purchases','/reports'],
}

export function canAccess(role: UserRole, path: string) {
  return rolePages[role].includes('*') || rolePages[role].includes(path)
}
