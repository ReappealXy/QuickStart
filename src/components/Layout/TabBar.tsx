import { useState, useEffect, useRef } from 'react'
import { FileText, CheckSquare, Languages, Bot, ClipboardList, Settings } from 'lucide-react'
import { useSettingsStore, type TabType } from '../../stores/settingsStore'

const tabs: { id: TabType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'notes', label: '记录', icon: FileText },
  { id: 'todo', label: '清单', icon: CheckSquare },
  { id: 'translate', label: '翻译', icon: Languages },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'clipboard', label: '剪贴板', icon: ClipboardList },
  { id: 'settings', label: '', icon: Settings }
]

export default function TabBar() {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<TabType, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  // Update indicator position when activeTab changes
  useEffect(() => {
    const updateIndicator = () => {
      const container = containerRef.current
      const activeButton = tabRefs.current.get(activeTab)
      if (container && activeButton) {
        const containerRect = container.getBoundingClientRect()
        const buttonRect = activeButton.getBoundingClientRect()
        setIndicator({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
        })
      }
    }
    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [activeTab])

  return (
    <div
      ref={containerRef}
      className="flex items-center rounded-2xl glass card-shadow flex-shrink-0 relative"
      style={{
        margin: '8px var(--container-padding) 6px var(--container-padding)',
        padding: '4px 5px',
        gap: '2px',
      }}
    >
      {/* Sliding Indicator */}
      <div
        className="absolute rounded-xl pointer-events-none"
        style={{
          left: indicator.left,
          width: indicator.width,
          top: 4,
          bottom: 4,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          boxShadow: '0 4px 18px -3px rgba(102, 126, 234, 0.5), 0 2px 6px -1px rgba(118, 75, 162, 0.25)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 0,
        }}
      />

      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        const isIconOnly = !tab.label
        return (
          <button
            key={tab.id}
            ref={(el) => { if (el) tabRefs.current.set(tab.id, el) }}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center justify-center rounded-xl transition-colors relative
              ${
                isActive
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/30 dark:hover:bg-white/5'
              }
            `}
            style={{
              flex: '0 0 auto',
              gap: '4px',
              padding: '8px 10px',
              fontSize: '12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              zIndex: 1,
            }}
          >
            <Icon size={15} className={isActive ? 'drop-shadow-sm' : ''} style={{ flexShrink: 0 }} />
            {tab.label && <span>{tab.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
