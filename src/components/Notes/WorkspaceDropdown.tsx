import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import { useNoteStore } from '../../stores/noteStore'
import {
  ChevronDown, Plus, Check, X, Pencil, Trash2, AlertTriangle
} from 'lucide-react'

const WS_COLORS = [
  '#667eea', '#764ba2', '#f093fb', '#43e97b',
  '#f5576c', '#0ea5e9', '#eab308', '#ec4899',
]

const DROPDOWN_MIN_W = 220
const DELETE_COUNTDOWN = 5

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

  // Delete state: countdown-based confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteCountdown, setDeleteCountdown] = useState(DELETE_COUNTDOWN)
  const deleteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // ── Cleanup delete timer on unmount ──
  const cancelDelete = useCallback(() => {
    if (deleteTimerRef.current) { clearInterval(deleteTimerRef.current); deleteTimerRef.current = null }
    setDeleteTarget(null)
    setDeleteCountdown(DELETE_COUNTDOWN)
  }, [])

  useEffect(() => cancelDelete, [cancelDelete])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAdding(false)
        setRenamingId(null)
        cancelDelete()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, cancelDelete])

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

  // ── Initiate delete with countdown ──
  const startDelete = (wsId: string) => {
    cancelDelete()
    setDeleteTarget(wsId)
    setDeleteCountdown(DELETE_COUNTDOWN)
    deleteTimerRef.current = setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          if (deleteTimerRef.current) clearInterval(deleteTimerRef.current)
          deleteTimerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // ── Execute delete ──
  const executeDelete = async (wsId: string) => {
    cancelDelete()
    const res = await window.api.workspace.delete(wsId)
    if (res.success) {
      await loadWorkspaces()
      if (wsId === activeId) {
        const list = await window.api.workspace.list()
        if (list.length > 0) { await setActive(list[0].id); clearEditor(); await loadNotes() }
      }
    }
  }

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

  // ── Helper: find ws name for delete confirm ──
  const deleteWsName = deleteTarget ? workspaces.find((w) => w.id === deleteTarget)?.name || '' : ''

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
            {workspaces.map((ws) => {
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

                  {isActive && !isRenaming && (
                    <Check size={12} className="text-violet-500 flex-shrink-0" />
                  )}

                  {/* Hover actions: rename + delete */}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingId(ws.id); setRenameText(ws.name); cancelDelete()
                        }}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10 transition-all"
                        title="重命名"
                      >
                        <Pencil size={10} />
                      </button>
                      {ws.id !== 'default' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            startDelete(ws.id); setRenamingId(null)
                          }}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-300 hover:text-zinc-500 hover:bg-zinc-500/8 transition-all"
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

          {/* ═══ Delete confirmation card ═══ */}
          {deleteTarget && (
            <div
              style={{
                margin: '0 6px 4px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.12)',
                animation: 'wsDropIn 120ms ease forwards',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2 mb-2.5">
                <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-red-600 leading-tight">
                    删除工作区「{deleteWsName}」?
                  </p>
                  <p className="text-[9px] text-red-400 mt-1 leading-relaxed">
                    将同时删除本地对应的所有记录文件
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelDelete}
                  className="flex-1 text-[10px] font-semibold rounded-lg transition-all text-zinc-500 hover:bg-zinc-500/8"
                  style={{
                    padding: '6px 0',
                    border: '1px solid rgba(0,0,0,0.06)',
                    background: 'rgba(255,255,255,0.6)',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={() => executeDelete(deleteTarget)}
                  disabled={deleteCountdown > 0}
                  className="flex-1 text-[10px] font-bold rounded-lg transition-all"
                  style={{
                    padding: '6px 0',
                    border: 'none',
                    background: deleteCountdown > 0
                      ? 'rgba(239,68,68,0.08)'
                      : 'rgba(239,68,68,0.90)',
                    color: deleteCountdown > 0 ? '#f87171' : '#ffffff',
                    cursor: deleteCountdown > 0 ? 'not-allowed' : 'pointer',
                    opacity: deleteCountdown > 0 ? 0.7 : 1,
                  }}
                >
                  {deleteCountdown > 0 ? `请等待 (${deleteCountdown}s)` : '确认删除'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ Divider + Add workspace ═══ */}
          <div style={{ padding: '4px 6px 6px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            {!adding ? (
              <button
                onClick={() => { setAdding(true); setRenamingId(null); cancelDelete() }}
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
    </>
  )
}
