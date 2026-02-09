import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  Keyboard, Info, Check,
  FolderOpen, RotateCcw, Loader2, FolderSync, Sparkles,
  Eye, EyeOff, Save, ChevronDown, Plus, GripVertical,
  Pencil, Trash2, Power, X, RefreshCw, Settings2, AlertTriangle,
  Download, Calendar, FileDown, FileText, ListChecks
} from 'lucide-react'

/* ─── Danger Clear Button with 10s countdown ─── */
function DangerClearButton({ label, onConfirm, disabled }: {
  label: string
  onConfirm: () => void
  disabled?: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'counting' | 'ready'>('idle')
  const [countdown, setCountdown] = useState(10)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setPhase('idle')
    setCountdown(10)
  }, [])

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  const handleClick = () => {
    if (phase === 'idle') {
      setPhase('counting')
      setCountdown(10)
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            timerRef.current = null
            setPhase('ready')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else if (phase === 'ready') {
      cleanup()
      onConfirm()
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleClick}
        disabled={disabled || phase === 'counting'}
        className="flex items-center gap-1 text-[11px] font-medium transition-all"
        style={{
          padding: '6px 12px',
          borderRadius: '8px',
          border: phase === 'ready'
            ? '1px solid rgba(239,68,68,0.35)'
            : phase === 'counting'
              ? '1px solid rgba(239,68,68,0.20)'
              : '1px solid rgba(239,68,68,0.12)',
          background: phase === 'ready'
            ? 'rgba(239,68,68,0.08)'
            : phase === 'counting'
              ? 'rgba(239,68,68,0.04)'
              : 'transparent',
          color: phase === 'idle' ? '#ef4444' : phase === 'counting' ? '#f87171' : '#dc2626',
          opacity: disabled ? 0.4 : phase === 'counting' ? 0.7 : 1,
          cursor: disabled ? 'default' : phase === 'counting' ? 'not-allowed' : 'pointer',
          animation: phase === 'counting' ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }}
        onMouseDown={(e) => { if (phase !== 'counting') (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
        onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
      >
        {phase === 'ready' ? <AlertTriangle size={10} /> : <Trash2 size={10} />}
        {phase === 'idle' ? label : phase === 'counting' ? `请等待 (${countdown}s)` : '确认清空'}
      </button>
      {phase !== 'idle' && (
        <button
          onClick={cleanup}
          className="text-[10px] font-medium transition-all"
          style={{ padding: '4px 8px', borderRadius: '6px', color: '#a1a1aa' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#52525b'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#a1a1aa'}
        >
          取消
        </button>
      )}
    </div>
  )
}

const FIXED_SHORTCUTS = [
  { desc: '切换标签页', keys: ['Ctrl', '1~4'] },
  { desc: '保存记录', keys: ['Ctrl', 'Enter'] },
  { desc: '隐藏窗口', keys: ['Esc'] }
]

const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
]

const MODEL_MAP: Record<string, { value: string; label: string }[]> = {
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek-V3 (Chat)' },
    { value: 'deepseek-reasoner', label: 'DeepSeek-R1 (Reasoner)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
}

/* ─── Node Edit Drawer (Bottom Sheet) ─── */
function NodeEditDrawer({ node, onClose, onSaved }: {
  node: AINode | null  // null = create new
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: node?.name || 'DeepSeek',
    provider: node?.provider || 'deepseek',
    apiKey: node?.apiKey || '',
    model: node?.model || 'deepseek-chat',
    enabled: node?.enabled ?? true,
    purpose: (node?.purpose || 'both') as AINodePurpose,
  })
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validateStatus, setValidateStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [validateError, setValidateError] = useState('')
  const backdropRef = useRef<HTMLDivElement>(null)

  // Drawer open/close animation state
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    // Trigger enter animation on next frame
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280) // wait for CSS transition
  }, [onClose])

  // Auto-name when changing provider
  useEffect(() => {
    const provLabel = PROVIDER_OPTIONS.find((p) => p.value === form.provider)?.label
    if (provLabel && (!node || form.name === (PROVIDER_OPTIONS.find((p) => p.value === node.provider)?.label || node.name))) {
      setForm((f) => ({ ...f, name: provLabel }))
    }
    const models = MODEL_MAP[form.provider] || MODEL_MAP.deepseek
    if (!models.some((m) => m.value === form.model)) {
      setForm((f) => ({ ...f, model: models[0].value }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.provider])

  useEffect(() => { setValidateStatus('idle'); setValidateError('') }, [form.provider, form.apiKey, form.model])

  const handleSave = async () => {
    if (!form.apiKey.trim()) return
    setSaving(true)
    setValidateStatus('validating')
    setValidateError('')
    try {
      const vr = await window.api.ai.validate({ provider: form.provider, apiKey: form.apiKey, model: form.model })
      if (!vr.success) {
        setValidateStatus('invalid')
        setValidateError(vr.error || '验证失败')
        setSaving(false)
        return
      }
      setValidateStatus('valid')
      await window.api.ai.saveNode({ id: node?.id, name: form.name, provider: form.provider, apiKey: form.apiKey, model: form.model, enabled: form.enabled, purpose: form.purpose })
      onSaved()
      setTimeout(handleClose, 400)
    } catch (err) {
      setValidateStatus('invalid')
      setValidateError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    background: 'rgba(0,0,0,0.025)',
    border: '1px solid rgba(0,0,0,0.05)',
    color: '#27272a',
    outline: 'none',
    width: '100%',
  }

  const models = MODEL_MAP[form.provider] || MODEL_MAP.deepseek

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[9999]"
      style={{
        background: visible
          ? 'linear-gradient(to top, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.03) 35%, transparent 65%)'
          : 'transparent',
        transition: 'background 0.3s ease',
      }}
      onClick={(e) => { if (e.target === backdropRef.current) handleClose() }}
    >
      {/* Drawer panel */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '72%',
          borderRadius: '16px 16px 0 0',
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          borderBottom: 'none',
          boxShadow: '0 -20px 60px -8px rgba(100,80,160,0.16), 0 -6px 20px rgba(0,0,0,0.05)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Pull handle — standalone at top */}
        <div className="flex justify-center flex-shrink-0" style={{ paddingTop: '12px' }}>
          <div style={{
            width: '40px', height: '4px', borderRadius: '2px',
            background: 'rgba(0,0,0,0.08)',
          }} />
        </div>

        {/* Header — offset below handle */}
        <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '18px 20px 8px' }}>
          <h4 className="text-[14px] font-bold" style={{ color: '#27272a' }}>
            {node ? '编辑节点' : '添加 AI 节点'}
          </h4>
          <button onClick={handleClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ color: '#a1a1aa' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#52525b' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Node Name */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 mb-1.5 block">节点名称</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例: DeepSeek"
                style={inputStyle}
              />
            </div>

            {/* Provider */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 mb-1.5 block">服务商</label>
              <div className="relative">
                <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                  {PROVIDER_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#a1a1aa' }} />
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 mb-1.5 block">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  style={{ ...inputStyle, paddingRight: '36px', fontFamily: 'monospace' }}
                />
                <button onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center transition-all"
                  style={{ color: '#a1a1aa' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#8b5cf6' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa' }}
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 mb-1.5 block">模型</label>
              <div className="relative">
                <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                  {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#a1a1aa' }} />
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 mb-1.5 block">用途</label>
              <div className="flex gap-2">
                {([
                  { value: 'both', label: '对话 + 翻译', color: '#8b5cf6' },
                  { value: 'chat', label: 'AI 对话', color: '#f59e0b' },
                  { value: 'translate', label: '翻译', color: '#3b82f6' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, purpose: opt.value })}
                    className="flex-1 text-[11px] font-medium transition-all"
                    style={{
                      padding: '8px 4px',
                      borderRadius: '10px',
                      border: form.purpose === opt.value ? `1.5px solid ${opt.color}` : '1.5px solid rgba(0,0,0,0.06)',
                      background: form.purpose === opt.value ? `${opt.color}0D` : 'transparent',
                      color: form.purpose === opt.value ? opt.color : '#a1a1aa',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Validation feedback */}
            {validateStatus === 'invalid' && validateError && (
              <div className="text-[10px] rounded-lg px-3 py-2.5 animate-fadeInUp" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', color: '#ef4444', lineHeight: '1.5', wordBreak: 'break-all' }}>
                {validateError}
              </div>
            )}
            {validateStatus === 'valid' && (
              <div className="flex items-center gap-1.5 text-[10px] rounded-lg px-3 py-2.5 animate-fadeInUp" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)', color: '#10b981' }}>
                <Check size={10} />
                连接验证通过
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom actions */}
        <div className="flex-shrink-0" style={{ padding: '12px 20px 20px' }}>
          <div className="flex gap-3">
            {/* Cancel */}
            <button
              onClick={handleClose}
              className="flex-1 flex items-center justify-center text-[12px] font-semibold transition-all"
              style={{
                height: '44px',
                borderRadius: '12px',
                color: '#71717a',
                background: 'rgba(0,0,0,0.025)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.025)'
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'
                e.currentTarget.style.transform = ''
              }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              取消
            </button>
            {/* Primary */}
            <button
              onClick={handleSave}
              disabled={saving || !form.apiKey.trim()}
              className="flex-[1.4] flex items-center justify-center gap-2 text-[12px] font-bold transition-all"
              style={{
                height: '44px',
                borderRadius: '12px',
                color: '#fff',
                background: saving
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                border: 'none',
                boxShadow: saving
                  ? '0 4px 14px -3px rgba(245,158,11,0.4)'
                  : '0 4px 14px -3px rgba(139,92,246,0.4)',
                opacity: !form.apiKey.trim() ? 0.45 : 1,
                cursor: !form.apiKey.trim() ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!saving && form.apiKey.trim()) {
                  e.currentTarget.style.boxShadow = '0 6px 20px -3px rgba(139,92,246,0.5)'
                  e.currentTarget.style.filter = 'brightness(1.08)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = saving ? '0 4px 14px -3px rgba(245,158,11,0.4)' : '0 4px 14px -3px rgba(139,92,246,0.4)'
                e.currentTarget.style.filter = ''
                e.currentTarget.style.transform = ''
              }}
              onMouseDown={(e) => { if (!saving && form.apiKey.trim()) (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              {saving
                ? <><Loader2 size={13} className="animate-spin" />验证连接中…</>
                : <><Save size={13} />验证并保存</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── AI Config Section (Node List) ─── */
function AIConfigSection({ isDark, glassCard, setToast }: {
  isDark: boolean
  glassCard: Record<string, unknown>
  setToast: (msg: string) => void
}) {
  const [nodes, setNodes] = useState<AINode[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editNode, setEditNode] = useState<AINode | null | 'new'>(null) // null = closed, 'new' = create
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const loadNodes = useCallback(async () => {
    const ns = await window.api.ai.getNodes()
    setNodes(ns.sort((a, b) => a.order - b.order))
    setLoaded(true)
  }, [])

  useEffect(() => { loadNodes() }, [loadNodes])

  const handleToggle = async (id: string) => {
    await window.api.ai.toggleNode(id)
    await loadNodes()
  }

  const handleDelete = async (id: string) => {
    await window.api.ai.deleteNode(id)
    await loadNodes()
    setToast('节点已删除')
  }

  // Simple drag reorder
  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const reordered = [...nodes]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(idx, 0, moved)
    setNodes(reordered)
    setDragIdx(idx)
  }
  const handleDragEnd = async () => {
    setDragIdx(null)
    await window.api.ai.reorderNodes(nodes.map((n) => n.id))
  }

  const maskKey = (key: string) => {
    if (!key) return '未配置'
    if (key.length <= 8) return '••••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  if (!loaded) return null

  return (
    <section className="animate-fadeInUp mb-5">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 dark:text-zinc-500/60 flex items-center gap-1.5">
          <Sparkles size={9} />
          AI 服务
        </h3>
        <button
          onClick={() => setEditNode('new')}
          className="flex items-center gap-1 text-[10px] font-bold transition-all rounded-lg px-2 py-1"
          style={{ color: '#8b5cf6', background: isDark ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.30)'; e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.10)' : 'rgba(139,92,246,0.06)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.12)'; e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.06)' : 'rgba(139,92,246,0.04)' }}
          onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)' }}
          onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
        >
          <Plus size={10} strokeWidth={2.5} />
          添加节点
        </button>
      </div>

      {/* Node cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {nodes.length === 0 && (
          <div
            className="flex flex-col items-center py-5"
            style={{ ...(glassCard as React.CSSProperties), padding: '20px' }}
          >
            <Sparkles size={18} style={{ color: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.15)', marginBottom: '8px' }} />
            <p className="text-[11px]" style={{ color: isDark ? '#52525b' : '#a1a1aa' }}>暂无 AI 节点</p>
            <p className="text-[10px] mt-1" style={{ color: isDark ? '#3f3f46' : '#d4d4d8' }}>点击上方「添加节点」开始配置</p>
          </div>
        )}

        {nodes.map((node, idx) => (
          <div
            key={node.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className="flex items-center gap-2.5 transition-all group"
            style={{
              ...(glassCard as React.CSSProperties),
              padding: '10px 12px',
              opacity: node.enabled ? 1 : 0.5,
              cursor: 'grab',
              transform: dragIdx === idx ? 'scale(1.02)' : '',
            }}
            onMouseEnter={(e) => { if (dragIdx === null) (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.015)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = (glassCard as React.CSSProperties).background as string }}
          >
            {/* Drag handle */}
            <GripVertical size={12} className="flex-shrink-0 cursor-grab" style={{ color: isDark ? '#3f3f46' : '#d4d4d8' }} />

            {/* Provider color dot */}
            <div className="flex-shrink-0 w-2 h-2 rounded-full" style={{
              background: node.provider === 'openai' ? '#10b981' : '#8b5cf6',
            }} />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold truncate" style={{ color: isDark ? '#e4e4e7' : '#27272a' }}>{node.name}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  color: isDark ? '#52525b' : '#a1a1aa',
                }}>
                  {node.model}
                </span>
                {/* Purpose badge */}
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{
                  background: (node.purpose || 'both') === 'both' ? 'rgba(139,92,246,0.08)' : (node.purpose === 'translate' ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.08)'),
                  color: (node.purpose || 'both') === 'both' ? '#8b5cf6' : (node.purpose === 'translate' ? '#3b82f6' : '#f59e0b'),
                }}>
                  {(node.purpose || 'both') === 'both' ? '对话+翻译' : node.purpose === 'translate' ? '翻译' : 'AI对话'}
                </span>
              </div>
              <p className="text-[9px] font-mono mt-0.5 truncate" style={{ color: isDark ? '#3f3f46' : '#d4d4d8' }}>
                {maskKey(node.apiKey)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); handleToggle(node.id) }}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                style={{ color: node.enabled ? '#10b981' : (isDark ? '#3f3f46' : '#d4d4d8') }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                title={node.enabled ? '已启用' : '已禁用'}
              >
                <Power size={12} strokeWidth={2.5} />
              </button>
              {/* Edit */}
              <button
                onClick={(e) => { e.stopPropagation(); setEditNode(node) }}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                style={{ color: isDark ? '#52525b' : '#a1a1aa' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#8b5cf6' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isDark ? '#52525b' : '#a1a1aa' }}
                title="编辑"
              >
                <Pencil size={11} />
              </button>
              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(node.id) }}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                style={{ color: isDark ? '#52525b' : '#a1a1aa' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isDark ? '#52525b' : '#a1a1aa' }}
                title="删除"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create Drawer */}
      {editNode !== null && (
        <NodeEditDrawer
          node={editNode === 'new' ? null : editNode}
          onClose={() => setEditNode(null)}
          onSaved={loadNodes}
        />
      )}
    </section>
  )
}

/* ─── Shortcuts Section with editable hotkey ─── */
function ShortcutsSection({ isDark, glassCard, setToast }: {
  isDark: boolean
  glassCard: Record<string, unknown>
  setToast: (msg: string) => void
}) {
  const [hotkey, setHotkey] = useState('Ctrl+Shift+Q')
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.config.get().then((cfg) => {
      if (cfg.hotkey) setHotkey(cfg.hotkey as string)
    })
  }, [])

  const handleRecord = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Super')

    const key = e.key
    // Skip standalone modifier keys
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

    // Normalize key name for Electron accelerator format
    let normalizedKey = key
    if (key === ' ') normalizedKey = 'Space'
    else if (key === 'Escape') { setRecording(false); return }
    else if (key.length === 1) normalizedKey = key.toUpperCase()
    else if (key === 'ArrowUp') normalizedKey = 'Up'
    else if (key === 'ArrowDown') normalizedKey = 'Down'
    else if (key === 'ArrowLeft') normalizedKey = 'Left'
    else if (key === 'ArrowRight') normalizedKey = 'Right'
    else if (key === 'Backspace') normalizedKey = 'Backspace'
    else if (key === 'Delete') normalizedKey = 'Delete'
    else if (key === 'Tab') normalizedKey = 'Tab'
    else if (key === 'Enter') normalizedKey = 'Enter'
    else if (key.startsWith('F') && !isNaN(Number(key.slice(1)))) normalizedKey = key // F1-F12

    // Must have at least one modifier
    if (parts.length === 0) return

    parts.push(normalizedKey)
    const combo = parts.join('+')

    setRecording(false)
    saveHotkey(combo)
  }

  const saveHotkey = async (combo: string) => {
    setSaving(true)
    const result = await window.api.config.setHotkey(combo)
    setSaving(false)
    if (result.success) {
      setHotkey(combo)
      setToast('快捷键已更新')
    } else {
      setToast(result.error || '快捷键设置失败')
    }
  }

  const kbdStyle: React.CSSProperties = {
    padding: '3px 7px',
    borderRadius: '6px',
    color: isDark ? '#d4d4d8' : '#3f3f46',
    background: isDark
      ? 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,240,245,0.9) 100%)',
    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
    boxShadow: isDark
      ? '0 1px 2px rgba(0,0,0,0.3)'
      : '0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.03)',
  }

  const hotkeyParts = hotkey.split('+')

  return (
    <section className="animate-fadeInUp mb-5">
      <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 dark:text-zinc-500/60 mb-2 px-0.5 flex items-center gap-1.5">
        <Keyboard size={9} />
        快捷键
      </h3>
      <div style={{ ...glassCard as React.CSSProperties, padding: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Editable hotkey row */}
          <div
            className="flex items-center justify-between transition-all"
            style={{ padding: '9px 12px', borderRadius: '10px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
          >
            <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400 font-medium">唤起 / 隐藏</span>
            <div className="flex items-center gap-2">
              {recording ? (
                <div
                  tabIndex={0}
                  onKeyDown={handleRecord}
                  onBlur={() => setRecording(false)}
                  autoFocus
                  className="flex items-center gap-1 text-[10px] font-medium outline-none animate-pulse"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    color: '#8b5cf6',
                    background: 'rgba(139,92,246,0.06)',
                    border: '1.5px solid rgba(139,92,246,0.25)',
                    cursor: 'text',
                    minWidth: '80px',
                    textAlign: 'center',
                  }}
                >
                  按下快捷键…
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    {hotkeyParts.map((k, i) => (
                      <kbd key={i} className="font-mono font-semibold text-[10px]" style={kbdStyle}>{k}</kbd>
                    ))}
                  </div>
                  <button
                    onClick={() => setRecording(true)}
                    disabled={saving}
                    className="flex items-center justify-center rounded-md transition-all"
                    style={{
                      width: '22px', height: '22px',
                      color: '#a1a1aa',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; e.currentTarget.style.color = '#8b5cf6' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa' }}
                    title="修改快捷键"
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Pencil size={11} />}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Fixed shortcuts */}
          {FIXED_SHORTCUTS.map(({ desc, keys }) => (
            <div
              key={desc}
              className="flex items-center justify-between transition-all"
              style={{ padding: '9px 12px', borderRadius: '10px' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
            >
              <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400 font-medium">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="font-mono font-semibold text-[10px]" style={kbdStyle}>{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Data Export Section ─── */
function ExportSection({ isDark, glassCard, setToast }: {
  isDark: boolean
  glassCard: Record<string, unknown>
  setToast: (msg: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [source, setSource] = useState<'notes' | 'todos'>('notes')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [isExportingMD, setIsExportingMD] = useState(false)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  const busy = isExportingMD || isExportingPDF

  // Workspace list for notes export
  const workspaces = useSettingsStore((s) => s.workspaces)
  const activeWsId = useSettingsStore((s) => s.activeWorkspaceId)
  const [exportWsId, setExportWsId] = useState(activeWsId || 'default')
  const [wsDropOpen, setWsDropOpen] = useState(false)
  const wsDropRef = useRef<HTMLDivElement>(null)
  const selectedWs = workspaces.find((w) => w.id === exportWsId) || workspaces[0]

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wsDropRef.current && !wsDropRef.current.contains(e.target as Node)) setWsDropOpen(false)
    }
    if (wsDropOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [wsDropOpen])

  const setPreset = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    setStartDate(start.toISOString().split('T')[0])
    setEndDate(end.toISOString().split('T')[0])
  }

  const handleExport = async (format: 'md' | 'pdf') => {
    if (busy) return
    const setLoading = format === 'md' ? setIsExportingMD : setIsExportingPDF
    setLoading(true)
    try {
      const res = source === 'notes'
        ? await window.api.notes.export(startDate, endDate, format, exportWsId)
        : await window.api.todos.export(startDate, endDate, format)
      if (res.canceled) { /* user cancelled */ }
      else if (res.success) {
        const typeLabel = source === 'notes' ? '记录' : '清单事项'
        const fmtLabel = format === 'md' ? 'Markdown' : 'PDF'
        setToast(`${fmtLabel} 导出成功 (${res.count} 条${typeLabel})`)
      } else {
        setToast(res.error || '导出失败')
      }
    } catch (err) {
      setToast('导出出错: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const dateInputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace',
    background: 'rgba(15,23,42,0.04)', border: '1px solid rgba(0,0,0,0.05)',
    color: '#3f3f46', outline: 'none', flex: 1, minWidth: 0,
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
    border: active ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
    background: active ? 'rgba(139,92,246,0.08)' : 'transparent',
    color: active ? '#7c3aed' : '#a1a1aa',
    cursor: 'pointer', transition: 'all 0.15s ease',
  })

  return (
    <section className="animate-fadeInUp mb-5">
      <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 mb-2 px-0.5 flex items-center gap-1.5">
        <Download size={9} />
        数据导出
      </h3>
      <div style={glassCard as React.CSSProperties}>
        {/* Source selector */}
        <div className="flex items-center gap-1.5" style={{ padding: '12px 16px 0' }}>
          <button onClick={() => setSource('notes')} style={tabStyle(source === 'notes')}>
            <span className="flex items-center gap-1.5"><FileText size={11} />记录</span>
          </button>
          {/* Workspace selector — only when source is notes */}
          {source === 'notes' && workspaces.length > 0 && (
            <div ref={wsDropRef} className="relative">
              <button
                onClick={() => setWsDropOpen(!wsDropOpen)}
                className="flex items-center gap-1.5 cursor-pointer transition-all"
                style={{
                  padding: '5px 10px 5px 8px',
                  borderRadius: '8px',
                  background: 'rgba(139,92,246,0.06)',
                  border: wsDropOpen ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#6d28d9',
                  maxWidth: '110px',
                }}
                onMouseEnter={(e) => { if (!wsDropOpen) e.currentTarget.style.border = '1px solid rgba(139,92,246,0.15)' }}
                onMouseLeave={(e) => { if (!wsDropOpen) e.currentTarget.style.border = '1px solid transparent' }}
              >
                <div className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: selectedWs?.color || '#8b5cf6' }} />
                <span className="truncate">{selectedWs?.name || '默认'}</span>
                <ChevronDown
                  size={10}
                  className="flex-shrink-0 transition-transform duration-200"
                  style={{ transform: wsDropOpen ? 'rotate(180deg)' : 'none', opacity: 0.5 }}
                />
              </button>
              {wsDropOpen && (
                <div
                  className="absolute left-0 mt-1 z-50 animate-fadeInUp"
                  style={{
                    minWidth: '130px',
                    background: '#fff',
                    borderRadius: '10px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 8px 24px rgba(139,92,246,0.10), 0 2px 8px rgba(0,0,0,0.04)',
                    padding: '4px',
                    overflow: 'hidden',
                  }}
                >
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { setExportWsId(ws.id); setWsDropOpen(false) }}
                      className="w-full flex items-center gap-2 text-left transition-all"
                      style={{
                        padding: '7px 10px',
                        borderRadius: '7px',
                        fontSize: '11px',
                        fontWeight: ws.id === exportWsId ? 600 : 500,
                        color: ws.id === exportWsId ? '#6d28d9' : '#52525b',
                        background: ws.id === exportWsId ? 'rgba(139,92,246,0.08)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { if (ws.id !== exportWsId) e.currentTarget.style.background = 'rgba(139,92,246,0.05)' }}
                      onMouseLeave={(e) => { if (ws.id !== exportWsId) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: ws.color || '#8b5cf6' }} />
                      <span className="truncate">{ws.name}</span>
                      {ws.id === exportWsId && <Check size={11} className="ml-auto flex-shrink-0" style={{ color: '#8b5cf6' }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={() => setSource('todos')} style={tabStyle(source === 'todos')}>
            <span className="flex items-center gap-1.5"><ListChecks size={11} />清单</span>
          </button>
        </div>

        {/* Date range */}
        <div style={{ padding: '10px 16px 10px' }}>
          <div className="flex items-center gap-2 mb-2.5">
            <Calendar size={13} style={{ color: '#8b5cf6' }} />
            <span className="text-[12px] font-semibold text-zinc-700">日期范围</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={dateInputStyle} />
            <span className="text-[10px] text-zinc-400 flex-shrink-0">至</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={dateInputStyle} />
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {[
              { label: '今天', days: 1 },
              { label: '近 7 天', days: 7 },
              { label: '近 30 天', days: 30 },
              { label: '近 90 天', days: 90 },
            ].map((p) => (
              <button
                key={p.days}
                onClick={() => setPreset(p.days)}
                className="text-[9px] font-medium transition-all"
                style={{
                  padding: '3px 8px', borderRadius: '6px', color: '#8b5cf6',
                  background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.10)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.20)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.04)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.10)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2" style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
          <button
            onClick={() => handleExport('md')}
            disabled={busy}
            className="flex items-center gap-1.5 text-[11px] font-bold transition-all"
            style={{
              padding: '7px 14px', borderRadius: '8px',
              border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.04)', color: '#8b5cf6',
              opacity: busy && !isExportingMD ? 0.4 : 1,
              cursor: busy ? 'default' : 'pointer',
            }}
            onMouseDown={(e) => { if (!busy) (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
            onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
          >
            {isExportingMD ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
            导出 Markdown
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={busy}
            className="flex items-center gap-1.5 text-[11px] font-bold transition-all"
            style={{
              padding: '7px 14px', borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.03)', color: '#ef4444',
              opacity: busy && !isExportingPDF ? 0.4 : 1,
              cursor: busy ? 'default' : 'pointer',
            }}
            onMouseDown={(e) => { if (!busy) (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
            onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
          >
            {isExportingPDF ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />}
            导出 PDF
          </button>
        </div>
      </div>
    </section>
  )
}

/* ─── General Section: Auto-start + Restart ─── */
function GeneralSection({ isDark, glassCard, setToast }: {
  isDark: boolean
  glassCard: Record<string, unknown>
  setToast: (msg: string) => void
}) {
  const [autoStart, setAutoStart] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.app.getAutoStart().then(setAutoStart)
    const unsub = window.api.app.onAutoStartChanged((enabled) => setAutoStart(enabled))
    return unsub
  }, [])

  const handleToggleAutoStart = async () => {
    setLoading(true)
    const newVal = !autoStart
    const result = await window.api.app.setAutoStart(newVal)
    setLoading(false)
    if (result.success) {
      setAutoStart(newVal)
      setToast(newVal ? '已开启开机自启动' : '已关闭开机自启动')
    } else {
      setToast(result.error || '设置失败')
    }
  }

  const handleRestart = () => {
    window.api.app.relaunch()
  }

  return (
    <section className="animate-fadeInUp mb-5">
      <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 dark:text-zinc-500/60 mb-2 px-0.5 flex items-center gap-1.5">
        <Settings2 size={9} />
        通用
      </h3>
      <div style={{ ...glassCard as React.CSSProperties, padding: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Auto-start toggle */}
          <div
            className="flex items-center justify-between transition-all"
            style={{ padding: '9px 12px', borderRadius: '10px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
          >
            <div className="flex items-center gap-2">
              <Power size={13} style={{ color: autoStart ? '#8b5cf6' : '#a1a1aa' }} />
              <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400 font-medium">开机自启动</span>
            </div>
            <button
              onClick={handleToggleAutoStart}
              disabled={loading}
              className="relative transition-all"
              style={{
                width: '36px', height: '20px', borderRadius: '10px',
                background: autoStart ? '#8b5cf6' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <div
                className="absolute top-[2px] rounded-full transition-all"
                style={{
                  width: '16px', height: '16px',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  left: autoStart ? '18px' : '2px',
                }}
              />
            </button>
          </div>

          {/* Restart app */}
          <div
            className="flex items-center justify-between transition-all cursor-pointer"
            style={{ padding: '9px 12px', borderRadius: '10px' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
            onClick={handleRestart}
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={13} style={{ color: '#a1a1aa' }} />
              <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400 font-medium">重启应用</span>
            </div>
            <span className="text-[10px]" style={{ color: '#d4d4d8' }}>立即重启</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function SettingsTab() {
  const isDark = false // Fixed light mode

  // ── Workspace state ──
  const workspaces = useSettingsStore((s) => s.workspaces)

  // ── Storage paths ──
  const [rootPath, setRootPath] = useState('')
  const [todosPath, setTodosPath] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmRootChange, setConfirmRootChange] = useState<{ newPath: string } | null>(null)
  const [confirmTodosChange, setConfirmTodosChange] = useState<{ newPath: string } | null>(null)

  const loadPaths = useCallback(async () => {
    const rp = await window.api.storage.getRootPath()
    const tp = await window.api.storage.getTodosPath()
    setRootPath(rp)
    setTodosPath(tp)
  }, [])

  useEffect(() => { loadPaths() }, [loadPaths])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // --- Notes root dir ---
  const handleSelectRootDir = async () => {
    const result = await window.api.storage.selectDir('选择记录存储根目录')
    if (!result.success || !result.path) return
    setConfirmRootChange({ newPath: result.path })
  }

  const handleConfirmRootChange = async () => {
    if (!confirmRootChange?.newPath) return
    setMigrating(true); setConfirmRootChange(null)
    try {
      const res = await window.api.storage.setRootPath(confirmRootChange.newPath)
      if (res.success) {
        await loadPaths()
        setToast('记录存储目录已更新')
      } else {
        setToast('更改失败: ' + (res.error || '未知错误'))
      }
    } finally { setMigrating(false) }
  }

  const handleResetRoot = async () => {
    setMigrating(true)
    try {
      const res = await window.api.storage.setRootPath(null)
      if (res.success) {
        await loadPaths()
        setToast('已恢复默认记录存储目录')
      } else {
        setToast('重置失败: ' + (res.error || '未知错误'))
      }
    } finally { setMigrating(false) }
  }

  // --- Todos path ---
  const handleSelectTodosDir = async () => {
    const result = await window.api.storage.selectDir('选择清单存储目录')
    if (!result.success || !result.path) return
    setConfirmTodosChange({ newPath: result.path })
  }

  const handleConfirmTodosChange = async () => {
    if (!confirmTodosChange?.newPath) return
    setMigrating(true); setConfirmTodosChange(null)
    try {
      const res = await window.api.storage.setTodosPath(confirmTodosChange.newPath)
      if (res.success) {
        await loadPaths()
        setToast('清单存储目录已更新')
      } else {
        setToast('更改失败: ' + (res.error || '未知错误'))
      }
    } finally { setMigrating(false) }
  }

  const handleResetTodos = async () => {
    setMigrating(true)
    try {
      const res = await window.api.storage.setTodosPath(null)
      if (res.success) {
        await loadPaths()
        setToast('已恢复默认清单存储目录')
      } else {
        setToast('重置失败: ' + (res.error || '未知错误'))
      }
    } finally { setMigrating(false) }
  }

  const shortenPath = (p: string) => {
    if (!p) return '...'
    if (p.length <= 45) return p
    const parts = p.replace(/\\/g, '/').split('/')
    if (parts.length <= 3) return p
    return parts[0] + '/.../' + parts.slice(-2).join('/')
  }

  /* ── Shared styles ── */
  const glassCard = {
    borderRadius: '14px',
    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.45)',
    backdropFilter: 'blur(10px) saturate(150%)',
    WebkitBackdropFilter: 'blur(10px) saturate(150%)',
    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.04)',
  } as const

  return (
    <div className="h-full overflow-y-auto stagger" style={{ padding: '24px var(--container-padding) 28px' }}>

      {/* ━━━ Notes Storage ━━━ */}
      <section className="animate-fadeInUp mb-4">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 mb-2 px-0.5 flex items-center gap-1.5">
          <FileText size={9} />
          记录存储
        </h3>
        <div style={glassCard}>
          <div style={{ padding: '14px 16px 12px' }}>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen size={13} style={{ color: '#8b5cf6' }} className="flex-shrink-0" />
              <span className="text-[12px] font-semibold text-zinc-700">工作区根目录</span>
            </div>
            <p className="text-[9px] mb-2.5" style={{ color: '#a1a1aa' }}>
              每个工作区以名称为子文件夹，包含 Markdown 文本与图片附件
            </p>
            <div
              className="font-mono text-[10px] break-all leading-relaxed select-all"
              style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(15,23,42,0.05)', color: '#64748b', border: '1px solid rgba(0,0,0,0.03)' }}
              title={rootPath}
            >
              {shortenPath(rootPath)}
            </div>
            {/* Workspace list preview */}
            {workspaces.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2.5">
                {workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    className="flex items-center gap-1.5 text-[10px] font-medium"
                    style={{
                      padding: '3px 8px', borderRadius: '6px',
                      background: 'rgba(139,92,246,0.05)',
                      color: '#8b5cf6',
                      border: '1px solid rgba(139,92,246,0.10)',
                    }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: ws.color }} />
                    {ws.folderName}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
            <button
              onClick={handleSelectRootDir}
              disabled={migrating}
              className="flex items-center gap-1.5 text-[11px] font-bold transition-all"
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.04)', color: '#8b5cf6', opacity: migrating ? 0.5 : 1 }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              {migrating ? <Loader2 size={11} className="animate-spin" /> : <FolderSync size={11} />}
              更改目录
            </button>
            <button
              onClick={handleResetRoot}
              disabled={migrating}
              className="flex items-center gap-1.5 text-[11px] font-medium transition-all"
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)', color: '#a1a1aa', opacity: migrating ? 0.5 : 1 }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              <RotateCcw size={10} />
              恢复默认
            </button>
            <div className="flex-1" />
            <DangerClearButton
              label="清空记录"
              disabled={migrating}
              onConfirm={async () => {
                const res = await window.api.storage.clearNotes()
                if (res.success) setToast(`记录数据已清空 (${res.cleared} 个文件)`)
                else setToast('清空失败: ' + (res.error || '未知错误'))
              }}
            />
          </div>
        </div>
      </section>

      {/* ━━━ Todos Storage ━━━ */}
      <section className="animate-fadeInUp mb-4">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 mb-2 px-0.5 flex items-center gap-1.5">
          <ListChecks size={9} />
          清单存储
        </h3>
        <div style={glassCard}>
          <div style={{ padding: '14px 16px 12px' }}>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen size={13} style={{ color: '#f59e0b' }} className="flex-shrink-0" />
              <span className="text-[12px] font-semibold text-zinc-700">清单数据目录</span>
            </div>
            <p className="text-[9px] mb-2.5" style={{ color: '#a1a1aa' }}>
              清单数据为全局存储，不随工作区切换
            </p>
            <div
              className="font-mono text-[10px] break-all leading-relaxed select-all"
              style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(15,23,42,0.05)', color: '#64748b', border: '1px solid rgba(0,0,0,0.03)' }}
              title={todosPath}
            >
              {shortenPath(todosPath)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
            <button
              onClick={handleSelectTodosDir}
              disabled={migrating}
              className="flex items-center gap-1.5 text-[11px] font-bold transition-all"
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)', color: '#f59e0b', opacity: migrating ? 0.5 : 1 }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              {migrating ? <Loader2 size={11} className="animate-spin" /> : <FolderSync size={11} />}
              更改目录
            </button>
            <button
              onClick={handleResetTodos}
              disabled={migrating}
              className="flex items-center gap-1.5 text-[11px] font-medium transition-all"
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)', color: '#a1a1aa', opacity: migrating ? 0.5 : 1 }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              <RotateCcw size={10} />
              恢复默认
            </button>
            <div className="flex-1" />
            <DangerClearButton
              label="清空清单"
              disabled={migrating}
              onConfirm={async () => {
                const res = await window.api.storage.clearTodos()
                if (res.success) setToast(`清单数据已清空 (${res.cleared} 个文件)`)
                else setToast('清空失败: ' + (res.error || '未知错误'))
              }}
            />
          </div>
        </div>
      </section>

      {/* ━━━ Data Export ━━━ */}
      <ExportSection isDark={isDark} glassCard={glassCard} setToast={setToast} />

      {/* ━━━ AI Config ━━━ */}
      <AIConfigSection isDark={isDark} glassCard={glassCard} setToast={setToast} />

      {/* ━━━ Shortcuts ━━━ */}
      <ShortcutsSection isDark={isDark} glassCard={glassCard} setToast={setToast} />

      {/* ━━━ General ━━━ */}
      <GeneralSection isDark={isDark} glassCard={glassCard} setToast={setToast} />

      {/* ━━━ About ━━━ */}
      <section className="animate-fadeInUp mb-2">
        <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-zinc-400/60 dark:text-zinc-500/60 mb-2 px-0.5 flex items-center gap-1.5">
          <Info size={9} />
          关于
        </h3>
        <div
          className="flex items-center gap-3"
          style={{ ...glassCard, padding: '14px 16px' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            Q
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">QuickStart</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">v0.5.1 · 桌面快捷效率工具</p>
            <button
              onClick={() => window.api.shell.openExternal('https://github.com/ReappealXy')}
              className="inline-flex items-center gap-1 mt-1 text-[9px] font-medium transition-all cursor-pointer"
              style={{ color: '#8b5cf6', background: 'none', border: 'none', padding: 0 }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              ReappealXy
            </button>
          </div>
        </div>
      </section>

      {/* ====== Confirm Dir Change Dialog ====== */}
      {(confirmRootChange || confirmTodosChange) && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center animate-fadeIn"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          onClick={() => { setConfirmRootChange(null); setConfirmTodosChange(null) }}
        >
          <div
            className="animate-scaleIn"
            style={{
              width: '300px',
              borderRadius: '16px',
              padding: '22px',
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              border: '1px solid rgba(0,0,0,0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <FolderSync size={20} style={{ color: confirmRootChange ? '#8b5cf6' : '#f59e0b' }} />
              <div>
                <p className="text-[13px] font-bold text-zinc-800">
                  {confirmRootChange ? '更改记录存储目录' : '更改清单存储目录'}
                </p>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {confirmRootChange
                    ? '工作区子文件夹将在新目录下自动创建'
                    : '清单数据将读写到新目录'}
                </p>
              </div>
            </div>

            <div
              className="mb-4 font-mono text-[9px] break-all leading-relaxed"
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'rgba(15,23,42,0.05)',
                color: '#64748b',
                border: '1px solid rgba(0,0,0,0.03)',
              }}
            >
              {confirmRootChange?.newPath || confirmTodosChange?.newPath}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={confirmRootChange ? handleConfirmRootChange : handleConfirmTodosChange}
                className="w-full text-[12px] font-bold rounded-xl text-white transition-all"
                style={{
                  padding: '10px',
                  background: confirmRootChange
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  boxShadow: confirmRootChange
                    ? '0 3px 12px -2px rgba(102,126,234,0.4)'
                    : '0 3px 12px -2px rgba(245,158,11,0.4)',
                }}
                onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)' }}
                onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
              >
                确认更改
              </button>
              <button
                onClick={() => { setConfirmRootChange(null); setConfirmTodosChange(null) }}
                className="w-full py-1.5 text-[11px] text-zinc-400 font-medium transition-all hover:text-zinc-600"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Toast ====== */}
      {toast && (
        <div
          className="fixed z-[1000] animate-fadeInUp"
          style={{
            bottom: '16px',
            left: 'var(--container-padding)',
            right: 'var(--container-padding)',
            borderRadius: '12px',
            padding: '10px 14px',
            background: isDark ? 'rgba(39,39,42,0.92)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(16px)',
            boxShadow: isDark
              ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)'
              : '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-2">
            <Check size={13} className="text-emerald-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">{toast}</span>
          </div>
        </div>
      )}
    </div>
  )
}
