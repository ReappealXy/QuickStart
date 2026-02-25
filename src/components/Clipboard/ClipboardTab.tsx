import { useState, useEffect, useCallback, useRef } from 'react'
import { ClipboardList, Trash2, Copy, Check, Image as ImageIcon, FileText, X, Pencil, RotateCcw, FolderOpen } from 'lucide-react'

const CLIPBOARD_DISPLAY_LIMIT = 100

// ═══════════════════════════════════════════════════════════════════
// 文本预览 Modal（流光溢彩 · 查看即编辑）
// ═══════════════════════════════════════════════════════════════════
function TextPreviewModal({
  selectedText,
  setSelectedText,
  copiedId,
  setCopiedId,
  items,
  setItems,
  initialEditing = false,
}: {
  selectedText: { id: string; content: string }
  setSelectedText: (v: { id: string; content: string } | null) => void
  copiedId: string | null
  setCopiedId: (v: string | null) => void
  items: ClipboardHistoryItem[]
  setItems: React.Dispatch<React.SetStateAction<ClipboardHistoryItem[]>>
  initialEditing?: boolean
}) {
  const [isEditing, setIsEditing] = useState(initialEditing)
  const [editContent, setEditContent] = useState(selectedText.content)
  const [toast, setToast] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus when entering edit mode (including initial)
  useEffect(() => {
    if (isEditing) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [isEditing])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const handleStartEdit = () => {
    setEditContent(selectedText.content)
    setIsEditing(true)
  }

  const handleReset = () => {
    setEditContent(selectedText.content)
  }

  const handleSave = async () => {
    if (!editContent.trim()) return
    const res = await window.api.clipboard.updateItem(selectedText.id, editContent.trim())
    if (res.success) {
      setItems(prev => prev.map(i => i.id === selectedText.id ? { ...i, content: editContent.trim(), preview: editContent.trim().substring(0, 200) } : i))
      setSelectedText({ id: selectedText.id, content: editContent.trim() })
      showToast('保存成功')
      setTimeout(() => setIsEditing(false), 200)
      return
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditContent(selectedText.content)
    setIsEditing(false)
  }

  const handleCopy = async () => {
    await window.api.clipboard.writeBack(selectedText.id)
    setCopiedId(selectedText.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center animate-fadeIn"
      style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(168,85,247,0.05) 50%, rgba(139,92,246,0.08) 100%)', backdropFilter: 'blur(16px)' }}
      onClick={() => { if (!isEditing) setSelectedText(null) }}
    >
      <div
        className="flex flex-col animate-scaleIn"
        style={{
          width: '92vw',
          maxWidth: '1200px',
          height: '85vh',
          background: 'rgba(250,245,255,0.88)',
          backdropFilter: 'blur(32px) saturate(180%)',
          borderRadius: '24px',
          boxShadow: '0 24px 80px -12px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.08)',
          border: '1px solid rgba(167,139,250,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══ 顶部工具栏 ═══ */}
        <div
          className="flex-shrink-0 flex items-center justify-between"
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid rgba(139,92,246,0.1)',
            background: 'rgba(255,255,255,0.68)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          <span className="text-[11px] font-semibold text-violet-500 tracking-wide">
            {isEditing ? '编辑模式' : '文本预览'}
          </span>

          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                {/* 保存 */}
                <button
                  onClick={handleSave}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(16,185,129,0.28)',
                    color: '#10b981',
                    boxShadow: '0 3px 10px -8px rgba(16,185,129,0.6)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.13)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.82)' }}
                  title="保存 (Ctrl+Enter)"
                >
                  <Check size={14} />
                </button>
                {/* 重置 */}
                <button
                  onClick={handleReset}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(167,139,250,0.28)',
                    color: '#8b5cf6',
                    boxShadow: '0 3px 10px -8px rgba(139,92,246,0.55)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.13)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.82)' }}
                  title="重置"
                >
                  <RotateCcw size={12} />
                </button>
                {/* 取消 */}
                <button
                  onClick={handleCancelEdit}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    color: '#f87171',
                    boxShadow: '0 3px 10px -8px rgba(248,113,113,0.55)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.82)' }}
                  title="放弃修改"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                {/* 编辑 */}
                <button
                  onClick={handleStartEdit}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(167,139,250,0.28)',
                    color: '#8b5cf6',
                    boxShadow: '0 3px 10px -8px rgba(139,92,246,0.55)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.13)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.82)' }}
                  title="编辑"
                >
                  <Pencil size={12} />
                </button>
                {/* 复制 */}
                <button
                  onClick={handleCopy}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: `1px solid ${copiedId === selectedText.id ? 'rgba(16,185,129,0.28)' : 'rgba(167,139,250,0.28)'}`,
                    color: copiedId === selectedText.id ? '#10b981' : '#8b5cf6',
                    boxShadow: '0 3px 10px -8px rgba(139,92,246,0.55)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.13)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.82)' }}
                  title="复制"
                >
                  {copiedId === selectedText.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
                {/* 关闭 */}
                <button
                  onClick={() => setSelectedText(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid rgba(161,161,170,0.25)',
                    color: '#a1a1aa',
                    boxShadow: '0 3px 10px -8px rgba(113,113,122,0.45)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.82)'; e.currentTarget.style.color = '#a1a1aa' }}
                  title="关闭"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ═══ 内容区域 ═══ */}
        <div
          className="flex-1 overflow-hidden relative"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.25) transparent' }}
        >
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSave() } if (e.key === 'Escape') handleCancelEdit() }}
              className="absolute inset-0 w-full h-full text-[13px] text-zinc-700 resize-none focus:outline-none font-mono overflow-y-auto"
              style={{
                padding: '24px 40px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                lineHeight: '1.75',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
                caretColor: '#8b5cf6',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(139,92,246,0.25) transparent',
              }}
            />
          ) : (
            <div className="absolute inset-0 overflow-y-auto" style={{ padding: '24px 40px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.25) transparent' }}>
              <pre
                className="text-[13px] font-mono"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#3f3f46',
                  lineHeight: '1.75',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
                }}
              >
                {selectedText.content}
              </pre>
            </div>
          )}
        </div>
      </div>
      {!isEditing && <span className="absolute bottom-5 text-[11px] text-violet-400/50 font-medium">点击空白处关闭</span>}

      {/* ═══ 保存成功 Toast ═══ */}
      {toast && (
        <div
          className="absolute font-medium text-white text-[13px]"
          style={{
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 24px',
            background: 'rgba(139,92,246,0.92)',
            backdropFilter: 'blur(12px)',
            borderRadius: 12,
            boxShadow: '0 8px 24px -4px rgba(139,92,246,0.35)',
            animation: 'toastSlideIn 250ms ease-out',
            zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}

      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ── Undo toast state ── */
interface UndoToast {
  item: ClipboardHistoryItem
  timer: ReturnType<typeof setTimeout>
  remaining: number
  intervalId: ReturnType<typeof setInterval>
}

export default function ClipboardTab() {
  const [items, setItems] = useState<ClipboardHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState<{ id: string; content: string; editing?: boolean } | null>(null)
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null)
  const [restoredId, setRestoredId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    const res = await window.api.clipboard.getHistory(CLIPBOARD_DISPLAY_LIMIT, 0)
    setItems(res.items.slice(0, CLIPBOARD_DISPLAY_LIMIT))
    setTotal(res.total)
  }, [])

  useEffect(() => {
    loadHistory()
    const cleanup = window.api.clipboard.onNewItem((item) => {
      setItems(prev =>
        [item, ...prev.filter(i => !(i.type === 'text' && i.content === item.content))]
          .slice(0, CLIPBOARD_DISPLAY_LIMIT)
      )
      setTotal(prev => prev + 1)
    })
    return cleanup
  }, [loadHistory])

  const handleCopy = async (item: ClipboardHistoryItem) => {
    const res = await window.api.clipboard.writeBack(item.id)
    if (res.success) { setCopiedId(item.id); setTimeout(() => setCopiedId(null), 1500) }
  }

  const handleDelete = useCallback((item: ClipboardHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation()

    // Cancel previous undo if any
    if (undoToast) {
      clearTimeout(undoToast.timer)
      clearInterval(undoToast.intervalId)
      // Execute previous pending delete
      window.api.clipboard.deleteItem(undoToast.item.id)
    }

    // Soft delete immediately from UI
    setItems(prev => prev.filter(i => i.id !== item.id))
    setTotal(prev => Math.max(0, prev - 1))

    // Start countdown
    let remaining = 30
    const intervalId = setInterval(() => {
      remaining -= 1
      setUndoToast(prev => prev ? { ...prev, remaining } : null)
    }, 1000)

    const timer = setTimeout(async () => {
      clearInterval(intervalId)
      await window.api.clipboard.deleteItem(item.id)
      setUndoToast(null)
    }, 30000)

    setUndoToast({ item, timer, remaining, intervalId })
  }, [undoToast])

  // ── Undo delete ──
  const handleUndo = useCallback(() => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    const itemId = undoToast.item.id
    // Restore item to list (insert at original position by timestamp)
    setItems(prev => {
      const newItems = [undoToast.item, ...prev.filter(i => i.id !== undoToast.item.id)]
        .sort((a, b) => b.timestamp - a.timestamp)
      return newItems.slice(0, CLIPBOARD_DISPLAY_LIMIT)
    })
    setTotal(prev => prev + 1)
    setUndoToast(null)
    // Trigger fade-in animation
    setRestoredId(itemId)
    setTimeout(() => setRestoredId(null), 400)
  }, [undoToast])

  // ── Force delete now (dismiss toast immediately) ──
  const handleForceDelete = useCallback(async () => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    await window.api.clipboard.deleteItem(undoToast.item.id)
    setUndoToast(null)
  }, [undoToast])

  // Open modal in edit mode directly
  const openEditModal = (item: ClipboardHistoryItem) => {
    setSelectedText({ id: item.id, content: item.content, editing: true })
  }

  const filtered = search.trim() ? items.filter(i => i.type === 'text' && i.content.toLowerCase().includes(search.toLowerCase())) : items

  const formatTime = (ts: number) => {
    const d = new Date(ts), now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    if (d.toDateString() === now.toDateString()) return `今天 ${time}`
    const y = new Date(now); y.setDate(y.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return `昨天 ${time}`
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
  }

  return (
    <div className="h-full flex flex-col" style={{ padding: '0 var(--container-padding)' }}>
      <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '14px 2px 10px' }}>
        <div className="flex items-center gap-2">
          <ClipboardList size={15} style={{ color: '#8b5cf6' }} />
          <span className="text-[13px] font-bold text-zinc-700">剪贴板</span>
          {total > 0 && (
            <span className="text-[10px] font-medium text-zinc-400">
              共{total}条{total > CLIPBOARD_DISPLAY_LIMIT ? `，仅展示前${CLIPBOARD_DISPLAY_LIMIT}条` : ''}
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 relative" style={{ marginBottom: '8px' }}>
        <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索..." className="w-full text-[12px] text-zinc-700 placeholder-zinc-400/50 focus:outline-none" style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.05)' }} />
      </div>
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '12px' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ marginTop: '25%' }}>
            <ClipboardList size={28} style={{ color: 'rgba(139,92,246,0.15)' }} />
            <p className="text-[11px] text-zinc-400/50 mt-3">{search ? '没有匹配' : '暂无记录'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((item) => (
              <div key={item.id} className="group rounded-xl cursor-pointer transition-all hover:shadow-md" style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.04)', animation: restoredId === item.id ? 'cardFadeIn 300ms ease-out' : undefined }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.15)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.04)' }} onClick={() => { if (item.type === 'text') setSelectedText({ id: item.id, content: item.content }); else if (item.type === 'image') handleCopy(item) }}>
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: item.type === 'image' ? 'rgba(139,92,246,0.08)' : 'rgba(100,116,139,0.06)' }}>
                    {item.type === 'image' ? <ImageIcon size={13} style={{ color: '#8b5cf6' }} /> : <FileText size={13} style={{ color: '#94a3b8' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.type === 'image' ? (
                      <div className="rounded-lg overflow-hidden cursor-pointer" style={{ maxHeight: '100px' }} onClick={(e) => { e.stopPropagation(); setPreviewImg(item.imagePath ? `quickstart://clipboard/${item.imagePath}` : item.preview) }}>
                        <img src={item.imagePath ? `quickstart://clipboard/${item.imagePath}` : item.preview} className="w-full object-cover rounded-lg" style={{ maxHeight: '100px' }} draggable={false} />
                      </div>
                    ) : (
                      <p className="text-[12px] text-zinc-600" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.preview || item.content}</p>
                    )}
                    <div className="flex items-center justify-between mt-2.5 mb-0.5">
                      <span className="text-[9px] text-zinc-400/60">{formatTime(item.timestamp)}</span>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.type === 'text' && <button onClick={(e) => { e.stopPropagation(); openEditModal(item) }} className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10" title="编辑"><Pencil size={10} /></button>}
                        <button onClick={(e) => { e.stopPropagation(); window.api.clipboard.openStorageDir() }} className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10" title="打开存储文件夹"><FolderOpen size={11} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleCopy(item) }} className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all hover:bg-violet-500/10" style={{ color: copiedId === item.id ? '#10b981' : '#a1a1aa' }} onMouseEnter={(e) => { if (copiedId !== item.id) e.currentTarget.style.color = '#8b5cf6' }} onMouseLeave={(e) => { if (copiedId !== item.id) e.currentTarget.style.color = '#a1a1aa' }} title="复制内容">{copiedId === item.id ? <Check size={11} /> : <Copy size={11} />}</button>
                        <button onClick={(e) => handleDelete(item, e)} className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-all text-zinc-400 hover:text-red-500 hover:bg-red-500/10" title="删除记录"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {previewImg && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setPreviewImg(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white/80 cursor-pointer transition-all hover:text-white hover:bg-white/20" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => setPreviewImg(null)}><X size={20} /></button>
          <img src={previewImg} className="max-w-[90%] max-h-[85%] object-contain rounded-2xl" onClick={(e) => e.stopPropagation()} draggable={false} />
          <span className="absolute bottom-6 text-[12px] text-white/40">点击空白处关闭</span>
        </div>
      )}

      {selectedText && <TextPreviewModal
        selectedText={selectedText}
        setSelectedText={setSelectedText}
        copiedId={copiedId}
        setCopiedId={setCopiedId}
        items={items}
        setItems={setItems}
        initialEditing={selectedText.editing}
      />}

      {/* ====== Undo Delete Toast ====== */}
      {undoToast && (
        <div
          className="absolute"
          style={{
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            width: 'min(420px, calc(100% - 32px))',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 16,
            border: '1px solid rgba(196,181,253,0.5)',
            boxShadow: '0 8px 32px rgba(139,92,246,0.15), 0 2px 8px rgba(139,92,246,0.08)',
            padding: '14px 16px 12px',
            overflow: 'hidden',
            animation: 'undoSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
            zIndex: 1000,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <Trash2 size={14} className="text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-700 font-medium">
                已移除记录
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                {undoToast.item.type === 'text' 
                  ? `「${undoToast.item.content.slice(0, 20)}${undoToast.item.content.length > 20 ? '...' : ''}」` 
                  : '「图片」'
                } · {undoToast.remaining}s 后永久删除
              </p>
            </div>
            {/* Undo pill */}
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-violet-500 cursor-pointer transition-all hover:text-violet-400"
            >
              <RotateCcw size={12} /> 撤销
            </button>
            {/* Dismiss X */}
            <button
              onClick={handleForceDelete}
              className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 cursor-pointer transition-colors hover:text-violet-600 hover:bg-violet-500/10"
            >
              <X size={14} />
            </button>
          </div>
          {/* Progress bar */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: 2,
              borderRadius: '0 2px 2px 0',
              background: 'linear-gradient(90deg, #a78bfa, #e879f9)',
              width: `${(undoToast.remaining / 30) * 100}%`,
              transition: 'width 1s linear',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes undoSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes cardFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
