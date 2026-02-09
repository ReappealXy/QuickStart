import { create } from 'zustand'

interface NoteState {
  notes: NoteMeta[]
  draft: string
  editingId: string | null
  loading: boolean
  loadNotes: () => Promise<void>
  saveNote: (content: string, title?: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  /** Soft-delete: marks isDeleted but returns info for undo */
  softDeleteNote: (id: string) => Promise<void>
  loadNoteContent: (id: string) => Promise<string>
  setDraft: (content: string) => void
  setEditingId: (id: string | null) => void
  clearEditor: () => void
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  draft: '',
  editingId: null,
  loading: false,

  loadNotes: async () => {
    set({ loading: true })
    try {
      const data = await window.api.notes.list('default')
      const visibleNotes = (data.notes || []).filter((n: NoteMeta) => !n.isDeleted)
      set({ notes: visibleNotes })
    } catch (err) {
      console.error('Failed to load notes:', err)
    } finally {
      set({ loading: false })
    }
  },

  saveNote: async (content: string, title?: string) => {
    if (!content.trim()) return
    const { editingId } = get()
    // If editingId exists, pass it to overwrite the existing note
    const noteObj: Record<string, unknown> = { content, title }
    if (editingId) noteObj.id = editingId
    await window.api.notes.save('default', noteObj)
    set({ draft: '', editingId: null })
    await get().loadNotes()
  },

  deleteNote: async (id: string) => {
    await window.api.notes.delete('default', id)
    // If we were editing this note, clear editor
    if (get().editingId === id) {
      set({ draft: '', editingId: null })
    }
    await get().loadNotes()
  },

  softDeleteNote: async (id: string) => {
    await window.api.notes.delete('default', id)
    if (get().editingId === id) {
      set({ draft: '', editingId: null })
    }
    await get().loadNotes()
  },

  loadNoteContent: async (id: string) => {
    try {
      const content = await window.api.notes.load('default', id)
      return content || ''
    } catch {
      return ''
    }
  },

  setDraft: (content: string) => set({ draft: content }),
  setEditingId: (id: string | null) => set({ editingId: id }),
  clearEditor: () => set({ draft: '', editingId: null }),
}))
