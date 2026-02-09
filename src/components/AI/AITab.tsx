import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Bot, ArrowRight, Sparkles, Send, Trash2, User, Loader2,
  ChevronDown, Plus, Clock, X, Paperclip, FileText, Image,
  MessageSquare, PenLine, ChevronLeft
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAIStore } from '../../stores/aiStore'

/* ────────── Guide (no API key) ────────── */

function GuideView() {
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)

  return (
    <div
      className="flex flex-col items-center h-full animate-fadeInUp"
      style={{ padding: '0 24px', justifyContent: 'center', paddingTop: '10%' }}
    >
      <div className="relative flex items-center justify-center" style={{ marginBottom: '24px' }}>
        <div className="absolute" style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,0.10) 0%, transparent 70%)', filter: 'blur(8px)' }} />
        <div className="relative flex items-center justify-center" style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(245,158,11,0.05)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(245,158,11,0.10)' }}>
          <Bot size={22} style={{ color: '#f59e0b' }} strokeWidth={1.8} />
        </div>
        <div className="absolute flex items-center justify-center" style={{ top: '0', right: '-4px', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.12)' }}>
          <Sparkles size={9} style={{ color: '#f59e0b' }} />
        </div>
      </div>

      <p className="font-semibold" style={{ fontSize: '15px', color: '#3f3f46' }}>AI 助手</p>
      <p className="text-center" style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '10px', lineHeight: '1.8', maxWidth: '220px' }}>
        配置 API 后即可对话提问<br />无需离开桌面，即问即答
      </p>

      <button
        onClick={() => setActiveTab('settings')}
        className="group flex items-center gap-2 transition-all"
        style={{ marginTop: '24px', padding: '8px 20px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.20)' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'; e.currentTarget.style.boxShadow = '0 4px 16px -4px rgba(245,158,11,0.2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.20)'; e.currentTarget.style.boxShadow = 'none' }}
        onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
        onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
      >
        前往配置
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  )
}

/* ────────── Session Sidebar ────────── */

function SessionSidebar() {
  const { sessions, activeSessionId, showSidebar, toggleSidebar, switchSession, deleteSession, createSession } = useAIStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (!showSidebar) return null

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: 9998 }}
      onClick={(e) => { if (e.target === e.currentTarget) toggleSidebar() }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0,0,0,0.08)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
        onClick={toggleSidebar}
      />

      {/* Sidebar panel */}
      <div
        className="absolute left-0 top-0 h-full flex flex-col"
        style={{
          width: '220px',
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '4px 0 24px -4px rgba(0,0,0,0.08)',
          animation: 'slideInLeft 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '14px 14px 10px' }}>
          <span className="text-[13px] font-bold" style={{ color: '#27272a' }}>历史对话</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { createSession(); toggleSidebar() }}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{ width: '28px', height: '28px', color: '#8b5cf6' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title="新建对话"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
            <button
              onClick={toggleSidebar}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{ width: '28px', height: '28px', color: '#a1a1aa' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px 8px' }}>
          {sessions.length === 0 && (
            <p className="text-center text-[11px]" style={{ color: '#d4d4d8', marginTop: '40px' }}>暂无对话</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className="group relative flex items-center gap-2 rounded-xl cursor-pointer transition-all"
              style={{
                padding: '10px 12px',
                marginBottom: '2px',
                background: s.id === activeSessionId ? 'rgba(139,92,246,0.06)' : 'transparent',
                border: s.id === activeSessionId ? '1px solid rgba(139,92,246,0.10)' : '1px solid transparent',
              }}
              onClick={() => switchSession(s.id)}
              onMouseEnter={(e) => { if (s.id !== activeSessionId) e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
              onMouseLeave={(e) => { if (s.id !== activeSessionId) e.currentTarget.style.background = 'transparent' }}
            >
              <MessageSquare size={13} style={{ color: s.id === activeSessionId ? '#8b5cf6' : '#a1a1aa', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] font-medium truncate" style={{ color: s.id === activeSessionId ? '#6d28d9' : '#52525b' }}>
                  {s.title || '新对话'}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: '#a1a1aa' }}>
                  {s.messageCount} 条消息 · {formatRelTime(s.updatedAt)}
                </p>
              </div>
              {/* Delete btn */}
              {confirmDeleteId === s.id ? (
                <div className="flex items-center gap-1">
                  <button
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); setConfirmDeleteId(null) }}
                  >删除</button>
                  <button
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ color: '#a1a1aa' }}
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                  >取消</button>
                </div>
              ) : (
                <button
                  className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-md transition-all"
                  style={{ width: '22px', height: '22px', color: '#a1a1aa', flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.id) }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

function formatRelTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/* ────────── Attachment preview chips ────────── */

function AttachmentBar() {
  const { attachments, removeAttachment, addFiles } = useAIStore()
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5" style={{ padding: '0 0 6px' }}>
      {attachments.map((att, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-lg transition-all"
          style={{
            padding: '4px 8px 4px 6px',
            background: 'rgba(139,92,246,0.04)',
            border: '1px solid rgba(139,92,246,0.08)',
            maxWidth: '160px',
          }}
        >
          {att.type === 'image' ? (
            att.url ? (
              <img src={att.url} alt="" style={{ width: '18px', height: '18px', borderRadius: '4px', objectFit: 'cover' }} />
            ) : (
              <Image size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
            )
          ) : (
            <FileText size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
          )}
          <span className="text-[10px] truncate" style={{ color: '#52525b', maxWidth: '100px' }}>{att.name}</span>
          <button
            onClick={() => removeAttachment(i)}
            className="flex items-center justify-center rounded-full transition-all"
            style={{ width: '14px', height: '14px', color: '#a1a1aa', flexShrink: 0 }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#a1a1aa'}
          >
            <X size={9} />
          </button>
        </div>
      ))}
      <button
        onClick={addFiles}
        className="flex items-center gap-1 text-[10px] rounded-lg transition-all"
        style={{ padding: '4px 8px', color: '#8b5cf6', border: '1px dashed rgba(139,92,246,0.15)' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.04)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <Plus size={10} />
        继续添加
      </button>
    </div>
  )
}

/* ────────── Reasoning collapse ────────── */

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="mb-2 rounded-lg cursor-pointer transition-all"
      style={{
        padding: '6px 10px',
        background: 'rgba(245,158,11,0.03)',
        border: '1px solid rgba(245,158,11,0.05)',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
        <Sparkles size={10} />
        思考过程
        <ChevronDown size={10} className="transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : '' }} />
      </div>
      {expanded && (
        <div
          className="text-[10px] mt-2 leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: '#71717a', maxHeight: '200px', overflowY: 'auto' }}
        >
          {reasoning}
        </div>
      )}
    </div>
  )
}

/* ────────── Chat Interface ────────── */

function ChatView() {
  const {
    messages, streaming, error, sendMessage, clearMessages,
    toggleSidebar, createSession, addFiles, attachments,
    sessions, activeSessionId,
  } = useAIStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80)
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [])

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming) return
    sendMessage(input)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [input, streaming, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSend() }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const glassCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(0,0,0,0.04)',
    borderRadius: '14px',
  }

  const currentTitle = sessions.find((s) => s.id === activeSessionId)?.title || '新对话'

  return (
    <div className="flex flex-col h-full" style={{ padding: '0 var(--container-padding)' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '10px 0 6px' }}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center rounded-lg transition-all flex-shrink-0"
            style={{ width: '28px', height: '28px', color: '#71717a' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="历史对话"
          >
            <Clock size={14} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: '24px', height: '24px', borderRadius: '8px',
                background: 'rgba(245,158,11,0.05)',
              }}
            >
              <Bot size={13} style={{ color: '#f59e0b' }} strokeWidth={2} />
            </div>
            <span className="text-[12px] font-bold truncate" style={{ color: '#27272a', maxWidth: '120px' }}>
              {currentTitle}
            </span>
          </div>
          {streaming && (
            <span className="flex items-center gap-1 text-[10px] font-medium flex-shrink-0" style={{ color: '#f59e0b' }}>
              <Loader2 size={10} className="animate-spin" />
              思考中
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={createSession}
            className="flex items-center gap-1 text-[10px] font-medium transition-all rounded-lg px-2 py-1"
            style={{ color: '#8b5cf6' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="新建对话"
          >
            <PenLine size={11} />
          </button>
          <button
            onClick={clearMessages}
            className="flex items-center gap-1 text-[10px] font-medium transition-all rounded-lg px-2 py-1"
            style={{ color: '#a1a1aa' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = '#52525b' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa' }}
            title="清空对话"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto relative" style={{ paddingTop: '6px', paddingBottom: '6px', scrollBehavior: 'smooth' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center" style={{ marginTop: '20%' }}>
            <div className="flex items-center justify-center" style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(245,158,11,0.04)' }}>
              <Sparkles size={16} style={{ color: 'rgba(245,158,11,0.25)' }} />
            </div>
            <p className="text-[11px] mt-3" style={{ color: '#d4d4d8' }}>开始对话吧</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className="animate-fadeInUp"
            style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            {/* Avatar */}
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: '24px', height: '24px', borderRadius: '8px',
                background: msg.role === 'user' ? 'rgba(139,92,246,0.08)' : 'rgba(245,158,11,0.06)',
                marginTop: '2px',
              }}
            >
              {msg.role === 'user'
                ? <User size={12} style={{ color: '#8b5cf6' }} strokeWidth={2} />
                : <Bot size={12} style={{ color: '#f59e0b' }} strokeWidth={2} />}
            </div>

            {/* Bubble */}
            <div
              style={{
                ...glassCard,
                padding: '10px 14px',
                maxWidth: '85%',
                ...(msg.role === 'user' ? {
                  background: 'rgba(139,92,246,0.06)',
                  border: '1px solid rgba(139,92,246,0.08)',
                } : {}),
              }}
            >
              {/* Attachments in user message */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.attachments.map((att, ai) => (
                    <div
                      key={ai}
                      className="flex items-center gap-1 rounded-md"
                      style={{ padding: '3px 6px', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.06)' }}
                    >
                      {att.type === 'image' && att.url ? (
                        <img src={att.url} alt="" style={{ width: '16px', height: '16px', borderRadius: '3px', objectFit: 'cover' }} />
                      ) : (
                        <FileText size={10} style={{ color: '#8b5cf6' }} />
                      )}
                      <span className="text-[9px]" style={{ color: '#6d28d9' }}>{att.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {msg.reasoning && <ReasoningBlock reasoning={msg.reasoning} />}

              <div className="text-[12px] leading-relaxed break-words whitespace-pre-wrap" style={{ color: '#3f3f46' }}>
                {msg.content || (streaming && msg.role === 'assistant' && !msg.content ? '' : msg.content || '(空回复)')}
                {msg.role === 'assistant' && streaming && !msg.content && messages[messages.length - 1]?.id === msg.id && (
                  <span className="inline-flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#f59e0b' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#f59e0b', animationDelay: '0.2s' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#f59e0b', animationDelay: '0.4s' }} />
                  </span>
                )}
              </div>

              <p className="text-[9px] mt-1" style={{ color: '#d4d4d8' }}>
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {error && (
          <div
            className="mx-auto text-center text-[11px] py-2 px-4 rounded-xl animate-fadeInUp"
            style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.12)', maxWidth: '90%', marginBottom: '8px' }}
          >
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute right-6 transition-all rounded-full shadow-lg flex items-center justify-center"
          style={{ bottom: '74px', width: '28px', height: '28px', background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <ChevronDown size={14} style={{ color: '#52525b' }} />
        </button>
      )}

      {/* Input bar */}
      <div style={{ padding: '8px 0 12px' }}>
        <AttachmentBar />
        <div
          className="flex gap-3"
          style={{
            ...glassCard,
            padding: '10px 12px 10px 10px',
            borderRadius: '24px',
            alignItems: 'center',
          }}
        >
          {/* Attach button */}
          <button
            onClick={addFiles}
            disabled={streaming}
            className="flex-shrink-0 flex items-center justify-center transition-all"
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              color: attachments.length > 0 ? '#8b5cf6' : '#a1a1aa',
              cursor: streaming ? 'default' : 'pointer',
              lineHeight: 0,
            }}
            onMouseEnter={(e) => { if (!streaming) e.currentTarget.style.background = 'rgba(139,92,246,0.06)' }}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="添加附件"
          >
            <Paperclip size={15} />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题…"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-[12px] placeholder-zinc-400"
            style={{
              color: '#27272a',
              maxHeight: '120px',
              minHeight: '20px',
              lineHeight: '20px',
              padding: 0,
              margin: 0,
              verticalAlign: 'middle',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 flex items-center justify-center transition-all"
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: input.trim() && !streaming ? 'rgba(139,92,246,0.08)' : 'transparent',
              color: input.trim() && !streaming ? '#8b5cf6' : '#d4d4d8',
              cursor: input.trim() && !streaming ? 'pointer' : 'default',
              lineHeight: 0,
            }}
            onMouseEnter={(e) => { if (input.trim() && !streaming) e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}
            onMouseLeave={(e) => { if (input.trim() && !streaming) e.currentTarget.style.background = 'rgba(139,92,246,0.08)' }}
          >
            {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        <p className="text-[9px] text-center mt-2" style={{ color: '#d4d4d8' }}>Ctrl + Enter 发送</p>
      </div>

      {/* Session sidebar (Portal) */}
      <SessionSidebar />
    </div>
  )
}

/* ────────── Main Export ────────── */

export default function AITab() {
  const { hasEnabledNode, checkNodes, loadSessions } = useAIStore()

  useEffect(() => {
    checkNodes()
    loadSessions()
  }, [checkNodes, loadSessions])

  if (!hasEnabledNode) return <GuideView />
  return <ChatView />
}
