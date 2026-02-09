import { useEffect, useState, useRef, useCallback } from 'react'
import { useNoteStore } from '../../stores/noteStore'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  Search, Trash2, Send, Check, FileText, Image as ImageIcon,
  ChevronDown, ChevronUp, Loader2, Type, X, PenLine, Pencil, Undo2, ArrowLeft
} from 'lucide-react'
import WorkspaceDropdown from './WorkspaceDropdown'

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

  const isDark = document.documentElement.classList.contains('dark')

  // Reload notes when workspace changes
  useEffect(() => { loadNotes() }, [loadNotes, activeWorkspaceId])
  useEffect(() => { titleRef.current?.focus() }, [])

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

    // Get title from note metadata
    const noteMeta = notes.find((n) => n.id === noteId)
    setTitle(noteMeta?.title || '')
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
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: isEditing ? '#8b5cf6' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }} />
        )}

        <div className="flex-1 min-w-0">
          <div className={`${compact ? 'text-[11px]' : 'text-[12.5px]'} font-bold ${isEditing ? 'text-violet-600 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-200'} truncate leading-tight`}>
            {note.title}
          </div>
          {!compact && note.preview && note.preview !== note.title && (
            <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate leading-relaxed" style={{ marginTop: '4px' }}>{note.preview}</div>
          )}
          <div className="text-[9px] text-zinc-300 dark:text-zinc-600 font-medium" style={{ marginTop: compact ? '2px' : '4px' }}>
            {new Date(note.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            {isEditing && <span className="ml-1.5 text-violet-400 font-bold">编辑中</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ marginRight: '2px' }}>
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
            className="flex flex-col overflow-hidden transition-all duration-400 ease-out relative"
            style={{
              flex: '7 1 0%',
              margin: '6px var(--container-padding) 0 var(--container-padding)',
              borderRadius: '16px',
              background: isDark
                ? (isFocused ? 'rgba(39,39,42,0.65)' : 'rgba(39,39,42,0.40)')
                : (isFocused ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.50)'),
              boxShadow: isFocused
                ? isDark
                  ? '0 0 0 1.5px rgba(139,92,246,0.35), 0 8px 40px -4px rgba(139,92,246,0.18), inset 0 1px 0 rgba(255,255,255,0.04)'
                  : '0 0 0 1.5px rgba(139,92,246,0.22), 0 8px 40px -4px rgba(139,92,246,0.10), inset 0 1px 0 rgba(255,255,255,0.6)'
                : isDark
                  ? 'inset 0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.10)'
                  : 'inset 0 2px 6px rgba(0,0,0,0.025), 0 1px 4px rgba(0,0,0,0.04)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
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

            {/* Title Input */}
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
              onBlur={() => { if (!draft.trim() && !noteTitle.trim() && pastedImages.length === 0) setIsFocused(false) }}
              placeholder="输入标题..."
              className="w-full bg-transparent focus:outline-none text-zinc-800 dark:text-zinc-100 font-bold relative z-10"
              style={{ padding: '1rem 1.25rem 0 1.25rem', fontSize: '16px', lineHeight: '1.5', caretColor: '#8b5cf6' }}
            />
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
              onBlur={() => { if (!draft.trim() && !noteTitle.trim() && pastedImages.length === 0) setIsFocused(false) }}
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
          <div className="flex flex-col overflow-hidden transition-all duration-500 ease-out" style={{ flex: '3 1 0%' }}>
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
          className="absolute z-50 animate-fadeInUp"
          style={{
            bottom: 'var(--container-padding)',
            left: 'var(--container-padding)',
            right: 'var(--container-padding)',
            borderRadius: '14px',
            background: isDark ? '#27272a' : '#ffffff',
            boxShadow: isDark
              ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)'
              : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
            padding: '12px 16px',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                已删除「{undoToast.noteTitle}」
              </p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                {undoToast.remaining}s 后永久删除
              </p>
            </div>
            <button
              onClick={handleForceDelete}
              className="px-3 py-2 text-[11px] font-bold rounded-xl transition-all flex-shrink-0"
              style={{ background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)', color: '#ef4444' }}
            >
              删除
            </button>
            <button
              onClick={handleUndo}
              className="px-3 py-2 text-[11px] font-bold rounded-xl transition-all flex-shrink-0"
              style={{ background: isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.08)', color: '#8b5cf6' }}
            >
              撤销
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
