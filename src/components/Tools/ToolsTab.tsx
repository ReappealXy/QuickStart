import { Languages, Bot, ClipboardList, BookText, ChevronRight } from 'lucide-react'
import { useSettingsStore, type TabType } from '../../stores/settingsStore'

var toolCards: { id: TabType; label: string; desc: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; gradient: string; shadow: string }[] = [
  {
    id: 'translate',
    label: '翻译',
    desc: '多语言互译，即时翻译文本',
    icon: Languages,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    shadow: 'rgba(102, 126, 234, 0.35)',
  },
  {
    id: 'ai',
    label: 'AI 助手',
    desc: '智能对话，即问即答',
    icon: Bot,
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    shadow: 'rgba(240, 147, 251, 0.35)',
  },
  {
    id: 'clipboard',
    label: '剪贴板',
    desc: '剪贴板历史，快速回溯',
    icon: ClipboardList,
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    shadow: 'rgba(79, 172, 254, 0.35)',
  },
  {
    id: 'prompts',
    label: '提示词',
    desc: '管理 AI 提示词，一键复制',
    icon: BookText,
    gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    shadow: 'rgba(67, 233, 123, 0.35)',
  },
]

export default function ToolsTab() {
  var setActiveTab = useSettingsStore((s) => s.setActiveTab)

  return (
    <div
      className="h-full flex flex-col"
      style={{ padding: '12px var(--container-padding)', overflow: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toolCards.map((card) => {
          var Icon = card.icon
          return (
            <button
              key={card.id}
              onClick={() => setActiveTab(card.id)}
              className="glass card-shadow"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateX(2px)'
                e.currentTarget.style.boxShadow = `0 6px 20px -4px ${card.shadow}`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateX(0)'
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: '40px',
                  height: '40px',
                  background: card.gradient,
                  boxShadow: `0 4px 12px -2px ${card.shadow}`,
                  flexShrink: 0,
                }}
              >
                <Icon size={20} style={{ color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.4)', marginTop: '2px' }}>
                  {card.desc}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'rgba(0,0,0,0.2)', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
