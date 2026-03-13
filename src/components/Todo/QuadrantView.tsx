import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { useTodoStore, filterTodoItems } from '../../stores/todoStore'

var QUADRANT_CONFIG: { key: Quadrant; label: string; dot: string; bg: string }[] = [
  { key: 'urgent-important', label: '重要且紧急', dot: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
  { key: 'important', label: '重要不紧急', dot: '#f97316', bg: 'rgba(249,115,22,0.06)' },
  { key: 'urgent', label: '紧急不重要', dot: '#3b82f6', bg: 'rgba(59,130,246,0.06)' },
  { key: 'normal', label: '不紧急不重要', dot: '#22c55e', bg: 'rgba(34,197,94,0.06)' },
]

interface QuadrantViewProps {
  onEdit: (item: TodoItem) => void
}

/**
 * 四象限（艾森豪威尔矩阵）视图
 * @param props.onEdit 点击任务触发编辑
 */
export default function QuadrantView({ onEdit }: QuadrantViewProps) {
  var storeItems = useTodoStore(s => s.items)
  var filterDate = useTodoStore(s => s.filterDate)
  var items = useMemo(() => filterTodoItems(storeItems, filterDate), [storeItems, filterDate])
  var toggleItem = useTodoStore(s => s.toggleItem)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 0 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {QUADRANT_CONFIG.map(q => {
          var qItems = items.filter(i => i.quadrant === q.key)
          var doneCount = qItems.filter(i => i.done).length
          return (
            <QuadrantCard
              key={q.key}
              config={q}
              items={qItems}
              doneCount={doneCount}
              onToggle={toggleItem}
              onEdit={onEdit}
            />
          )
        })}
      </div>

      {/* 未分类 */}
      {(() => {
        var unclassified = items.filter(i => !i.quadrant)
        if (unclassified.length === 0) return null
        return (
          <div style={{ marginTop: '8px' }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: '#a1a1aa', padding: '4px 0', letterSpacing: '0.05em' }}>
              未分类 ({unclassified.length})
            </p>
            {unclassified.map(item => (
              <MiniTaskRow key={item.id} item={item} dot="#a1a1aa" onToggle={() => toggleItem(item.id)} onClick={() => onEdit(item)} />
            ))}
          </div>
        )
      })()}
    </div>
  )
}

/* ── 象限卡片 ── */
function QuadrantCard({
  config, items, doneCount, onToggle, onEdit,
}: {
  config: typeof QUADRANT_CONFIG[0]
  items: TodoItem[]
  doneCount: number
  onToggle: (id: string) => void
  onEdit: (item: TodoItem) => void
}) {
  return (
    <div
      className="glass"
      style={{
        borderRadius: '14px',
        overflow: 'hidden',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between"
        style={{ padding: '10px 12px 6px', background: config.bg }}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: config.dot }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: config.dot }}>{config.label}</span>
        </div>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '6px',
          background: 'rgba(0,0,0,0.05)',
          color: '#71717a',
        }}>
          {items.length}
        </span>
      </div>

      {/* 任务列表 */}
      <div style={{ padding: '4px 8px 8px', flex: 1 }}>
        {items.length === 0 && (
          <div style={{ padding: '16px 0', textAlign: 'center', color: '#d4d4d8', fontSize: '11px' }} />
        )}
        {items.map(item => (
          <MiniTaskRow key={item.id} item={item} dot={config.dot} onToggle={() => onToggle(item.id)} onClick={() => onEdit(item)} />
        ))}
      </div>
    </div>
  )
}

/* ── 紧凑任务行 ── */
function MiniTaskRow({
  item, dot, onToggle, onClick,
}: {
  item: TodoItem
  dot: string
  onToggle: () => void
  onClick: () => void
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        padding: '4px 4px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '4px',
          border: item.done ? 'none' : `1.5px solid ${dot}40`,
          background: item.done ? dot : 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.done && <Check size={9} style={{ color: '#fff' }} />}
      </button>
      <span style={{
        fontSize: '11px',
        fontWeight: 500,
        color: item.done ? '#a1a1aa' : '#3f3f46',
        textDecoration: item.done ? 'line-through' : 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {(item as { title?: string; content?: string }).title || (item as { title?: string; content?: string }).content || ''}
      </span>
      {item.color && (
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color, flexShrink: 0, marginLeft: 'auto' }} />
      )}
    </div>
  )
}
