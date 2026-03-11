import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, Pin, Pencil, Trash2, Copy, Check, Download, Upload, X, RotateCcw, FileText } from 'lucide-react'

/** @return 唯一标签列表 */
var extractTags = (items: PromptItem[]): string[] =>
  [...new Set(items.map(p => p.tag).filter(t => t.trim() !== ''))]

var UNDO_DURATION = 30

interface UndoToast {
  itemId: string
  itemName: string
  removedItem: PromptItem
  timer: ReturnType<typeof setTimeout>
  intervalId: ReturnType<typeof setInterval>
  remaining: number
}

export default function PromptTab() {
  var [items, setItems] = useState<PromptItem[]>([])
  var [search, setSearch] = useState('')
  var [activeTag, setActiveTag] = useState('all')
  var [copiedId, setCopiedId] = useState<string | null>(null)
  var [modalOpen, setModalOpen] = useState(false)
  var [editingItem, setEditingItem] = useState<PromptItem | null>(null)
  var [viewingItem, setViewingItem] = useState<PromptItem | null>(null)
  var [undoToast, setUndoToast] = useState<UndoToast | null>(null)
  var [templateOpen, setTemplateOpen] = useState(false)
  var fileInputRef = useRef<HTMLInputElement>(null)

  var loadItems = useCallback(async () => {
    var list = await window.api.prompts.list()
    setItems(list)
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  // 组件卸载时清理 undo 定时器
  var undoRef = useRef<UndoToast | null>(null)
  undoRef.current = undoToast
  useEffect(() => {
    return () => {
      if (undoRef.current) {
        clearTimeout(undoRef.current.timer)
        clearInterval(undoRef.current.intervalId)
      }
    }
  }, [])

  var tags = extractTags(items)

  var filtered = items
    .filter(p => {
      var term = search.toLowerCase()
      var matchSearch = !term || p.name.toLowerCase().includes(term) || p.content.toLowerCase().includes(term)
      var matchTag = activeTag === 'all' || p.tag === activeTag
      return matchSearch && matchTag
    })
    .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))

  /** @param item 复制内容到剪贴板 */
  var handleCopy = async (item: PromptItem) => {
    await navigator.clipboard.writeText(item.content)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  /** @param id 切换置顶状态 */
  var handleTogglePin = async (id: string) => {
    var target = items.find(p => p.id === id)
    if (!target) return
    await window.api.prompts.save({ ...target, isPinned: !target.isPinned })
    loadItems()
  }

  /**
   * 软删除 + undo toast（30s 后真正删除）
   * @param id 目标提示词 ID
   */
  var handleDelete = useCallback((id: string) => {
    var target = items.find(p => p.id === id)
    if (!target) return

    // 取消之前的 undo
    if (undoToast) {
      clearTimeout(undoToast.timer)
      clearInterval(undoToast.intervalId)
      // 前一个立即执行真正删除
      window.api.prompts.delete(undoToast.itemId)
    }

    // 先从本地列表中移除
    setItems(prev => prev.filter(p => p.id !== id))

    // 启动倒计时
    let remaining = UNDO_DURATION
    var intervalId = setInterval(() => {
      remaining -= 1
      setUndoToast(prev => prev && prev.itemId === id ? { ...prev, remaining } : prev)
    }, 1000)

    var timer = setTimeout(() => {
      clearInterval(intervalId)
      window.api.prompts.delete(id)
      setUndoToast(null)
    }, UNDO_DURATION * 1000)

    setUndoToast({ itemId: id, itemName: target.name, removedItem: target, timer, intervalId, remaining: UNDO_DURATION })
  }, [items, undoToast])

  /** 撤销删除 */
  var handleUndo = useCallback(() => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    // 将已移除的 item 放回列表
    setItems(prev => [...prev, undoToast.removedItem])
    setUndoToast(null)
  }, [undoToast])

  /** 立即永久删除（关闭 toast） */
  var handleForceDelete = useCallback(() => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    window.api.prompts.delete(undoToast.itemId)
    setUndoToast(null)
  }, [undoToast])

  /** @param item 打开编辑弹窗 */
  var handleEdit = (item: PromptItem) => {
    setEditingItem(item)
    setModalOpen(true)
  }

  var handleAdd = () => {
    setEditingItem(null)
    setModalOpen(true)
  }

  var handleExport = async () => { await window.api.prompts.export() }

  var handleImport = () => { fileInputRef.current?.click() }

  var handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    var file = e.target.files?.[0]
    if (!file) return
    try {
      var text = await file.text()
      var parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) { alert('文件格式无效，需要 JSON 数组'); return }
      await window.api.prompts.import(parsed)
      loadItems()
    } catch { alert('文件解析失败') }
    e.target.value = ''
  }

  /**
   * 保存回调（新增或编辑完成后刷新列表）
   * @param data 表单数据
   */
  var handleSave = async (data: { id?: string; name: string; tag: string; content: string }) => {
    await window.api.prompts.save(data)
    setModalOpen(false)
    setEditingItem(null)
    loadItems()
  }

  return (
    <div className="h-full flex flex-col relative" style={{ padding: '0 var(--container-padding)' }}>
      {/* 搜索栏 */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ padding: '10px 0 6px' }}>
        <div className="flex-1 relative">
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#a1a1aa' }} />
          <input
            type="text"
            placeholder="搜索提示词..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 30px',
              fontSize: '12px',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '10px',
              outline: 'none',
              background: 'rgba(255,255,255,0.7)',
            }}
          />
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center justify-center"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* 标签筛选 */}
      <div className="flex items-center flex-shrink-0" style={{ gap: '6px', padding: '0 0 8px', overflowX: 'auto' }}>
        <TagChip label="全部" active={activeTag === 'all'} onClick={() => setActiveTag('all')} />
        {tags.map(tag => (
          <TagChip key={tag} label={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)} />
        ))}
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(item => (
            <PromptCard
              key={item.id}
              item={item}
              copied={copiedId === item.id}
              onView={() => setViewingItem(item)}
              onCopy={() => handleCopy(item)}
              onTogglePin={() => handleTogglePin(item.id)}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#a1a1aa', fontSize: '13px' }}>
              {search ? '未找到匹配的提示词' : '暂无提示词，点击 + 添加'}
            </div>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div
        className="flex items-center justify-center gap-3 flex-shrink-0"
        style={{ padding: '8px 0 10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}
      >
        <BottomBtn icon={Download} label="导出" onClick={handleExport} />
        <BottomBtn icon={Upload} label="导入" onClick={handleImport} />
        <BottomBtn icon={FileText} label="导入规范" onClick={() => setTemplateOpen(true)} />
      </div>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Undo Delete Toast */}
      {undoToast && (
        <div
          className="absolute"
          style={{
            bottom: '60px',
            left: 'var(--container-padding)',
            right: 'var(--container-padding)',
            zIndex: 9990,
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            boxShadow: '0 12px 40px -8px rgba(80,60,140,0.16), 0 0 0 1px rgba(0,0,0,0.04)',
            padding: '14px 16px 10px',
            overflow: 'hidden',
            animation: 'undoSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.08)' }}>
              <Trash2 size={14} style={{ color: '#ef4444' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-zinc-600 truncate">提示词已移除</p>
              <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                「{undoToast.itemName}」{undoToast.remaining}s 后永久删除
              </p>
            </div>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 flex-shrink-0 font-bold transition-all duration-150"
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                background: 'rgba(139,92,246,0.10)',
                color: '#7c3aed',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.18)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.10)' }}
            >
              <RotateCcw size={12} /> 撤销
            </button>
            <button
              onClick={handleForceDelete}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150"
              style={{ color: '#a1a1aa', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = 'transparent' }}
              title="立即删除"
            >
              <X size={13} />
            </button>
          </div>
          <div style={{ margin: '10px -16px -10px', height: '3px', background: 'rgba(0,0,0,0.03)' }}>
            <div style={{
              height: '100%',
              borderRadius: '0 2px 2px 0',
              background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
              width: `${(undoToast.remaining / UNDO_DURATION) * 100}%`,
              transition: 'width 1s linear',
            }} />
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <PromptModal
          item={editingItem}
          existingTags={tags}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingItem(null) }}
        />
      )}

      {/* 详情弹窗 */}
      {viewingItem && (
        <PromptDetailModal
          item={viewingItem}
          onCopy={() => handleCopy(viewingItem)}
          copied={copiedId === viewingItem.id}
          onEdit={() => { setViewingItem(null); handleEdit(viewingItem) }}
          onClose={() => setViewingItem(null)}
        />
      )}

      {/* 导入规范弹窗 */}
      {templateOpen && (
        <ImportTemplateModal onClose={() => setTemplateOpen(false)} />
      )}

      <style>{`
        @keyframes undoSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ── 标签筛选按钮 ── */
function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        background: active ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(0,0,0,0.04)',
        color: active ? '#fff' : '#71717a',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  )
}

/* ── 提示词卡片 ── */
function PromptCard({
  item, copied, onView, onCopy, onTogglePin, onEdit, onDelete,
}: {
  item: PromptItem
  copied: boolean
  onView: () => void
  onCopy: () => void
  onTogglePin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="glass card-shadow"
      style={{
        borderRadius: '12px',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderLeft: item.isPinned ? '3px solid #667eea' : '3px solid transparent',
      }}
      onClick={onView}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
        <div className="flex items-center gap-2">
          {item.tag && (
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '6px',
              background: 'rgba(102, 126, 234, 0.08)',
              color: '#667eea',
            }}>
              {item.tag}
            </span>
          )}
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
            {item.name}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: '2px' }}>
          {copied ? (
            <Check size={14} style={{ color: '#22c55e' }} />
          ) : (
            <ActionBtn icon={Copy} tooltip="复制" onClick={(e) => { e.stopPropagation(); onCopy() }} />
          )}
          <ActionBtn
            icon={Pin}
            tooltip={item.isPinned ? '取消置顶' : '置顶'}
            active={item.isPinned}
            onClick={(e) => { e.stopPropagation(); onTogglePin() }}
          />
          <ActionBtn icon={Pencil} tooltip="编辑" onClick={(e) => { e.stopPropagation(); onEdit() }} />
          <ActionBtn icon={Trash2} tooltip="删除" onClick={(e) => { e.stopPropagation(); onDelete() }} />
        </div>
      </div>
      <div style={{
        fontSize: '11px',
        color: '#71717a',
        lineHeight: '1.5',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
      }}>
        {item.content}
      </div>
    </div>
  )
}

/* ── 操作小按钮 ── */
function ActionBtn({
  icon: Icon, tooltip, active, onClick,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  tooltip: string
  active?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      title={tooltip}
      onClick={onClick}
      style={{
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: active ? '#667eea' : '#a1a1aa',
        transition: 'color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={13} />
    </button>
  )
}

/* ── 底部按钮 ── */
function BottomBtn({
  icon: Icon, label, onClick,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1"
      style={{
        padding: '6px 14px',
        borderRadius: '8px',
        fontSize: '11px',
        fontWeight: 600,
        border: '1px solid rgba(0,0,0,0.08)',
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.7)',
        color: '#52525b',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(102,126,234,0.3)'; e.currentTarget.style.color = '#667eea' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#52525b' }}
    >
      <Icon size={13} />
      <span>{label}</span>
    </button>
  )
}

/* ── 详情查看弹窗 ── */
function PromptDetailModal({
  item, onCopy, copied, onEdit, onClose,
}: {
  item: PromptItem
  onCopy: () => void
  copied: boolean
  onEdit: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '400px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{ padding: '20px 24px 0' }}>
          <div className="flex items-start justify-between" style={{ marginBottom: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {item.tag && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(102, 126, 234, 0.08)',
                  color: '#667eea',
                  display: 'inline-block',
                  marginBottom: '8px',
                }}>
                  {item.tag}
                </span>
              )}
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: 0, lineHeight: '1.4' }}>
                {item.name}
              </h3>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', flexShrink: 0, marginLeft: '8px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px 20px' }}>
          <div style={{
            fontSize: '13px',
            color: '#3f3f46',
            lineHeight: '1.8',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {item.content}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center gap-2" style={{ padding: '14px 24px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5"
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: copied ? 'rgba(34,197,94,0.08)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: copied ? '#22c55e' : '#fff',
              justifyContent: 'center',
              boxShadow: copied ? 'none' : '0 2px 8px rgba(102, 126, 234, 0.25)',
              transition: 'all 0.2s',
            }}
          >
            {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制内容</>}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 justify-center"
            style={{
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.1)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: '#fff',
              color: '#52525b',
            }}
          >
            <Pencil size={14} /> 编辑
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ── 导入规范弹窗 ── */
function ImportTemplateModal({ onClose }: { onClose: () => void }) {
  var [copied, setCopied] = useState(false)

  var TEMPLATE = `[
  {
    "name": "提示词名称",
    "tag": "分类标签",
    "content": "提示词正文内容"
  }
]`

  var handleCopyTemplate = async () => {
    await navigator.clipboard.writeText(TEMPLATE)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '360px',
          padding: '24px',
          borderRadius: '20px',
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>导入规范</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '12px', color: '#71717a', lineHeight: '1.6', marginBottom: '12px' }}>
          导入文件为 JSON 格式，包含一个数组。每项字段说明：
        </p>

        <div style={{ fontSize: '11px', color: '#52525b', marginBottom: '12px', lineHeight: '1.8' }}>
          <div><b>name</b>（必填）：提示词名称</div>
          <div><b>content</b>（必填）：提示词正文</div>
          <div><b>tag</b>（选填）：分类标签</div>
          <div><b>isPinned</b>（选填）：是否置顶，默认 false</div>
        </div>

        <div style={{
          padding: '12px',
          borderRadius: '10px',
          background: 'rgba(15,23,42,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
          marginBottom: '16px',
        }}>
          <pre style={{ margin: 0, fontSize: '11px', color: '#334155', lineHeight: '1.6', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {TEMPLATE}
          </pre>
        </div>

        <button
          onClick={handleCopyTemplate}
          className="flex items-center gap-1.5 justify-center"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            background: copied ? 'rgba(34,197,94,0.08)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: copied ? '#22c55e' : '#fff',
            transition: 'all 0.2s',
          }}
        >
          {copied ? <><Check size={14} /> 已复制模板</> : <><Copy size={14} /> 复制模板</>}
        </button>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ── 新增/编辑弹窗 ── */
function PromptModal({
  item, existingTags, onSave, onClose,
}: {
  item: PromptItem | null
  existingTags: string[]
  onSave: (data: { id?: string; name: string; tag: string; content: string }) => void
  onClose: () => void
}) {
  var [name, setName] = useState(item?.name || '')
  var [tag, setTag] = useState(item?.tag || '')
  var [content, setContent] = useState(item?.content || '')
  var [showTagDropdown, setShowTagDropdown] = useState(false)
  var nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  var handleSubmit = () => {
    if (!name.trim() || !content.trim()) { alert('名称和内容不能为空'); return }
    onSave({ id: item?.id, name: name.trim(), tag: tag.trim(), content: content.trim() })
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '360px',
          maxHeight: '80vh',
          padding: '24px',
          borderRadius: '20px',
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '18px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
            {item ? '编辑提示词' : '新增提示词'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}>
            <X size={18} />
          </button>
        </div>

        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '4px', display: 'block' }}>名称</label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="提示词名称"
          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }}
        />

        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '4px', display: 'block' }}>标签</label>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onFocus={() => setShowTagDropdown(true)}
            onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
            placeholder="输入或选择分类"
            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }}
          />
          {showTagDropdown && existingTags.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
              background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: '120px', overflowY: 'auto',
            }}>
              {existingTags.map(t => (
                <div
                  key={t}
                  onMouseDown={() => { setTag(t); setShowTagDropdown(false) }}
                  style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', color: '#52525b', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>

        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '4px', display: 'block' }}>内容</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="提示词内容..."
          rows={5}
          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '10px', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: '1.6', marginBottom: '18px', boxSizing: 'border-box' }}
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', color: '#71717a', cursor: 'pointer' }}>
            取消
          </button>
          <button onClick={handleSubmit} style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(102, 126, 234, 0.25)' }}>
            保存
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
