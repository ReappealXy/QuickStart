import { useRef, useEffect } from 'react'
import { Search, ArrowLeft } from 'lucide-react'
import { type TabType } from '../../stores/settingsStore'

interface SearchBarProps {
  value: string
  onChange: (val: string) => void
  isFeatureMode: boolean
  featureTitle: string
  onBack: () => void
  onSelect: (tab: TabType) => void
  filteredFeatures: { id: TabType; label: string }[]
}

export default function SearchBar({
  value,
  onChange,
  isFeatureMode,
  featureTitle,
  onBack,
  onSelect,
  filteredFeatures,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isFeatureMode) {
      inputRef.current?.focus()
    }
  }, [isFeatureMode])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredFeatures.length > 0) {
      e.preventDefault()
      onSelect(filteredFeatures[0].id)
    }
  }

  if (isFeatureMode) {
    return (
      <div className="qs-search-header">
        <button className="qs-back-btn no-drag" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <span className="qs-header-title">{featureTitle}</span>
      </div>
    )
  }

  return (
    <div className="qs-search-box no-drag">
      <Search size={18} className="qs-search-icon" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="搜索功能..."
        className="qs-search-input"
        spellCheck={false}
      />
      {value && (
        <button
          className="qs-search-clear"
          onClick={() => onChange('')}
        >
          ✕
        </button>
      )}
    </div>
  )
}
