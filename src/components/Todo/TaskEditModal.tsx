import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * 本地日期字符串
 * @param d Date
 * @return YYYY-MM-DD
 */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

var COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

var QUADRANTS: { key: Quadrant; label: string; dot: string }[] = [
  { key: 'urgent-important', label: '重要且紧急', dot: '#ef4444' },
  { key: 'important', label: '重要不紧急', dot: '#f97316' },
  { key: 'urgent', label: '紧急不重要', dot: '#3b82f6' },
  { key: 'normal', label: '不紧急不重要', dot: '#22c55e' },
]

interface TaskEditModalProps {
  item?: TodoItem | null
  defaultDate?: string
  onSave: (data: { id?: string; title: string; description: string; color: string | null; quadrant: Quadrant | null; startDate: string; endDate: string | null }) => void
  onClose: () => void
}

/**
 * 任务新增/编辑弹窗
 * @param props.item 编辑时传入已有任务，新增时为 null
 * @param props.onSave 保存回调
 * @param props.onClose 关闭回调
 */
export default function TaskEditModal({ item, defaultDate, onSave, onClose }: TaskEditModalProps) {
  var [title, setTitle] = useState(item?.title || '')
  var [description, setDescription] = useState(item?.description || '')
  var [color, setColor] = useState<string | null>(item?.color || null)
  var [quadrant, setQuadrant] = useState<Quadrant | null>(item?.quadrant || null)
  var [startDate, setStartDate] = useState(item?.startDate || defaultDate || toLocalDateStr(new Date()))
  var [endDate, setEndDate] = useState(item?.endDate || '')
  var titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  var handleSubmit = () => {
    if (!title.trim()) return
    onSave({
      id: item?.id,
      title: title.trim(),
      description: description.trim(),
      color,
      quadrant,
      startDate,
      endDate: endDate || null,
    })
  }

  var handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
  }

  var inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '10px',
    outline: 'none',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.6)',
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          width: '360px',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '22px',
          borderRadius: '20px',
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
          animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
            {item ? '编辑任务' : '新建任务'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}>
            <X size={18} />
          </button>
        </div>

        {/* 标题 */}
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '4px', display: 'block' }}>
          <span style={{ color: '#ef4444' }}>*</span> 标题
        </label>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入任务标题"
          style={{ ...inputStyle, marginBottom: '12px' }}
        />

        {/* 描述 */}
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '4px', display: 'block' }}>描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="添加详细描述..."
          rows={3}
          style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit', lineHeight: '1.6', marginBottom: '14px' }}
        />

        {/* 颜色 */}
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '6px', display: 'block' }}>颜色</label>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: '14px' }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(color === c ? null : c)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '8px',
                background: c,
                border: color === c ? '2.5px solid #1a1a1a' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                transform: color === c ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* 四象限 */}
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '6px', display: 'block' }}>四象限</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
          {QUADRANTS.map(q => (
            <button
              key={q.key}
              onClick={() => setQuadrant(quadrant === q.key ? null : q.key)}
              className="flex items-center gap-2"
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                border: quadrant === q.key ? `2px solid ${q.dot}` : '1.5px solid rgba(0,0,0,0.06)',
                background: quadrant === q.key ? `${q.dot}10` : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontSize: '11px',
                fontWeight: 600,
                color: quadrant === q.key ? q.dot : '#71717a',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: q.dot, flexShrink: 0 }} />
              {q.label}
            </button>
          ))}
        </div>

        {/* 日期范围 */}
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '6px', display: 'block' }}>时间范围</label>
        <div className="flex items-center gap-2" style={{ marginBottom: '18px' }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '12px' }}
          />
          <span style={{ color: '#a1a1aa', fontSize: '12px', flexShrink: 0 }}>→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '12px' }}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1"
            style={{
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.1)',
              background: '#fff',
              color: '#71717a',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1"
            style={{
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              cursor: 'pointer',
              opacity: title.trim() ? 1 : 0.5,
              boxShadow: '0 2px 8px rgba(102,126,234,0.25)',
            }}
          >
            {item ? '保存' : '创建'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
