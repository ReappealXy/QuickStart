import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

function getWsId(): string {
  return useSettingsStore.getState().activeWorkspaceId || 'default'
}

interface NoteState {
  notes: NoteMeta[]
  draft: string
  title: string
  editingId: string | null
  loading: boolean
  loadNotes: () => Promise<void>
  saveNote: (content: string, title?: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  /** Soft-delete: marks isDeleted but returns info for undo */
  softDeleteNote: (id: string) => Promise<void>
  loadNoteContent: (id: string) => Promise<string>
  setDraft: (content: string) => void
  setTitle: (title: string) => void
  setEditingId: (id: string | null) => void
  clearEditor: () => void
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  draft: '',
  title: '',
  editingId: null,
  loading: false,

  loadNotes: async () => {
    set({ loading: true })
    try {
      const data = await window.api.notes.list(getWsId())
      const visibleNotes = (data.notes || []).filter((n: NoteMeta) => !n.isDeleted)
      set({ notes: visibleNotes })
    } catch (err) {
      console.error('Failed to load notes:', err)
    } finally {
      set({ loading: false })
    }
  },

  saveNote: async (content: string, title?: string) => {
    const noteTitle = title ?? get().title
    if (!content.trim() && !noteTitle.trim()) return
    const { editingId } = get()
    const noteObj: Record<string, unknown> = { content, title: noteTitle }
    if (editingId) noteObj.id = editingId
    await window.api.notes.save(getWsId(), noteObj)
    set({ draft: '', title: '', editingId: null })
    await get().loadNotes()
  },

  deleteNote: async (id: string) => {
    await window.api.notes.delete(getWsId(), id)
    if (get().editingId === id) {
      set({ draft: '', title: '', editingId: null })
    }
    await get().loadNotes()
  },

  softDeleteNote: async (id: string) => {
    await window.api.notes.delete(getWsId(), id)
    if (get().editingId === id) {
      set({ draft: '', title: '', editingId: null })
    }
    await get().loadNotes()
  },

  loadNoteContent: async (id: string) => {
    try {
      const content = await window.api.notes.load(getWsId(), id)
      return content || ''
    } catch {
      return ''
    }
  },

  setDraft: (content: string) => set({ draft: content }),
  setTitle: (title: string) => set({ title }),
  setEditingId: (id: string | null) => set({ editingId: id }),
  clearEditor: () => set({ draft: '', title: '', editingId: null }),
}))
