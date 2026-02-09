import { create } from 'zustand'

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function today(): string {
  return formatDate(new Date())
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
}

interface TodoState {
  currentDate: string
  todoDay: TodoDay
  loading: boolean
  setDate: (date: string) => void
  goToday: () => void
  goPrevDay: () => void
  goNextDay: () => void
  loadTodos: (date?: string) => Promise<void>
  addItem: (content: string) => Promise<void>
  toggleItem: (id: string) => Promise<void>
  updateItem: (id: string, updates: Partial<TodoItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  setItemColor: (id: string, color: string | null) => Promise<void>
  reorderItems: (ids: string[]) => Promise<void>
}

export const useTodoStore = create<TodoState>((set, get) => ({
  currentDate: today(),
  todoDay: { date: today(), archived: false, items: [] },
  loading: false,

  setDate: (date) => {
    set({ currentDate: date })
    get().loadTodos(date)
  },

  goToday: () => get().setDate(today()),

  goPrevDay: () => {
    const d = new Date(get().currentDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    get().setDate(formatDate(d))
  },

  goNextDay: () => {
    const d = new Date(get().currentDate + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    get().setDate(formatDate(d))
  },

  loadTodos: async (date?: string) => {
    const d = date || get().currentDate
    set({ loading: true })
    try {
      const data = await window.api.todos.load(d)
      set({ todoDay: data, currentDate: d })
    } catch {
      set({ todoDay: { date: d, archived: false, items: [] } })
    } finally {
      set({ loading: false })
    }
  },

  addItem: async (content: string) => {
    if (!content.trim()) return
    const { todoDay, currentDate } = get()
    const newItem: TodoItem = {
      id: generateId(),
      content: content.trim(),
      done: false,
      color: null,
      time: null,
      order: todoDay.items.length,
      createdAt: new Date().toISOString()
    }
    const updated = { ...todoDay, items: [...todoDay.items, newItem] }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  toggleItem: async (id: string) => {
    const { todoDay, currentDate } = get()
    const updated = {
      ...todoDay,
      items: todoDay.items.map((item) =>
        item.id === id
          ? {
              ...item,
              done: !item.done,
              doneAt: !item.done ? new Date().toISOString() : undefined
            }
          : item
      )
    }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  updateItem: async (id: string, updates: Partial<TodoItem>) => {
    const { todoDay, currentDate } = get()
    const updated = {
      ...todoDay,
      items: todoDay.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  deleteItem: async (id: string) => {
    const { todoDay, currentDate } = get()
    const updated = {
      ...todoDay,
      items: todoDay.items.filter((item) => item.id !== id)
    }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  setItemColor: async (id: string, color: string | null) => {
    await get().updateItem(id, { color })
  },

  reorderItems: async (ids: string[]) => {
    const { todoDay, currentDate } = get()
    const itemMap = new Map(todoDay.items.map((item) => [item.id, item]))
    const reordered = ids.map((id) => itemMap.get(id)!).filter(Boolean)
    // Append any items not in ids (safety)
    for (const item of todoDay.items) {
      if (!ids.includes(item.id)) reordered.push(item)
    }
    const updated = { ...todoDay, items: reordered }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  }
}))
