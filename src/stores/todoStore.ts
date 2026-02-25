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

function ensureDoneLast(items: TodoItem[]): TodoItem[] {
  const pending: TodoItem[] = []
  const done: TodoItem[] = []
  for (const item of items) {
    if (item.done) done.push(item)
    else pending.push(item)
  }
  return [...pending, ...done]
}

function normalizeOrder(items: TodoItem[]): TodoItem[] {
  return items.map((item, index) => ({ ...item, order: index }))
}

function sameIdSequence(a: TodoItem[], b: TodoItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
  }
  return true
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
      const rawItems = data.items || []
      const normalizedItems = normalizeOrder(ensureDoneLast(rawItems))
      const normalizedDay: TodoDay = { ...data, items: normalizedItems }
      set({ todoDay: normalizedDay, currentDate: d })

      // One-time self-heal for old data ordering.
      const orderChanged =
        !sameIdSequence(rawItems, normalizedItems) ||
        rawItems.some((item, idx) => item.order !== idx)
      if (orderChanged) {
        await window.api.todos.save(d, normalizedDay)
      }
    } catch {
      set({ todoDay: { date: d, archived: false, items: [] } })
    } finally {
      set({ loading: false })
    }
  },

  addItem: async (content: string) => {
    if (!content.trim()) return
    const { todoDay, currentDate } = get()
    const base = normalizeOrder(ensureDoneLast(todoDay.items))
    const newItem: TodoItem = {
      id: generateId(),
      content: content.trim(),
      done: false,
      color: null,
      time: null,
      order: base.length,
      createdAt: new Date().toISOString()
    }
    const firstDoneIndex = base.findIndex((item) => item.done)
    const inserted =
      firstDoneIndex === -1
        ? [...base, newItem]
        : [...base.slice(0, firstDoneIndex), newItem, ...base.slice(firstDoneIndex)]
    const updated = { ...todoDay, items: normalizeOrder(inserted) }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  toggleItem: async (id: string) => {
    const { todoDay, currentDate } = get()
    const base = [...normalizeOrder(ensureDoneLast(todoDay.items))]
    const idx = base.findIndex((item) => item.id === id)
    if (idx === -1) return

    const current = base[idx]
    const toggled: TodoItem = {
      ...current,
      done: !current.done,
      doneAt: !current.done ? new Date().toISOString() : undefined,
    }

    base.splice(idx, 1)
    if (toggled.done) {
      base.push(toggled)
    } else {
      const firstDoneIndex = base.findIndex((item) => item.done)
      if (firstDoneIndex === -1) base.push(toggled)
      else base.splice(firstDoneIndex, 0, toggled)
    }

    const updated = { ...todoDay, items: normalizeOrder(ensureDoneLast(base)) }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  updateItem: async (id: string, updates: Partial<TodoItem>) => {
    const { todoDay, currentDate } = get()
    const base = normalizeOrder(ensureDoneLast(todoDay.items))
    const updated = {
      ...todoDay,
      items: normalizeOrder(ensureDoneLast(base.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )))
    }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  },

  deleteItem: async (id: string) => {
    const { todoDay, currentDate } = get()
    const updated = {
      ...todoDay,
      items: normalizeOrder(ensureDoneLast(todoDay.items.filter((item) => item.id !== id)))
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
    const updated = { ...todoDay, items: normalizeOrder(ensureDoneLast(reordered)) }
    set({ todoDay: updated })
    await window.api.todos.save(currentDate, updated)
  }
}))
