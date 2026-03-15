import { useState, useRef, useEffect } from 'react'
import { Minus, X, Pin, PinOff, Search, ArrowLeft } from 'lucide-react'

interface TitleBarProps {
  searchMode: boolean
  searchQuery: string
  onSearchChange: (val: string) => void
  onBack: () => void
  featureTitle: string
  onSearchEnter: () => void
}

export default function TitleBar({
  searchMode,
  searchQuery,
  onSearchChange,
  onBack,
  featureTitle,
  onSearchEnter,
}: TitleBarProps) {
  const [pinned, setPinned] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchMode) inputRef.current?.focus()
  }, [searchMode])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSearchEnter()
    }
  }

  return (
    <div className="qs-titlebar drag-region">
      {searchMode ? (
        <>
          <div className="qs-titlebar-logo">
            <div className="qs-logo">Q</div>
          </div>
          <div className="qs-search-inline no-drag">
            <Search size={15} className="qs-search-icon" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索功能..."
              className="qs-search-input"
              spellCheck={false}
            />
            {searchQuery && (
              <button className="qs-search-clear" onClick={() => onSearchChange('')}>
                ✕
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="qs-header-nav no-drag">
            <button className="qs-back-btn" onClick={onBack}>
              <ArrowLeft size={16} />
            </button>
            <span className="qs-header-title">{featureTitle}</span>
          </div>
        </>
      )}

      <div className="qs-titlebar-actions no-drag">
        <button
          onClick={() => {
            setPinned(!pinned)
            window.api.window.togglePin()
          }}
          className={`qs-titlebar-btn ${pinned ? 'qs-titlebar-btn--active' : ''}`}
          title={pinned ? '取消置顶' : '置顶'}
        >
          {pinned ? <Pin size={12} /> : <PinOff size={12} />}
        </button>
        <button
          onClick={() => window.api.window.minimize()}
          className="qs-titlebar-btn"
          title="最小化"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => window.api.window.hide()}
          className="qs-titlebar-btn qs-titlebar-btn--close"
          title="隐藏"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
