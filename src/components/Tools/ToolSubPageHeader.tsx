import { ArrowLeft } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'

/**
 * 工具子页面顶部返回栏，点击返回工具首页
 * @param props.title 当前子页面标题
 */
export default function ToolSubPageHeader({ title }: { title: string }) {
  var setActiveTab = useSettingsStore((s) => s.setActiveTab)

  return (
    <div
      className="flex items-center flex-shrink-0"
      style={{ padding: '8px var(--container-padding) 0' }}
    >
      <button
        onClick={() => setActiveTab('tools')}
        className="flex items-center gap-1 transition-colors"
        style={{
          padding: '4px 8px 4px 4px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#71717a',
          border: 'none',
          cursor: 'pointer',
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#18181b'
          e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#71717a'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <ArrowLeft size={14} />
        <span>{title}</span>
      </button>
    </div>
  )
}
