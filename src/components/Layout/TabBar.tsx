import { FileText, CheckSquare, Languages, Bot, Settings } from 'lucide-react'
import { useSettingsStore, type TabType } from '../../stores/settingsStore'

const tabs: { id: TabType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'notes', label: '记录', icon: FileText },
  { id: 'todo', label: '清单', icon: CheckSquare },
  { id: 'translate', label: '翻译', icon: Languages },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'settings', label: '', icon: Settings }
]

export default function TabBar() {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)

  return (
    <div
      className="flex items-center rounded-2xl glass card-shadow flex-shrink-0"
      style={{
        margin: '8px var(--container-padding) 6px var(--container-padding)',
        padding: '5px 6px',
        gap: '6px',
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 flex items-center justify-center rounded-xl transition-all relative overflow-hidden
              ${
                isActive
                  ? 'text-white'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white/40 dark:hover:bg-white/5'
              }
            `}
            style={{
              gap: '6px',
              padding: '10px 0',
              fontSize: '14px',
              fontWeight: 600,
              ...(isActive ? {
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                boxShadow: '0 4px 18px -3px rgba(102, 126, 234, 0.5), 0 2px 6px -1px rgba(118, 75, 162, 0.25)',
                borderRadius: '14px',
              } : {}),
            }}
          >
            <Icon size={20} className={isActive ? 'drop-shadow-sm' : ''} />
            {tab.label && <span>{tab.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
