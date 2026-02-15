import { useEffect, useState, useRef, useCallback } from 'react'
import { useNoteStore } from '../../stores/noteStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  Search, Trash2, Send, Check, FileText, Image as ImageIcon,
  ChevronDown, ChevronUp, Loader2, Type, X, PenLine, Pencil, Undo2, ArrowLeft, Download,
  AlertTriangle, Lightbulb, Pin, Circle, Ban, RotateCcw
} from 'lucide-react'
import WorkspaceDropdown from './WorkspaceDropdown'

/* ── status icon options ── */
const STATUS_ICONS = [
  { key: '',      tooltip: '移除标记',  icon: Ban,           idle: '#94a3b8', hover: '#64748b', active: '#64748b', bg: 'rgba(0,0,0,0.04)', bgDark: 'rgba(255,255,255,0.06)' },
  { key: 'alert', tooltip: '思维陷阱',  icon: AlertTriangle, idle: '#94a3b8', hover: '#f59e0b', active: '#f59e0b', bg: 'rgba(245,158,11,0.10)', bgDark: 'rgba(245,158,11,0.14)' },
  { key: 'idea',  tooltip: '核心灵感',  icon: Lightbulb,     idle: '#94a3b8', hover: '#8b5cf6', active: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', bgDark: 'rgba(139,92,246,0.14)' },
  { key: 'pin',   tooltip: '关键定稿',  icon: Pin,           idle: '#94a3b8', hover: '#ef4444', active: '#ef4444', bg: 'rgba(239,68,68,0.10)', bgDark: 'rgba(239,68,68,0.14)' },
] as const

function getStatusIconCfg(key: string) {
  return STATUS_ICONS.find((s) => s.key === key) || STATUS_ICONS[0]
}

/* ── image attachment ── */
interface PastedImage {
  id: string
  fileName: string
  filePath: string
  imageUrl: string
}

/* ── undo toast state ── */
interface UndoToast {
  noteId: string
  noteTitle: string
  timer: ReturnType<typeof setTimeout>
  remaining: number
  intervalId: ReturnType<typeof setInterval>
}

export default function NotesTab() {
  const notes = useNoteStore((s) => s.notes)
  const draft = useNoteStore((s) => s.draft)
  const noteTitle = useNoteStore((s) => s.title)
  const editingId = useNoteStore((s) => s.editingId)
  const loading = useNoteStore((s) => s.loading)
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const saveNote = useNoteStore((s) => s.saveNote)
  const softDeleteNote = useNoteStore((s) => s.softDeleteNote)
  const loadNoteContent = useNoteStore((s) => s.loadNoteContent)
  const setDraft = useNoteStore((s) => s.setDraft)
  const setTitle = useNoteStore((s) => s.setTitle)
  const statusIcon = useNoteStore((s) => s.statusIcon)
  const setStatusIcon = useNoteStore((s) => s.setStatusIcon)
  const updateNoteStatusIcon = useNoteStore((s) => s.updateNoteStatusIcon)
  const setEditingId = useNoteStore((s) => s.setEditingId)
  const clearEditor = useNoteStore((s) => s.clearEditor)
  const activeWorkspaceId = useSettingsStore((s) => s.activeWorkspaceId)

  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [pasteStatus, setPasteStatus] = useState<string | null>(null)
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null)
  const [browseMode, setBrowseMode] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const editorCardRef = useRef<HTMLDivElement>(null)

  const isDark = document.documentElement.classList.contains('dark')

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusDropdownOpen) return
    const handle = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) setStatusDropdownOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [statusDropdownOpen])

  // Collapse editor when clicking outside the editor card
  useEffect(() => {
    if (!isFocused) return
    const handle = (e: MouseEvent) => {
      if (editorCardRef.current && !editorCardRef.current.contains(e.target as Node)) {
        setIsFocused(false)
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [isFocused])

  // Reload notes when workspace changes
  useEffect(() => { loadNotes() }, [loadNotes, activeWorkspaceId])

  // ── Draft change with auto-save indicator ──
  const handleDraftChange = useCallback((value: string) => {
    setDraft(value)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    if (value.trim()) {
      setAutoSaving(true)
      autoSaveTimerRef.current = setTimeout(() => setAutoSaving(false), 1200)
    } else {
      setAutoSaving(false)
    }
  }, [setDraft])

  // ── Click note card → load content → extract images → fill editor ──
  const handleNoteClick = useCallback(async (noteId: string) => {
    const content = await loadNoteContent(noteId)

    // Extract markdown image references: ![name](url)
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)\n?/g
    const extractedImages: PastedImage[] = []
    let match: RegExpExecArray | null
    while ((match = imgRegex.exec(content)) !== null) {
      const fileName = match[1] || `image_${extractedImages.length}`
      const rawUrl = match[2]
      let imageUrl: string
      if (rawUrl.startsWith('quickstart://')) {
        imageUrl = rawUrl
      } else if (rawUrl.startsWith('file://')) {
        const parts = rawUrl.replace(/\\/g, '/').split('/')
        const fn = parts[parts.length - 1]
        imageUrl = `quickstart://media/${fn}`
      } else {
        imageUrl = rawUrl
      }
      extractedImages.push({
        id: `loaded_${extractedImages.length}_${Date.now().toString(36)}`,
        fileName, filePath: rawUrl, imageUrl,
      })
    }

    const textOnly = content.replace(imgRegex, '').trimEnd()

    // Get title and statusIcon from note metadata
    const noteMeta = notes.find((n) => n.id === noteId)
    setTitle(noteMeta?.title || '')
    setStatusIcon(noteMeta?.statusIcon || '')
    setDraft(textOnly)
    setPastedImages(extractedImages)
    setEditingId(noteId)
    setBrowseMode(false)
    setShowSearch(false)
    setSearch('')
    setIsFocused(true)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length }
    }, 50)
  }, [loadNoteContent, setDraft, setEditingId, setTitle, notes])

  // ── New note button ──
  const handleNewNote = useCallback(() => {
    clearEditor()
    setPastedImages([])
    setBrowseMode(false)
    setIsFocused(true)
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [clearEditor])

  // ── Paste handler ──
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const hasImage = Array.from(items).some((item) => item.type.startsWith('image/'))
    if (!hasImage) return

    e.preventDefault()
    setPasteStatus('正在保存图片...')
    try {
      const result = await window.api.notes.pasteImage(activeWorkspaceId)
      if (!result.success || !result.imageUrl) {
        setPasteStatus(result.error === 'clipboard has no image' ? '剪贴板无图片' : '图片保存失败')
        setTimeout(() => setPasteStatus(null), 2000)
        return
      }
      setPastedImages((prev) => [...prev, {
        id: Date.now().toString(36),
        fileName: result.fileName!,
        filePath: result.filePath!,
        imageUrl: result.imageUrl!,
      }])
      setPasteStatus('图片已添加')
    } catch (err) {
      console.error('[paste] error:', err)
      setPasteStatus('图片处理失败')
    }
    setTimeout(() => setPasteStatus(null), 2000)
  }, [])

  const removeImage = useCallback((id: string) => {
    setPastedImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  // ── Keyboard shortcut ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape' && editingId) { e.preventDefault(); handleNewNote() }
  }

  // ── Save: create or update ──
  const handleSave = async () => {
    const hasText = draft.trim().length > 0
    const hasTitle = noteTitle.trim().length > 0
    const hasImages = pastedImages.length > 0
    if (!hasText && !hasImages && !hasTitle) return

    let finalContent = draft
    if (hasImages) {
      if (finalContent && !finalContent.endsWith('\n')) finalContent += '\n\n'
      for (const img of pastedImages) {
        const url = img.imageUrl.startsWith('quickstart://') ? img.imageUrl : `quickstart://media/${img.fileName}`
        finalContent += `![${img.fileName}](${url})\n`
      }
    }

    await saveNote(finalContent, noteTitle)
    setPastedImages([])
    setSaveSuccess(true)
    setIsFocused(false)
    textareaRef.current?.blur()
    setTimeout(() => setSaveSuccess(false), 1500)
  }

  // ── Delete with Undo toast (30s) ──
  const handleDelete = useCallback((noteId: string, noteTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Cancel previous undo if any
    if (undoToast) {
      clearTimeout(undoToast.timer)
      clearInterval(undoToast.intervalId)
    }

    // Soft delete immediately
    softDeleteNote(noteId)

    // Start 30s countdown
    let remaining = 30
    const intervalId = setInterval(() => {
      remaining -= 1
      setUndoToast((prev) => prev && prev.noteId === noteId ? { ...prev, remaining } : prev)
      if (remaining <= 0) {
        clearInterval(intervalId)
        setUndoToast(null)
      }
    }, 1000)

    const timer = setTimeout(() => {
      clearInterval(intervalId)
      setUndoToast(null)
    }, 30000)

    setUndoToast({ noteId, noteTitle, timer, remaining, intervalId })
  }, [undoToast, softDeleteNote])

  // ── Undo delete ──
  const handleUndo = useCallback(async () => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    // Restore: save with the same id to un-delete
    await window.api.notes.save(activeWorkspaceId, {
      id: undoToast.noteId,
      content: '',
      title: undoToast.noteTitle
    })
    setUndoToast(null)
    await loadNotes()
  }, [undoToast, loadNotes])

  // ── Force delete now (dismiss toast immediately) ──
  const handleForceDelete = useCallback(() => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    setUndoToast(null)
    // Already soft-deleted, just dismiss the toast — it stays deleted
  }, [undoToast])

  // ── Export single note (modal) ──
  const [exportModalNoteId, setExportModalNoteId] = useState<string | null>(null)
  const exportModalNote = exportModalNoteId ? notes.find((n) => n.id === exportModalNoteId) : null

  const handleExportSingle = useCallback(async (noteId: string, format: 'md' | 'pdf') => {
    setExportModalNoteId(null)
    await window.api.notes.exportSingle(activeWorkspaceId, noteId, format)
  }, [activeWorkspaceId])

  // ── Filtered notes ──
  const filteredNotes = notes.filter(
    (n) => !search || n.title.includes(search) || n.preview.includes(search)
  )
  const charCount = draft.length
  const recentNotes = filteredNotes.slice(0, 3)

  // ── Date groups ──
  const todayStr = new Date().toISOString().split('T')[0]
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const groups: { label: string; notes: NoteMeta[] }[] = []
  const groupMap = new Map<string, NoteMeta[]>()
  for (const note of filteredNotes) {
    const dateStr = note.createdAt.split('T')[0]
    let label: string
    if (dateStr === todayStr) label = '今天'
    else if (dateStr === yesterdayStr) label = '昨天'
    else label = dateStr
    if (!groupMap.has(label)) groupMap.set(label, [])
    groupMap.get(label)!.push(note)
  }
  for (const [label, groupNotes] of groupMap) groups.push({ label, notes: groupNotes })

  // ── Shared note card renderer ──
  const renderNoteCard = (note: NoteMeta, compact = false) => {
    const isEditing = editingId === note.id
    return (
      <div
        key={note.id}
        className={`group flex items-start cursor-pointer transition-all animate-fadeInUp relative`}
        style={{
          padding: compact ? '8px 12px' : '12px 14px',
          gap: compact ? '10px' : '12px',
          borderRadius: '12px',
          background: isEditing
            ? isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.06)'
            : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
          backdropFilter: compact ? undefined : 'blur(12px)',
          border: isEditing
            ? '1.5px solid rgba(139,92,246,0.35)'
            : isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.04)',
          boxShadow: compact
            ? 'none'
            : isDark
              ? '0 2px 8px rgba(0,0,0,0.15)'
              : '0 2px 8px rgba(0,0,0,0.03)',
        }}
        onClick={() => handleNoteClick(note.id)}
      >
        {/* Editing indicator — left purple bar */}
        {isEditing && (
          <div
            className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          />
        )}

        {!compact && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{
              background: isEditing
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : 'linear-gradient(135deg, #667eea33 0%, #764ba233 100%)'
            }}
          >
            {isEditing ? <Pencil size={11} className="text-white" /> : <FileText size={12} className="text-violet-400" />}
          </div>
        )}
        {compact && (
          <div className="flex-shrink-0 mt-0.5">
            {note.statusIcon ? (
              (() => {
                const cfg = getStatusIconCfg(note.statusIcon)
                const Icon = cfg.icon
                return Icon ? <Icon size={11} style={{ color: cfg.active }} /> : <div className="w-1.5 h-1.5 rounded-full" style={{ background: isEditing ? '#8b5cf6' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }} />
              })()
            ) : (
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: isEditing ? '#8b5cf6' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }} />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-[12.5px]'} font-bold ${isEditing ? 'text-violet-600 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-200'} leading-tight`}>
            {!compact && note.statusIcon && (() => {
              const cfg = getStatusIconCfg(note.statusIcon)
              const Icon = cfg.icon
              return Icon ? <Icon size={13} style={{ color: cfg.active }} className="flex-shrink-0" /> : null
            })()}
            <span className="truncate">{note.title}</span>
          </div>
          {!compact && note.preview && note.preview !== note.title && (
            <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate leading-relaxed" style={{ marginTop: '4px' }}>{note.preview}</div>
          )}
          <div className="text-[9px] text-zinc-300 dark:text-zinc-600 font-medium" style={{ marginTop: compact ? '2px' : '4px' }}>
            {new Date(note.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {isEditing && <span className="ml-1.5 text-violet-400 font-bold">编辑中</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ marginRight: '2px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setExportModalNoteId(note.id) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all"
            title="导出"
          >
            <Download size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleNoteClick(note.id) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-violet-500/10 hover:text-violet-500 transition-all"
            title="编辑"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => handleDelete(note.id, note.title, e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-all"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">

      {/* ====== Top bar ====== */}
      <div className="flex items-center flex-shrink-0" style={{ padding: '10px var(--container-padding) 4px var(--container-padding)', minHeight: '38px' }}>
        {showSearch ? (
          /* ── Search mode: back arrow + inline search input ── */
          <div className="flex items-center gap-2 flex-1 min-w-0" style={{ animation: 'searchExpand 200ms cubic-bezier(0.4,0,0.2,1) forwards' }}>
            <button
              onClick={() => { setShowSearch(false); setSearch(''); setBrowseMode(false) }}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-500/8 transition-all flex-shrink-0"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="flex-1 min-w-0 relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-300 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="搜索记录..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); setSearch(''); setBrowseMode(false) } }}
                className="w-full text-[12px] font-medium text-zinc-700 focus:outline-none transition-all placeholder:text-zinc-300"
                style={{
                  padding: '6px 8px 6px 28px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.025)',
                  border: '1px solid rgba(0,0,0,0.04)',
                  caretColor: '#8b5cf6',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.20)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.04)' }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); searchRef.current?.focus() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-zinc-300 hover:text-zinc-500 transition-all"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Normal mode: count + workspace + search icon ── */
          <>
            <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400/70 flex-1">
              {editingId ? '编辑记录' : `${notes.length} 条记录`}
            </span>
            <div className="flex items-center gap-1">
              <WorkspaceDropdown />
              {browseMode && (
                <button
                  onClick={() => { setBrowseMode(false); setShowSearch(false); setSearch('') }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-500 hover:bg-violet-500/6 transition-all"
                  title="返回写作"
                >
                  <ChevronUp size={16} />
                </button>
              )}
              <button
                onClick={() => {
                  setShowSearch(true)
                  setBrowseMode(true)
                  setTimeout(() => searchRef.current?.focus(), 80)
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-500 hover:bg-violet-500/6 transition-all"
                title="搜索"
              >
                <Search size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes searchExpand {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes statusDropIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes undoSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ====== MAIN ====== */}
      {!browseMode ? (
        <>
          {/* ── Editing hint ── */}
          {editingId && (
            <div className="mb-1.5 flex items-center justify-between px-4 py-2 rounded-xl" style={{ margin: '0 var(--container-padding)', background: isDark ? 'rgba(139,92,246,0.10)' : 'rgba(139,92,246,0.06)', border: isDark ? '1px solid rgba(139,92,246,0.15)' : '1px solid rgba(139,92,246,0.10)' }}>
              <span className="text-[11px] font-bold text-violet-500 flex items-center gap-2">
                <Pencil size={11} /> 编辑模式
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleNewNote}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-all"
                  title="取消编辑 (Esc)"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleSave}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all"
                  title="保存 (Ctrl+Enter)"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── EDITOR CARD ── */}
          <div
            ref={editorCardRef}
            className="flex flex-col relative"
            style={{
              flex: isFocused ? '1 1 100%' : '7 1 0%',
              margin: isFocused
                ? '6px var(--container-padding) 16px var(--container-padding)'
                : '6px var(--container-padding) 0 var(--container-padding)',
              borderRadius: '16px',
              background: isFocused
                ? isDark ? '#27272a' : '#ffffff'
                : isDark ? 'rgba(39,39,42,0.40)' : 'rgba(255,255,255,0.50)',
              boxShadow: isFocused
                ? isDark
                  ? '0 0 0 1.5px rgba(139,92,246,0.35), 0 16px 48px -8px rgba(139,92,246,0.20), 0 4px 16px rgba(0,0,0,0.25)'
                  : '0 0 0 1.5px rgba(139,92,246,0.22), 0 16px 48px -8px rgba(139,92,246,0.12), 0 4px 16px rgba(0,0,0,0.06)'
                : isDark
                  ? 'inset 0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.10)'
                  : 'inset 0 2px 6px rgba(0,0,0,0.025), 0 1px 4px rgba(0,0,0,0.04)',
              backdropFilter: isFocused ? undefined : 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: isFocused ? undefined : 'blur(24px) saturate(180%)',
              zIndex: isFocused ? 40 : undefined,
              transition: 'flex 300ms cubic-bezier(0.4,0,0.2,1), margin 300ms cubic-bezier(0.4,0,0.2,1), background 300ms ease, box-shadow 300ms ease',
            }}
          >
            {/* Placeholder */}
            {!draft && !noteTitle && !isFocused && pastedImages.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none animate-fadeIn z-0" style={{ paddingBottom: '48px' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5" style={{ background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', opacity: 0.2 }}>
                  <PenLine size={16} className="text-white" />
                </div>
                <p className="text-[12px] font-medium text-zinc-400/50 dark:text-zinc-500/50">写下你的想法...</p>
                <p className="text-[10px] text-zinc-400/30 dark:text-zinc-500/30 mt-1">支持粘贴图片 Ctrl+V</p>
              </div>
            )}

            {/* Title row: status icon + input */}
            <div className="flex items-center relative" style={{ padding: '0.75rem 1rem 0 0.75rem', gap: '4px', zIndex: 50 }}>
              {/* Status icon trigger */}
              <div className="relative flex-shrink-0" ref={statusDropdownRef} style={{ width: '32px', height: '32px' }}>
                <button
                  type="button"
                  onClick={() => { setStatusDropdownOpen(!statusDropdownOpen); setIsFocused(true) }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
                  style={{ opacity: statusDropdownOpen ? 1 : statusIcon ? 0.8 : 0.45 }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { if (!statusDropdownOpen) e.currentTarget.style.opacity = statusIcon ? '0.8' : '0.45' }}
                >
                  {(() => {
                    const cfg = getStatusIconCfg(statusIcon)
                    return <cfg.icon size={16} style={{ color: statusIcon ? cfg.active : isDark ? '#71717a' : '#a1a1aa' }} />
                  })()}
                </button>

                {/* Horizontal pill menu — opaque, z-9999 */}
                {statusDropdownOpen && (
                  <div
                    className="absolute left-0"
                    style={{
                      top: 'calc(100% + 6px)',
                      zIndex: 9999,
                      borderRadius: '20px',
                      padding: '5px 7px',
                      background: isDark ? '#1e1e21' : '#f9f8ff',
                      boxShadow: isDark
                        ? '0 8px 28px -4px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.18)'
                        : '0 8px 28px -4px rgba(80,60,140,0.18), 0 0 0 1px rgba(139,92,246,0.12)',
                      display: 'flex',
                      gap: '6px',
                      pointerEvents: 'auto' as const,
                      animation: 'statusDropIn 120ms cubic-bezier(0.16,1,0.3,1)',
                    }}
                  >
                    {STATUS_ICONS.map((opt) => {
                      const isActive = statusIcon === opt.key
                      const Icon = opt.icon
                      return (
                        <div key={opt.key} className="relative group/stip">
                          <button
                            onClick={() => { setStatusIcon(opt.key); setStatusDropdownOpen(false) }}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150"
                            style={{
                              background: isActive ? (isDark ? 'rgba(139,92,246,0.20)' : 'rgba(139,92,246,0.13)') : 'transparent',
                              color: isActive ? opt.active : opt.idle,
                              boxShadow: isActive ? (isDark ? '0 0 0 1.5px rgba(139,92,246,0.3)' : '0 0 0 1.5px rgba(139,92,246,0.2)') : 'none',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = opt.hover
                              if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = isActive ? opt.active : opt.idle
                              if (!isActive) e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <Icon size={15} />
                          </button>
                          {/* Tooltip */}
                          <div
                            className="absolute left-1/2 pointer-events-none opacity-0 group-hover/stip:opacity-100 transition-opacity duration-150"
                            style={{
                              top: 'calc(100% + 7px)',
                              transform: 'translateX(-50%)',
                              whiteSpace: 'nowrap',
                              padding: '4px 10px',
                              borderRadius: '7px',
                              background: 'rgba(0,0,0,0.80)',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 500,
                              letterSpacing: '0.01em',
                              zIndex: 10000,
                            }}
                          >
                            {opt.tooltip}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <input
                ref={titleRef}
                type="text"
                value={noteTitle}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); textareaRef.current?.focus() }
                  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleSave() }
                }}
                onFocus={() => setIsFocused(true)}
                placeholder="输入标题..."
                className="flex-1 min-w-0 bg-transparent focus:outline-none text-zinc-800 dark:text-zinc-100 font-bold"
                style={{ paddingLeft: '4px', paddingRight: '4px', fontSize: '16px', lineHeight: '1.5', caretColor: '#8b5cf6' }}
              />
            </div>
            {/* Divider between title and content */}
            <div className="relative z-10" style={{ margin: '8px 1.25rem', height: '1px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              placeholder="正文内容..."
              className="w-full flex-1 bg-transparent resize-none focus:outline-none text-zinc-700 dark:text-zinc-200 relative z-10 placeholder:text-zinc-300/60"
              style={{ padding: '0 1.25rem 0.5rem 1.25rem', fontSize: '14px', lineHeight: '1.85', caretColor: '#8b5cf6' }}
            />

            {/* Image strip */}
            {pastedImages.length > 0 && (
              <div className="flex gap-2.5 px-4 pb-3 flex-shrink-0 overflow-x-auto relative z-10">
                {pastedImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative group flex-shrink-0 rounded-xl overflow-hidden animate-scaleIn cursor-pointer"
                    style={{
                      width: '88px', height: '88px',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                    onClick={() => setPreviewImg(img.imageUrl)}
                  >
                    <img src={img.imageUrl} alt={img.fileName} className="w-full h-full object-cover" draggable={false}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    <button onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <X size={10} className="text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[8px] text-white/90 font-medium truncate pointer-events-none"
                      style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.55))' }}>
                      <ImageIcon size={7} className="inline mr-0.5 -mt-px" />点击查看
                    </div>
                  </div>
                ))}
                {pasteStatus && (
                  <div className="flex items-center gap-1 px-2 text-[11px] text-emerald-500 font-medium animate-fadeIn flex-shrink-0">
                    <ImageIcon size={11} />{pasteStatus}
                  </div>
                )}
              </div>
            )}

            {/* Bottom toolbar */}
            <div
              className="flex items-center justify-between flex-shrink-0 relative z-10"
              style={{
                height: '44px', padding: '0 16px',
                borderTop: isDark ? '1px solid rgba(139,92,246,0.12)' : '1px solid rgba(139,92,246,0.10)',
                background: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(139,92,246,0.03)',
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-400/80 font-medium">
                  <Type size={12} />{charCount > 0 ? `${charCount} 字` : 'Markdown'}
                </span>
                {pastedImages.length > 0 && (
                  <span className="flex items-center gap-1 text-[12px] text-violet-400/80 font-medium">
                    <ImageIcon size={12} />{pastedImages.length} 图
                  </span>
                )}
                {autoSaving && (
                  <span className="flex items-center gap-1 text-[11px] text-violet-400/70 font-medium animate-fadeIn">
                    <Loader2 size={10} className="animate-spin" />已暂存
                  </span>
                )}
              </div>
              {!editingId && (
                <button
                  onClick={handleSave}
                  disabled={!draft.trim() && !noteTitle.trim() && pastedImages.length === 0}
                  className="flex items-center gap-2 text-[13px] font-bold text-white transition-all tracking-wide"
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    marginRight: '4px',
                    ...(saveSuccess
                      ? { background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', boxShadow: '0 3px 12px -2px rgba(67,233,123,0.4)' }
                      : (draft.trim() || noteTitle.trim() || pastedImages.length > 0)
                        ? { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', boxShadow: '0 3px 14px -2px rgba(102,126,234,0.5)' }
                        : { background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: isDark ? '#52525b' : '#a1a1aa', cursor: 'not-allowed', boxShadow: 'none' }),
                  }}
                >
                  {saveSuccess ? <><Check size={14} /> 已保存</> : <><Send size={13} /> CTRL+ENTER</>}
                </button>
              )}
              {editingId && saveSuccess && (
                <span
                  className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-500 animate-fadeIn"
                  style={{ padding: '4px 12px', borderRadius: '20px', marginRight: '8px', background: 'rgba(16,185,129,0.08)' }}
                >
                  <Check size={14} /> 已保存
                </span>
              )}
            </div>
          </div>

          {/* ── RECENT PREVIEW ── */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              flex: isFocused ? '0 0 0px' : '3 1 0%',
              opacity: isFocused ? 0 : 1,
              transition: 'flex 300ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
              pointerEvents: isFocused ? 'none' : undefined,
            }}
          >
            <div className="flex items-center justify-between" style={{ padding: '10px var(--container-padding) 2px var(--container-padding)' }}>
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400/50 dark:text-zinc-500/50">最近记录</span>
              {notes.length > 3 && (
                <button onClick={() => setBrowseMode(true)}
                  className="flex items-center gap-0.5 text-[10px] text-violet-400/70 font-semibold hover:text-violet-500 transition-colors">
                  全部 <ChevronDown size={10} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto stagger" style={{ padding: '6px var(--container-padding) 8px var(--container-padding)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentNotes.map((note) => renderNoteCard(note, true))}
              {recentNotes.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-3 animate-fadeInUp">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5" style={{ background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', opacity: 0.25 }}>
                    <FileText size={12} className="text-white" />
                  </div>
                  <p className="text-[10px] font-medium text-zinc-400/40 dark:text-zinc-500/40">暂无记录</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ====== Full browse mode ====== */
        <div className="flex-1 overflow-y-auto pb-2 pt-1 stagger" style={{ padding: '6px var(--container-padding) 12px var(--container-padding)' }}>
          {groups.map(({ label, notes: groupNotes }) => (
            <div key={label} className="mb-3 animate-fadeInUp">
              <div className="text-[9px] font-bold text-zinc-400/60 dark:text-zinc-500/60 mb-1.5 px-1 uppercase tracking-widest flex items-center gap-2">
                <span>{label}</span>
                <div className="flex-1 h-px bg-zinc-300/20 dark:bg-zinc-600/20" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {groupNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          ))}
          {filteredNotes.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center mt-10 animate-fadeInUp">
              <Search size={20} className="mb-2" style={{ color: 'rgba(139,92,246,0.18)' }} />
              <p className="text-[11px] font-medium text-zinc-400/60">{search ? '没有匹配的记录' : '暂无记录'}</p>
              <p className="text-[9px] text-zinc-400/35 mt-0.5">{search ? '换个关键词试试' : '返回写作模式开始记录'}</p>
            </div>
          )}
        </div>
      )}

      {/* ====== Undo Delete Toast ====== */}
      {undoToast && (
        <div
          className="absolute"
          style={{
            bottom: '24px',
            left: 'var(--container-padding)',
            right: 'var(--container-padding)',
            zIndex: 9990,
            borderRadius: '16px',
            background: isDark ? 'rgba(30,30,33,0.88)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            boxShadow: isDark
              ? '0 12px 40px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)'
              : '0 12px 40px -8px rgba(80,60,140,0.16), 0 0 0 1px rgba(0,0,0,0.04)',
            padding: '14px 16px 10px',
            overflow: 'hidden',
            animation: 'undoSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Trash icon */}
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)' }}>
              <Trash2 size={14} style={{ color: isDark ? '#f87171' : '#ef4444' }} />
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">
                记录已移除
              </p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                「{undoToast.noteTitle}」{undoToast.remaining}s 后永久删除
              </p>
            </div>
            {/* Undo pill */}
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 flex-shrink-0 font-bold transition-all duration-150"
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                background: isDark ? 'rgba(139,92,246,0.14)' : 'rgba(139,92,246,0.10)',
                color: isDark ? '#c4b5fd' : '#7c3aed',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.24)' : 'rgba(139,92,246,0.18)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.14)' : 'rgba(139,92,246,0.10)' }}
            >
              <RotateCcw size={12} /> 撤销
            </button>
            {/* Dismiss X */}
            <button
              onClick={handleForceDelete}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150"
              style={{ color: isDark ? '#52525b' : '#a1a1aa' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = isDark ? '#a1a1aa' : '#71717a'; e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = isDark ? '#52525b' : '#a1a1aa'; e.currentTarget.style.background = 'transparent' }}
              title="立即删除"
            >
              <X size={13} />
            </button>
          </div>
          {/* Countdown progress bar */}
          <div style={{ margin: '10px -16px -10px', height: '3px', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
            <div
              style={{
                height: '100%',
                borderRadius: '0 2px 2px 0',
                background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                width: `${(undoToast.remaining / 30) * 100}%`,
                transition: 'width 1s linear',
              }}
            />
          </div>
        </div>
      )}

      {/* ====== Export Modal ====== */}
      {exportModalNote && (
        <div
          className="fixed inset-0 z-[998] flex items-center justify-center animate-fadeIn"
          style={{
            background: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={() => setExportModalNoteId(null)}
        >
          <div
            className="relative animate-scaleIn"
            style={{
              width: '320px',
              borderRadius: '20px',
              padding: '28px 24px 20px',
              background: isDark ? 'rgba(39,39,42,0.80)' : 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: isDark
                ? '0 24px 64px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)'
                : '0 24px 64px -12px rgba(100,80,160,0.22), 0 0 0 1px rgba(255,255,255,0.5)',
              border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setExportModalNoteId(null)}
              className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full flex items-center justify-center transition-all"
              style={{
                color: isDark ? '#71717a' : '#a1a1aa',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = isDark ? '#a1a1aa' : '#71717a' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = isDark ? '#71717a' : '#a1a1aa' }}
            >
              <X size={14} />
            </button>

            {/* Header */}
            <div style={{ marginBottom: '6px' }}>
              <h3 className="text-[16px] font-bold text-zinc-800 dark:text-zinc-100" style={{ lineHeight: '1.3' }}>
                导出记录
              </h3>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium mt-1.5 truncate" title={exportModalNote.title}>
                「{exportModalNote.title}」
              </p>
            </div>
            <p className="text-[10.5px] text-zinc-400/70 dark:text-zinc-500/60 leading-relaxed" style={{ marginBottom: '20px' }}>
              选择导出格式，内容将包含标题与正文
            </p>

            {/* Format cards */}
            <div className="flex gap-3" style={{ marginBottom: '16px' }}>
              {/* Markdown card */}
              <button
                onClick={() => handleExportSingle(exportModalNote.id, 'md')}
                className="flex-1 flex flex-col items-center gap-2.5 rounded-2xl transition-all duration-200 group/card"
                style={{
                  padding: '20px 12px 16px',
                  background: isDark ? 'rgba(96,165,250,0.08)' : 'rgba(96,165,250,0.06)',
                  border: isDark ? '1.5px solid rgba(96,165,250,0.12)' : '1.5px solid rgba(96,165,250,0.10)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = isDark ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.4)'
                  e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.07)'
                  e.currentTarget.style.transform = 'scale(1.03)'
                  e.currentTarget.style.boxShadow = isDark ? '0 8px 24px -4px rgba(139,92,246,0.2)' : '0 8px 24px -4px rgba(139,92,246,0.12)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDark ? 'rgba(96,165,250,0.12)' : 'rgba(96,165,250,0.10)'
                  e.currentTarget.style.background = isDark ? 'rgba(96,165,250,0.08)' : 'rgba(96,165,250,0.06)'
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: isDark ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.12)' }}
                >
                  <FileText size={20} className="text-blue-500 dark:text-blue-400" />
                </div>
                <div className="text-center">
                  <div className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">.md</div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Markdown</div>
                </div>
              </button>

              {/* PDF card */}
              <button
                onClick={() => handleExportSingle(exportModalNote.id, 'pdf')}
                className="flex-1 flex flex-col items-center gap-2.5 rounded-2xl transition-all duration-200 group/card"
                style={{
                  padding: '20px 12px 16px',
                  background: isDark ? 'rgba(248,113,113,0.08)' : 'rgba(248,113,113,0.05)',
                  border: isDark ? '1.5px solid rgba(248,113,113,0.12)' : '1.5px solid rgba(248,113,113,0.10)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = isDark ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.4)'
                  e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.07)'
                  e.currentTarget.style.transform = 'scale(1.03)'
                  e.currentTarget.style.boxShadow = isDark ? '0 8px 24px -4px rgba(139,92,246,0.2)' : '0 8px 24px -4px rgba(139,92,246,0.12)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDark ? 'rgba(248,113,113,0.12)' : 'rgba(248,113,113,0.10)'
                  e.currentTarget.style.background = isDark ? 'rgba(248,113,113,0.08)' : 'rgba(248,113,113,0.05)'
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: isDark ? 'rgba(248,113,113,0.15)' : 'rgba(248,113,113,0.10)' }}
                >
                  <FileText size={20} className="text-red-500 dark:text-red-400" />
                </div>
                <div className="text-center">
                  <div className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">.pdf</div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">PDF 文档</div>
                </div>
              </button>
            </div>

            {/* Cancel button */}
            <button
              onClick={() => setExportModalNoteId(null)}
              className="w-full text-center text-[12px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ====== Image Lightbox ====== */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center animate-fadeIn"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={() => setPreviewImg(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            onClick={() => setPreviewImg(null)}
          >
            <X size={20} />
          </button>
          <img
            src={previewImg}
            alt="预览"
            className="max-w-[90%] max-h-[85%] object-contain rounded-2xl animate-scaleIn"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
          <span className="absolute bottom-6 text-[12px] text-white/40 font-medium">点击空白处关闭</span>
        </div>
      )}
    </div>
  )
}
