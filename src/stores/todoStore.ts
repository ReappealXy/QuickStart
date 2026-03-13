import { create } from 'zustand'

type ViewMode = 'list' | 'quadrant' | 'calendar'

/** @return YYYY-MM-DD 格式的今天日期 */
function today(): string {
  var d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 把未完成排前、已完成排后
 * @param items 原列表
 * @return 排序后列表
 */
function ensureDoneLast(items: TodoItem[]): TodoItem[] {
  var pending = items.filter(i => !i.done)
  var done = items.filter(i => i.done)
  return [...pending, ...done]
}

/** @param items 规范化 order 字段 */
function normalizeOrder(items: TodoItem[]): TodoItem[] {
  return items.map((item, idx) => ({ ...item, order: idx }))
}

interface TodoState {
  items: TodoItem[]
  loading: boolean
  viewMode: ViewMode
  filterDate: string | null

  setViewMode: (mode: ViewMode) => void
  setFilterDate: (date: string | null) => void
  loadItems: () => Promise<void>
  addItem: (data: { title: string; description?: string; color?: string | null; quadrant?: Quadrant | null; startDate?: string; endDate?: string | null }) => Promise<string | null>
  toggleItem: (id: string) => Promise<void>
  updateItem: (id: string, updates: Partial<TodoItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  setItemColor: (id: string, color: string | null) => Promise<void>
  reorderItems: (ids: string[]) => Promise<void>
}

export var useTodoStore = create<TodoState>((set, get) => ({
  items: [],
  loading: false,
  viewMode: 'list',
  filterDate: today(),

  setViewMode: (mode) => set({ viewMode: mode }),

  setFilterDate: (date) => set({ filterDate: date }),

  loadItems: async () => {
    set({ loading: true })
    try {
      if (typeof window === 'undefined' || !window.api?.todos?.list) {
        set({ items: [] })
        return
      }
      var raw = await window.api.todos.list()
      var list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items) ? (raw as Record<string, unknown>).items : [])
      var normalized = list.map((x: Record<string, unknown>) => ({
        id: String(x.id ?? ''),
        title: String(x.title ?? (x as { content?: string }).content ?? ''),
        description: String(x.description ?? ''),
        done: Boolean(x.done),
        color: x.color != null ? String(x.color) : null,
        quadrant: x.quadrant != null ? String(x.quadrant) : null,
        startDate: String(x.startDate ?? today()),
        endDate: x.endDate != null ? String(x.endDate) : null,
        order: Number(x.order) || 0,
        createdAt: String(x.createdAt ?? new Date().toISOString()),
        doneAt: x.doneAt != null ? String(x.doneAt) : undefined,
        timerLimit: x.timerLimit != null ? Number(x.timerLimit) : undefined,
        timerSpent: x.timerSpent != null ? Number(x.timerSpent) : undefined,
        completedDuration: x.completedDuration != null ? Number(x.completedDuration) : undefined,
      }))
      set({ items: normalized })
    } catch {
      set({ items: [] })
    } finally {
      set({ loading: false })
    }
  },

  addItem: async (data) => {
    try {
      var res = await window.api.todos.add({
        title: data.title,
        description: data.description || '',
        done: false,
        color: data.color || null,
        quadrant: data.quadrant || null,
        startDate: data.startDate || today(),
        endDate: data.endDate || null,
      })
      if (res.success) {
        await get().loadItems()
        return res.id || null
      }
    } catch { /* ignore */ }
    return null
  },

  toggleItem: async (id) => {
    var item = get().items.find(i => i.id === id)
    if (!item) return
    var updates: Partial<TodoItem> = {
      done: !item.done,
      doneAt: !item.done ? new Date().toISOString() : undefined,
    }
    // 乐观更新
    set({ items: ensureDoneLast(get().items.map(i => i.id === id ? { ...i, ...updates } : i)) })
    await window.api.todos.update(id, updates)
  },

  updateItem: async (id, updates) => {
    set({ items: get().items.map(i => i.id === id ? { ...i, ...updates } : i) })
    await window.api.todos.update(id, updates)
  },

  deleteItem: async (id) => {
    set({ items: get().items.filter(i => i.id !== id) })
    await window.api.todos.delete(id)
  },

  setItemColor: async (id, color) => {
    await get().updateItem(id, { color })
  },

  reorderItems: async (ids) => {
    var { items } = get()
    var map = new Map(items.map(i => [i.id, i]))
    var ordered = ids.map(id => map.get(id)!).filter(Boolean)
    items.forEach(i => { if (!ids.includes(i.id)) ordered.push(i) })
    set({ items: normalizeOrder(ensureDoneLast(ordered)) })
    await window.api.todos.reorder(ids)
  },
}))

/**
 * 根据 filterDate 筛选并排序（纯函数，在组件中配合 useMemo 使用）
 * @param items 全部任务
 * @param filterDate 筛选日期，null 表示全部
 * @return 筛选+排序后的列表
 */
export function filterTodoItems(items: TodoItem[], filterDate: string | null): TodoItem[] {
  var filtered = filterDate
    ? items.filter(item => {
        var s = item.startDate || ''
        var e = item.endDate || s
        return s <= filterDate && e >= filterDate
      })
    : items
  return normalizeOrder(ensureDoneLast([...filtered].sort((a, b) => a.order - b.order)))
}
