import { useState, useEffect, useRef, useCallback } from 'react'
import { Languages, ArrowRight, ArrowLeftRight, Copy, Check, Loader2, X, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

const LANGUAGES = [
  { value: 'auto', label: '自动检测' },
  { value: '中文', label: '中文' },
  { value: '英文', label: '英文' },
  { value: '日文', label: '日文' },
  { value: '韩文', label: '韩文' },
  { value: '法文', label: '法文' },
  { value: '德文', label: '德文' },
  { value: '西班牙文', label: '西班牙文' },
  { value: '俄文', label: '俄文' },
]

export default function TranslatorTab() {
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const [hasNode, setHasNode] = useState<boolean | null>(null)
  const [fromLang, setFromLang] = useState('auto')
  const [toLang, setToLang] = useState('英文')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [translating, setTranslating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.api.ai.hasTranslateNode().then(setHasNode)
  }, [])

  const handleSwap = () => {
    if (fromLang === 'auto') return
    const tmp = fromLang
    setFromLang(toLang)
    setToLang(tmp)
    setInput(output)
    setOutput('')
  }

  const handleTranslate = useCallback(async () => {
    if (!input.trim() || translating) return
    setTranslating(true)
    setOutput('')
    setError('')

    let result = ''
    const unsubscribe = window.api.ai.onToken((data) => {
      if (data.error) {
        setError(data.error)
        setTranslating(false)
        unsubscribe()
        return
      }
      if (data.content) {
        result += data.content
        setOutput(result)
      }
      if (data.done) {
        setTranslating(false)
        unsubscribe()
      }
    })

    const res = await window.api.ai.translate(input.trim(), fromLang, toLang)
    if (!res.success && res.error) {
      setError(res.error)
      setTranslating(false)
      unsubscribe()
    }
  }, [input, fromLang, toLang, translating])

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleTranslate() }
  }

  // Guide view
  if (hasNode === false) {
    return (
      <div
        className="flex flex-col items-center h-full animate-fadeInUp"
        style={{ padding: '0 24px', justifyContent: 'center', paddingTop: '10%' }}
      >
        <div className="relative flex items-center justify-center" style={{ marginBottom: '24px' }}>
          <div className="absolute" style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)', filter: 'blur(8px)' }} />
          <div className="relative flex items-center justify-center" style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(59,130,246,0.05)', backdropFilter: 'blur(8px)', border: '1px solid rgba(59,130,246,0.10)' }}>
            <Languages size={22} style={{ color: '#3b82f6' }} strokeWidth={1.8} />
          </div>
        </div>
        <p className="font-semibold" style={{ fontSize: '15px', color: '#3f3f46' }}>翻译功能</p>
        <p className="text-center" style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '10px', lineHeight: '1.8', maxWidth: '220px' }}>
          请先配置用途包含「翻译」的 AI 节点<br />即可使用多语言翻译
        </p>
        <button
          onClick={() => setActiveTab('settings')}
          className="group flex items-center gap-2 transition-all"
          style={{ marginTop: '24px', padding: '8px 20px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: '#3b82f6', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.20)' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.boxShadow = '0 4px 16px -4px rgba(59,130,246,0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.20)'; e.currentTarget.style.boxShadow = 'none' }}
          onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)' }}
          onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
        >
          前往配置
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    )
  }

  if (hasNode === null) return null

  const glassStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(0,0,0,0.04)',
    borderRadius: '14px',
  }

  return (
    <div className="flex flex-col h-full" style={{ padding: '0 var(--container-padding)' }}>
      {/* Header */}
      <div className="flex items-center gap-2" style={{ padding: '10px 0 8px' }}>
        <div className="flex items-center justify-center" style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(59,130,246,0.05)' }}>
          <Languages size={14} style={{ color: '#3b82f6' }} strokeWidth={2} />
        </div>
        <span className="text-[13px] font-bold" style={{ color: '#27272a' }}>翻译</span>
      </div>

      {/* Language selector bar */}
      <div className="flex items-center gap-2" style={{ padding: '0 0 10px' }}>
        <select
          value={fromLang}
          onChange={(e) => setFromLang(e.target.value)}
          className="flex-1 text-[11px] font-medium outline-none cursor-pointer transition-all"
          style={{
            ...glassStyle,
            padding: '8px 12px',
            borderRadius: '10px',
            color: '#3f3f46',
            appearance: 'none' as const,
          }}
        >
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>

        <button
          onClick={handleSwap}
          className="flex items-center justify-center transition-all flex-shrink-0"
          style={{
            width: '32px', height: '32px', borderRadius: '50%',
            color: fromLang === 'auto' ? '#d4d4d8' : '#3b82f6',
            cursor: fromLang === 'auto' ? 'default' : 'pointer',
          }}
          onMouseEnter={(e) => { if (fromLang !== 'auto') e.currentTarget.style.background = 'rgba(59,130,246,0.06)' }}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="交换语言"
        >
          <ArrowLeftRight size={14} />
        </button>

        <select
          value={toLang}
          onChange={(e) => setToLang(e.target.value)}
          className="flex-1 text-[11px] font-medium outline-none cursor-pointer transition-all"
          style={{
            ...glassStyle,
            padding: '8px 12px',
            borderRadius: '10px',
            color: '#3f3f46',
            appearance: 'none' as const,
          }}
        >
          {LANGUAGES.filter((l) => l.value !== 'auto').map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Input area */}
      <div className="relative" style={{ ...glassStyle, padding: '12px 14px', marginBottom: '8px', minHeight: '100px' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入要翻译的文本…"
          className="w-full resize-none bg-transparent outline-none text-[12px] leading-relaxed placeholder-zinc-400"
          style={{ color: '#27272a', minHeight: '72px', maxHeight: '180px' }}
        />
        {input && (
          <button
            onClick={() => { setInput(''); setOutput(''); setError('') }}
            className="absolute top-2 right-2 flex items-center justify-center rounded-full transition-all"
            style={{ width: '20px', height: '20px', color: '#a1a1aa' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#52525b'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#a1a1aa'}
          >
            <X size={12} />
          </button>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px]" style={{ color: '#d4d4d8' }}>
            {input.length > 0 ? `${input.length} 字` : ''}
          </span>
          <button
            onClick={handleTranslate}
            disabled={!input.trim() || translating}
            className="flex items-center gap-1.5 transition-all"
            style={{
              padding: '5px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 600,
              background: input.trim() && !translating ? 'rgba(59,130,246,0.08)' : 'transparent',
              color: input.trim() && !translating ? '#3b82f6' : '#d4d4d8',
              border: input.trim() && !translating ? '1px solid rgba(59,130,246,0.15)' : '1px solid transparent',
              cursor: input.trim() && !translating ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => { if (input.trim() && !translating) { e.currentTarget.style.background = 'rgba(59,130,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)' } }}
            onMouseLeave={(e) => { if (input.trim() && !translating) { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.15)' } }}
          >
            {translating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {translating ? '翻译中' : '翻译'}
          </button>
        </div>
      </div>

      {/* Output area */}
      <div className="flex-1 flex flex-col" style={{ ...glassStyle, padding: '12px 14px', minHeight: '100px', position: 'relative' }}>
        {output ? (
          <>
            <div className="flex-1 text-[12px] leading-relaxed break-words whitespace-pre-wrap overflow-y-auto" style={{ color: '#27272a' }}>
              {output}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.03)' }}>
              <span className="text-[9px]" style={{ color: '#d4d4d8' }}>{output.length} 字</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] font-medium transition-all"
                style={{
                  padding: '4px 10px',
                  borderRadius: '14px',
                  color: copied ? '#10b981' : '#3b82f6',
                  background: copied ? 'rgba(16,185,129,0.06)' : 'rgba(59,130,246,0.06)',
                  border: copied ? '1px solid rgba(16,185,129,0.12)' : '1px solid rgba(59,130,246,0.12)',
                }}
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[11px] text-center py-2 px-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.12)' }}>
              {error}
            </div>
          </div>
        ) : translating ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin" style={{ color: '#3b82f6' }} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ opacity: 0.4 }}>
            <Languages size={24} style={{ color: '#a1a1aa' }} strokeWidth={1.5} />
            <p className="text-[10px] mt-2" style={{ color: '#a1a1aa' }}>译文将显示在这里</p>
          </div>
        )}
      </div>

      <p className="text-[9px] text-center" style={{ color: '#d4d4d8', padding: '8px 0 12px' }}>
        Ctrl + Enter 翻译
      </p>
    </div>
  )
}
