import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import { useNoteStore } from '../../stores/noteStore'
import {
  ChevronDown, Plus, Check, X, Pencil, Trash2, RotateCcw
} from 'lucide-react'

const WS_COLORS = [
  '#667eea', '#764ba2', '#f093fb', '#43e97b',
  '#f5576c', '#0ea5e9', '#eab308', '#ec4899',
]

const DROPDOWN_MIN_W = 220
const UNDO_DURATION = 30 // seconds

interface UndoToast {
  wsId: string
  wsName: string
  timer: ReturnType<typeof setTimeout>
  remaining: number
  intervalId: ReturnType<typeof setInterval>
}

export default function WorkspaceDropdown() {
  const workspaces = useSettingsStore((s) => s.workspaces)
  const activeId = useSettingsStore((s) => s.activeWorkspaceId)
  const setActive = useSettingsStore((s) => s.setActiveWorkspace)
  const loadWorkspaces = useSettingsStore((s) => s.loadWorkspaces)
  const loadNotes = useNoteStore((s) => s.loadNotes)
  const clearEditor = useNoteStore((s) => s.clearEditor)

  const activeWs = workspaces.find((w) => w.id === activeId)

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(WS_COLORS[0])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  // Undo toast state for 30s countdown delete
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null)
  // Temporarily removed workspace (for undo)
  const [removedWs, setRemovedWs] = useState<{ id: string; name: string; color: string; folderName: string } | null>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Cleanup undo toast on unmount
  useEffect(() => {
    return () => {
      if (undoToast) {
        clearTimeout(undoToast.timer)
        clearInterval(undoToast.intervalId)
      }
    }
  }, [undoToast])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAdding(false)
        setRenamingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) loadWorkspaces()
  }, [open, loadWorkspaces])

  useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 50)
  }, [adding])

  useEffect(() => {
    if (renamingId) setTimeout(() => renameRef.current?.focus(), 50)
  }, [renamingId])

  // ── Switch workspace ──
  const handleSwitch = async (wsId: string) => {
    if (wsId === activeId) { setOpen(false); return }
    await setActive(wsId)
    clearEditor()
    await loadNotes()
    setOpen(false)
  }

  // ── Create workspace ──
  const handleCreate = async () => {
    if (!newName.trim()) return
    const res = await window.api.workspace.create(newName.trim(), newColor)
    if (res.success) {
      setAdding(false); setNewName(''); setNewColor(WS_COLORS[0])
      await loadWorkspaces()
    }
  }

  // ── Rename workspace ──
  const handleRename = async (wsId: string) => {
    if (!renameText.trim()) return
    const res = await window.api.workspace.rename(wsId, renameText.trim())
    if (res.success) { setRenamingId(null); setRenameText(''); await loadWorkspaces() }
  }

  // ── Soft delete with 30s undo countdown ──
  const handleSoftDelete = useCallback(async (wsId: string) => {
    // Protect: cannot delete if only one workspace left
    if (workspaces.length <= 1) return

    const ws = workspaces.find(w => w.id === wsId)
    if (!ws) return

    // Cancel previous undo if any
    if (undoToast) {
      clearTimeout(undoToast.timer)
      clearInterval(undoToast.intervalId)
      // Execute previous pending delete
      if (removedWs) {
        await window.api.workspace.delete(removedWs.id)
      }
    }

    // Store removed workspace for potential restore
    setRemovedWs({ id: ws.id, name: ws.name, color: ws.color, folderName: ws.folderName })

    // If deleting active workspace, switch to another
    if (wsId === activeId) {
      const otherWs = workspaces.find(w => w.id !== wsId)
      if (otherWs) {
        await setActive(otherWs.id)
        clearEditor()
        await loadNotes()
      }
    }

    // Start countdown
    let remaining = UNDO_DURATION
    const intervalId = setInterval(() => {
      remaining -= 1
      setUndoToast(prev => prev ? { ...prev, remaining } : null)
    }, 1000)

    const timer = setTimeout(async () => {
      clearInterval(intervalId)
      await window.api.workspace.delete(wsId)
      setUndoToast(null)
      setRemovedWs(null)
      await loadWorkspaces()
    }, UNDO_DURATION * 1000)

    setUndoToast({ wsId, wsName: ws.name, timer, remaining, intervalId })
    setOpen(false)
  }, [workspaces, undoToast, removedWs, activeId, setActive, clearEditor, loadNotes, loadWorkspaces])

  // ── Undo delete ──
  const handleUndo = useCallback(async () => {
    if (!undoToast || !removedWs) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    setUndoToast(null)
    setRemovedWs(null)
    // No need to restore - workspace was never actually deleted
    await loadWorkspaces()
  }, [undoToast, removedWs, loadWorkspaces])

  // ── Force delete now (dismiss toast) ──
  const handleForceDelete = useCallback(async () => {
    if (!undoToast || !removedWs) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    await window.api.workspace.delete(removedWs.id)
    setUndoToast(null)
    setRemovedWs(null)
    await loadWorkspaces()
  }, [undoToast, removedWs, loadWorkspaces])

  // ── Dropdown position: right-aligned ──
  const [pos, setPos] = useState({ top: 0, right: 0 })

  const recalcPos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const viewW = window.innerWidth
    setPos({ top: rect.bottom + 8, right: viewW - rect.right })
  }, [])

  useEffect(() => {
    if (open) {
      recalcPos()
      window.addEventListener('resize', recalcPos)
      return () => window.removeEventListener('resize', recalcPos)
    }
  }, [open, recalcPos])

  return (
    <>
      {/* ── Trigger button — minimal: dot + text + arrow, no solid bg ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-all active:scale-95"
        style={{
          background: 'transparent',
          border: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)' }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: activeWs?.color || '#667eea' }} />
        <span className="text-[12px] font-medium text-zinc-500 truncate" style={{ maxWidth: '80px' }}>
          {activeWs?.name || '默认'}
        </span>
        <ChevronDown
          size={10}
          className="text-zinc-400 flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {/* ── Dropdown panel (portal) ── */}
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed"
          style={{
            top: `${pos.top}px`,
            right: `${pos.right}px`,
            minWidth: `${DROPDOWN_MIN_W}px`,
            zIndex: 9900,
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.98)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 10px 40px -5px rgba(0,0,0,0.13), 0 4px 12px -2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
            animation: 'wsDropIn 140ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
          }}
        >
          {/* ═══ Workspace list ═══ */}
          <div style={{ padding: '6px', maxHeight: '220px', overflowY: 'auto' }}>
            {workspaces.filter(ws => !removedWs || ws.id !== removedWs.id).map((ws) => {
              const isActive = ws.id === activeId
              const isRenaming = renamingId === ws.id

              return (
                <div
                  key={ws.id}
                  className="group flex items-center gap-2.5 cursor-pointer"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    minHeight: '36px',
                    background: isActive ? 'rgba(139,92,246,0.07)' : undefined,
                    transition: 'background 100ms ease',
                  }}
                  onClick={() => !isRenaming && handleSwitch(ws.id)}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(139,92,246,0.04)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(139,92,246,0.07)' : 'transparent' }}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ws.color || '#667eea' }} />

                  {isRenaming ? (
                    <input
                      ref={renameRef}
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(ws.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 text-[12px] font-semibold bg-transparent focus:outline-none text-zinc-700"
                      style={{ caretColor: '#8b5cf6' }}
                    />
                  ) : (
                    <span className={`flex-1 min-w-0 text-[12px] font-semibold truncate ${isActive ? 'text-violet-600' : 'text-zinc-600'}`}>
                      {ws.name}
                    </span>
                  )}

                  {/* Hover actions: rename + delete */}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingId(ws.id); setRenameText(ws.name)
                        }}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10 transition-all"
                        title="重命名"
                      >
                        <Pencil size={10} />
                      </button>
                      {ws.id !== 'default' && workspaces.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSoftDelete(ws.id); setRenamingId(null)
                          }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-500/10 transition-all"
                          title="删除"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Rename confirm buttons */}
                  {isRenaming && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRename(ws.id) }}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 transition-all"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingId(null) }}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-500/10 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ═══ Divider + Add workspace ═══ */}
          <div style={{ padding: '4px 6px 6px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            {!adding ? (
              <button
                onClick={() => { setAdding(true); setRenamingId(null) }}
                className="w-full flex items-center gap-2 text-[11px] font-semibold text-violet-500 active:scale-[0.98] transition-all"
                style={{ padding: '8px 10px', borderRadius: '8px' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Plus size={13} /> 新建工作区
              </button>
            ) : (
              <div style={{ padding: '12px 14px 14px' }}>
                {/* Section 1: Name input */}
                <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 block">
                  名称
                </label>
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setAdding(false); setNewName('') }
                  }}
                  placeholder="输入工作区名称..."
                  className="w-full text-[12px] font-medium focus:outline-none text-zinc-700"
                  style={{
                    caretColor: '#8b5cf6',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.025)',
                    border: '1px solid rgba(139,92,246,0.12)',
                    transition: 'border-color 150ms ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.12)' }}
                />

                {/* Section 2: Color picker */}
                <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 block mt-3.5">
                  颜色
                </label>
                <div className="flex items-center gap-2.5">
                  {WS_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className="relative rounded-full transition-all hover:scale-110"
                      style={{
                        width: '20px', height: '20px', background: c,
                        boxShadow: newColor === c
                          ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3.5px ${c}`
                          : '0 1px 3px rgba(0,0,0,0.10)',
                        transform: newColor === c ? 'scale(1.1)' : undefined,
                      }}
                    >
                      {newColor === c && (
                        <Check size={10} className="absolute inset-0 m-auto text-white drop-shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Section 3: Action buttons */}
                <div className="flex items-center gap-2.5 mt-4">
                  <button
                    onClick={() => { setAdding(false); setNewName(''); setNewColor(WS_COLORS[0]) }}
                    className="flex-1 text-[11px] font-semibold rounded-lg transition-all"
                    style={{
                      padding: '8px 0',
                      color: '#71717a',
                      background: 'transparent',
                      border: '1px solid rgba(0,0,0,0.08)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="flex-1 text-[11px] font-bold rounded-lg transition-all"
                    style={{
                      padding: '8px 0',
                      border: 'none',
                      background: newName.trim()
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'rgba(0,0,0,0.04)',
                      color: newName.trim() ? '#fff' : '#a1a1aa',
                      cursor: newName.trim() ? 'pointer' : 'not-allowed',
                      boxShadow: newName.trim() ? '0 2px 8px -2px rgba(102,126,234,0.4)' : 'none',
                    }}
                    onMouseDown={(e) => { if (newName.trim()) (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
                    onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
                  >
                    创建工作区
                  </button>
                </div>
              </div>
            )}
          </div>

          <style>{`
            @keyframes wsDropIn {
              from { opacity: 0; transform: translateY(-6px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>,
        document.body
      )}

      {/* ═══ Undo Delete Toast (Portal) ═══ */}
      {undoToast && createPortal(
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            width: 'min(420px, calc(100% - 32px))',
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 16,
            border: '1px solid rgba(196,181,253,0.5)',
            boxShadow: '0 8px 32px rgba(139,92,246,0.18), 0 2px 8px rgba(139,92,246,0.08)',
            padding: '14px 16px 12px',
            overflow: 'hidden',
            animation: 'undoSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
            zIndex: 10000,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <Trash2 size={14} className="text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-700 font-medium">
                工作区已移除
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                「{undoToast.wsName}」· {undoToast.remaining}s 后永久删除
              </p>
            </div>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-violet-500 cursor-pointer transition-all hover:text-violet-400"
            >
              <RotateCcw size={12} /> 撤销
            </button>
            <button
              onClick={handleForceDelete}
              className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 cursor-pointer transition-colors hover:text-violet-600 hover:bg-violet-500/10"
            >
              <X size={14} />
            </button>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: 2,
              borderRadius: '0 2px 2px 0',
              background: 'linear-gradient(90deg, #a78bfa, #e879f9)',
              width: `${(undoToast.remaining / UNDO_DURATION) * 100}%`,
              transition: 'width 1s linear',
            }}
          />
          <style>{`
            @keyframes undoSlideIn {
              from { opacity: 0; transform: translateX(-50%) translateY(16px); }
              to   { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </>
  )
}
