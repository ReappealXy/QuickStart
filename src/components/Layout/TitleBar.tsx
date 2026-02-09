import { useState } from 'react'
import { Minus, X, Pin, PinOff } from 'lucide-react'

export default function TitleBar() {
  const [pinned, setPinned] = useState(true)

  return (
    <div
      className="drag-region flex items-center justify-between select-none flex-shrink-0 glass border-b border-white/10 dark:border-white/5"
      style={{ height: '46px', padding: '0 var(--container-padding)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        >
          Q
        </div>
        <span className="text-[11px] font-semibold text-zinc-500 tracking-wide">
          <span style={{ letterSpacing: '0.5px' }}>Quick</span><span style={{ letterSpacing: '0.5px' }}>Start</span>
        </span>
      </div>

      <div className="flex items-center gap-2 no-drag">
        <button
          onClick={() => {
            setPinned(!pinned)
            window.api.window.togglePin()
          }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
            pinned
              ? 'text-violet-500 bg-violet-500/10 hover:bg-violet-500/20'
              : 'text-zinc-400 hover:bg-zinc-500/10'
          }`}
          title={pinned ? '取消置顶' : '置顶'}
        >
          {pinned ? <Pin size={13} /> : <PinOff size={13} />}
        </button>
        <button
          onClick={() => window.api.window.minimize()}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-zinc-500/10 transition-all"
          title="最小化"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => window.api.window.hide()}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-red-500/15 hover:text-red-500 transition-all"
          title="隐藏"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
