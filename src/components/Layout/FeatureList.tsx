import { useState } from 'react'
import {
  FileText,
  CheckSquare,
  Languages,
  Bot,
  ClipboardList,
  BookText,
  Settings,
} from 'lucide-react'
import { type TabType } from '../../stores/settingsStore'

export interface FeatureItem {
  id: TabType
  label: string
  desc: string
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  color: string
}

export const ALL_FEATURES: FeatureItem[] = [
  { id: 'notes', label: '笔记', desc: '记录灵感与想法', icon: FileText, color: '#5b6abf' },
  { id: 'todo', label: '清单', desc: '管理每日待办事项', icon: CheckSquare, color: '#e6a23c' },
  { id: 'translate', label: '翻译', desc: '多语言即时互译', icon: Languages, color: '#409eff' },
  { id: 'ai', label: 'AI', desc: '智能对话即问即答', icon: Bot, color: '#e040a0' },
  { id: 'clipboard', label: '剪贴板', desc: '剪贴板历史快速回溯', icon: ClipboardList, color: '#19c2c9' },
  { id: 'prompts', label: '提示词', desc: '管理AI提示词模板', icon: BookText, color: '#67c23a' },
  { id: 'settings', label: '设置', desc: '自定义偏好与配置', icon: Settings, color: '#909399' },
]

interface FeatureListProps {
  features: FeatureItem[]
  onSelect: (tab: TabType) => void
}

export default function FeatureList({ features, onSelect }: FeatureListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div className="qs-icon-bar">
      {features.map((f) => {
        const Icon = f.icon
        const isHovered = hoveredId === f.id
        return (
          <button
            key={f.id}
            className="qs-icon-item"
            onClick={() => onSelect(f.id)}
            onMouseEnter={() => setHoveredId(f.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={f.desc}
          >
            <div
              className="qs-icon-circle"
              style={{
                background: isHovered ? f.color : undefined,
                transform: isHovered ? 'scale(1.12)' : 'scale(1)',
              }}
            >
              <Icon size={18} style={{ color: isHovered ? '#fff' : f.color }} />
            </div>
            <span className="qs-icon-label">{f.label}</span>
          </button>
        )
      })}
    </div>
  )
}
