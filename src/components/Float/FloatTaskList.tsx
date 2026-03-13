import { Check } from 'lucide-react'

interface FloatTaskListProps {
  items: TodoItem[]
  onToggle: (id: string) => void
}

/**
 * 浮动窗口任务列表
 * @param props.items 当天的任务列表
 * @param props.onToggle 勾选回调
 */
export default function FloatTaskList({ items, onToggle }: FloatTaskListProps) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: '#d4d4d8', fontSize: '11px' }}>
        暂无任务
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '4px 10px 4px' }}>
      {items.map(item => (
        <div
          key={item.id}
          className="flex items-center gap-2"
          style={{
            padding: '5px 6px',
            borderRadius: '8px',
            marginBottom: '2px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onClick={() => onToggle(item.id)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {/* 勾选框 */}
          <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '4px',
            border: item.done ? 'none' : '1.5px solid #d4d4d8',
            background: item.done ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}>
            {item.done && <Check size={9} style={{ color: '#fff' }} />}
          </div>

          {/* 颜色点 */}
          {item.color && (
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          )}

          {/* 标题 */}
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            color: item.done ? '#a1a1aa' : '#3f3f46',
            textDecoration: item.done ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {item.title}
          </span>

          {/* 日期范围指示 */}
          {item.endDate && item.endDate !== item.startDate && (
            <span style={{ fontSize: '8px', color: '#d4d4d8', flexShrink: 0 }}>
              →{item.endDate.slice(5)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
