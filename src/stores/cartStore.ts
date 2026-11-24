import { create } from 'zustand'
import type { CartItem } from '../types/models'

interface CartState {
  items: CartItem[]
  add: (item: Omit<CartItem, 'quantity' | 'discountPerBottle'>) => string | null
  setQuantity: (productId: string, quantity: number) => void
  setDiscountPerBottle: (productId: string, discount: number) => void
  remove: (productId: string) => void
  clear: () => void
  subtotal: () => number
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  add: (item) => {
    const existing = get().items.find((value) => value.productId === item.productId)
    if (existing) {
      if (existing.quantity >= item.availableStock) return 'Not enough stock'
      set({ items: get().items.map((value) =>
        value.productId === item.productId ? { ...value, quantity: value.quantity + 1 } : value,
      ) })
    } else {
      if (item.availableStock < 1) return 'Product is out of stock'
      set({ items: [...get().items, { ...item, quantity: 1, discountPerBottle: 0 }] })
    }
    return null
  },
  setQuantity: (productId, quantity) => {
    set({ items: get().items.map((item) => {
      if (item.productId !== productId) return item
      return { ...item, quantity: Math.min(Math.max(1, quantity), item.availableStock) }
    }) })
  },
  setDiscountPerBottle: (productId, discount) => {
    set({ items: get().items.map((item) =>
      item.productId === productId
        ? { ...item, discountPerBottle: Math.min(item.unitPrice, Math.max(0, discount)) }
        : item,
    ) })
  },
  remove: (productId) => set({ items: get().items.filter((item) => item.productId !== productId) }),
  clear: () => set({ items: [] }),
  subtotal: () => get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  total: () => get().items.reduce((sum, item) =>
    sum + (item.unitPrice - item.discountPerBottle) * item.quantity, 0,
  ),
}))
