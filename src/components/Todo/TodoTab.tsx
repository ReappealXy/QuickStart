import { useEffect, useState, useRef, useCallback } from 'react'
import { useTodoStore } from '../../stores/todoStore'
import { useTimerStore } from '../../stores/timerStore'
import { createPortal } from 'react-dom'
// Todos are global (not workspace-scoped)
import {
  ChevronLeft, ChevronRight, Palette, Trash2,
  Circle, CheckCircle2, CheckSquare, Plus, CalendarDays, X, Check, GripVertical,
  Timer, Pause
} from 'lucide-react'
import CalendarPicker from './CalendarPicker'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const COLORS: (string | null)[] = [
  null, '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
]

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const month = d.getMonth() + 1
  const day = d.getDate()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  return `${month}月${day}日 · 周${weekDays[d.getDay()]}`
}

/* ─── Format Timer ─── */
function formatTimer(seconds: number): string {
  const mins = Math.floor(Math.abs(seconds) / 60)
  const secs = Math.abs(seconds) % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/* ─── Sortable Item ─── */
function SortableTodoItem({
  item,
  isDark,
  isOverlay,
  onToggle,
  onEdit,
  onDelete,
  onColorPicker,
  colorPickerOpen,
  isTimerActive,
  timerSeconds,
  onTimerToggle,
  onOpenTimerMenu,
  isTimerFinished,
  showTimerSaved,
}: {
  item: TodoItem
  isDark: boolean
  isOverlay?: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onColorPicker: () => void
  colorPickerOpen: boolean
  isTimerActive?: boolean
  timerSeconds?: number
  onTimerToggle?: () => void
  onOpenTimerMenu?: (e: React.MouseEvent) => void
  isTimerFinished?: boolean
  showTimerSaved?: number
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: item.done })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }

  // Calculate progress for countdown ring
  const countdownProgress = item.timerLimit && timerSeconds !== undefined
    ? Math.max(0, timerSeconds / item.timerLimit)
    : 1

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group ${isOverlay ? '' : 'animate-fadeInUp'}`}
    >
      <div
        className="relative flex items-center transition-all duration-200"
        style={{
          gap: '16px',
          padding: '14px 16px',
          borderRadius: '16px',
          background: isOverlay
            ? isDark ? 'rgba(39,39,42,0.98)' : 'rgba(255,255,255,0.98)'
            : item.done
              ? isDark ? 'rgba(39,39,42,0.4)' : 'rgba(250,250,250,0.6)'
              : isDark ? 'rgba(39,39,42,0.6)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: isTimerActive
            ? '1px solid rgba(124,77,255,0.25)'
            : item.done
              ? isDark ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.03)'
              : isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.6)',
          boxShadow: isTimerActive
            ? '0 0 20px rgba(124,77,255,0.15), 0 2px 12px -2px rgba(124,77,255,0.1)'
            : isOverlay
              ? '0 20px 60px -12px rgba(0,0,0,0.15)'
              : item.done
                ? 'none'
                : isDark
                  ? '0 2px 12px -2px rgba(0,0,0,0.2)'
                  : '0 2px 12px -2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)',
          animation: isTimerActive ? 'timerBreathGlow 2s ease-in-out infinite' : undefined,
        }}
      >
        {/* Ripple effect when timer finishes */}
        {isTimerFinished && (
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: 'radial-gradient(circle at center, rgba(124,77,255,0.25) 0%, transparent 70%)',
              animation: 'timerRipple 1.5s ease-out forwards',
            }}
          />
        )}

        {/* Timer active breathing glow background */}
        {isTimerActive && !item.done && (
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(124,77,255,0.03) 0%, rgba(179,136,255,0.05) 100%)',
              animation: 'timerBreathBg 3s ease-in-out infinite',
            }}
          />
        )}

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className={`flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
            item.done ? 'cursor-default opacity-20' : 'cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40'
          }`}
          style={{ width: '14px', height: '14px', color: '#a1a1aa', touchAction: 'none' }}
          tabIndex={-1}
        >
          <GripVertical size={12} />
        </button>

        {/* Timer Ring + Checkbox */}
        <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: '22px', height: '22px' }}>
          {/* SVG Ring for active timer */}
          {isTimerActive && !item.done && (
            <svg
              className="absolute"
              style={{ width: '26px', height: '26px', left: '-2px', top: '-2px', animation: 'timerRingSpin 6s linear infinite' }}
            >
              <defs>
                <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7C4DFF" stopOpacity="1" />
                  <stop offset="50%" stopColor="#B388FF" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#7C4DFF" stopOpacity="1" />
                </linearGradient>
              </defs>
              <circle
                cx="13" cy="13" r="11" fill="none" stroke="url(#timerGrad)" strokeWidth="2" strokeLinecap="round"
                strokeDasharray={item.timerLimit ? `${69 * countdownProgress} 69` : '69 0'}
                style={{ filter: 'drop-shadow(0 0 4px rgba(124,77,255,0.5))', transformOrigin: 'center', transform: 'rotate(-90deg)', transition: item.timerLimit ? 'stroke-dasharray 1s linear' : undefined }}
              />
            </svg>
          )}

          {/* Checkbox */}
          <button
            onClick={onToggle}
            className="relative flex items-center justify-center transition-all duration-200 hover:scale-110"
            style={{ width: '20px', height: '20px' }}
            title={item.done ? '取消完成' : '完成任务'}
          >
            {item.done ? (
              <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
            ) : (
              <Circle size={20} style={{ color: '#d4d4d8' }} className="hover:text-violet-400" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span
              onClick={() => !item.done && onEdit()}
              className={`text-[14px] font-medium transition-all duration-300 ${item.done ? 'line-through cursor-default' : 'cursor-pointer'}`}
              style={{ color: item.done ? (isDark ? '#71717a' : '#a1a1aa') : item.color || (isDark ? '#e4e4e7' : '#27272a'), textDecorationColor: isDark ? '#52525b' : '#d4d4d8' }}
            >
              {item.content}
            </span>

            {/* Timer icon on hover */}
            {!item.done && !isTimerActive && (
              <button
                onClick={onOpenTimerMenu}
                className="flex-shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-all duration-150 p-1.5 rounded-lg"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(124,77,255,0.12)' : 'rgba(124,77,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="计时"
              >
                <Timer size={14} style={{ color: '#7C4DFF' }} />
              </button>
            )}

            {/* Pause button */}
            {!item.done && isTimerActive && (
              <button
                onClick={onTimerToggle}
                className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-150"
                style={{ background: 'rgba(124,77,255,0.08)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124,77,255,0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(124,77,255,0.08)'}
                title="暂停计时"
              >
                <Pause size={12} style={{ color: '#7C4DFF' }} />
                <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: '#7C4DFF' }}>
                  {formatTimer(timerSeconds ?? 0)}
                </span>
              </button>
            )}
          </div>

          {/* Time tag under title - badge style */}
          {/* Completed task with timer */}
          {item.done && item.completedDuration && item.completedDuration > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{
                background: isDark ? 'rgba(124,77,255,0.08)' : 'rgba(124,77,255,0.06)',
                border: isDark ? '1px solid rgba(124,77,255,0.12)' : '1px solid rgba(124,77,255,0.1)',
                animation: 'fadeIn 0.3s ease-out',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C4DFF" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: '#7C4DFF' }}>{formatTimer(item.completedDuration)}</span>
            </div>
          )}

          {/* Uncompleted task with finished countdown (completedDuration set but not done) */}
          {!item.done && !isTimerActive && item.completedDuration && item.completedDuration > 0 && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{
                background: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)',
                border: isDark ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(34,197,94,0.15)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span className="text-[11px] font-medium" style={{ color: '#22c55e' }}>
                专注完成 {formatTimer(item.completedDuration)}
              </span>
            </div>
          )}

          {/* Uncompleted task with partial timer progress (no completedDuration, has timerSpent) */}
          {!item.done && !isTimerActive && !item.completedDuration && item.timerSpent && item.timerSpent > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md" style={{ color: isDark ? 'rgba(179,136,255,0.8)' : 'rgba(124,77,255,0.7)', background: isDark ? 'rgba(124,77,255,0.06)' : 'rgba(124,77,255,0.04)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span className="font-mono tabular-nums">已计 {formatTimer(item.timerSpent)}</span>
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-40 hover:!opacity-100"
            style={{ color: isDark ? '#71717a' : '#a1a1aa' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(124,77,255,0.12)' : 'rgba(124,77,255,0.08)'; e.currentTarget.style.color = '#7C4DFF' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = isDark ? '#71717a' : '#a1a1aa' }}
            title="编辑"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button
            onClick={onColorPicker}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-40 hover:!opacity-100"
            style={{ color: isDark ? '#71717a' : '#a1a1aa' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(124,77,255,0.12)' : 'rgba(124,77,255,0.08)'; e.currentTarget.style.color = '#7C4DFF' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = isDark ? '#71717a' : '#a1a1aa' }}
            title="颜色"
          >
            <Palette size={13} />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-40 hover:!opacity-100"
            style={{ color: isDark ? '#71717a' : '#a1a1aa' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = isDark ? '#71717a' : '#a1a1aa' }}
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Timer Dial Modal (Refined Glass UI) ─── */
function TimerDialModal({
  isDark,
  onClose,
  onStartCountUp,
  onStartCountDown,
}: {
  isDark: boolean
  onClose: () => void
  onStartCountUp: () => void
  onStartCountDown: (minutes: number) => void
}) {
  const [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch')
  const [dialMinutes, setDialMinutes] = useState(25)
  const [slideProgress, setSlideProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isDialDragging, setIsDialDragging] = useState(false)
  const dialRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)

  // ========== 统一角度计算：12点钟为0°，顺时针增加 ==========
  const angleFromMinutes = (minutes: number): number => {
    return (minutes / 60) * 360
  }

  // Slide to start handler
  const handleSlideStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleSlideMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !sliderRef.current) return
    const rect = sliderRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const thumbWidth = 48
    const padding = 4
    const availableWidth = rect.width - thumbWidth - padding * 2
    const progress = Math.max(0, Math.min(1, (clientX - rect.left - padding - thumbWidth / 2) / availableWidth))
    setSlideProgress(progress)
  }, [isDragging])

  const handleSlideEnd = useCallback(() => {
    if (slideProgress > 0.85) {
      onStartCountUp()
      onClose()
    } else {
      setSlideProgress(0)
    }
    setIsDragging(false)
  }, [slideProgress, onStartCountUp, onClose])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleSlideMove)
      window.addEventListener('mouseup', handleSlideEnd)
      window.addEventListener('touchmove', handleSlideMove)
      window.addEventListener('touchend', handleSlideEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleSlideMove)
      window.removeEventListener('mouseup', handleSlideEnd)
      window.removeEventListener('touchmove', handleSlideMove)
      window.removeEventListener('touchend', handleSlideEnd)
    }
  }, [isDragging, handleSlideMove, handleSlideEnd])

  // Dial rotation handler - 统一使用12点钟为0°基准
  const handleDialStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDialDragging(true)
  }

  const handleDialMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDialDragging || !dialRef.current) return
    const rect = dialRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    // 12点钟为0°，顺时针增加
    const dx = clientX - centerX
    const dy = clientY - centerY
    let degrees = Math.atan2(dx, -dy) * (180 / Math.PI)
    degrees = (degrees + 360) % 360
    const minutes = Math.round(degrees / 6)
    setDialMinutes(Math.max(1, Math.min(60, minutes === 0 ? 60 : minutes)))
  }, [isDialDragging])

  const handleDialEnd = useCallback(() => {
    setIsDialDragging(false)
  }, [])

  useEffect(() => {
    if (isDialDragging) {
      window.addEventListener('mousemove', handleDialMove)
      window.addEventListener('mouseup', handleDialEnd)
      window.addEventListener('touchmove', handleDialMove)
      window.addEventListener('touchend', handleDialEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleDialMove)
      window.removeEventListener('mouseup', handleDialEnd)
      window.removeEventListener('touchmove', handleDialMove)
      window.removeEventListener('touchend', handleDialEnd)
    }
  }, [isDialDragging, handleDialMove, handleDialEnd])

  // 统一角度：弧线和把手共用
  const dialAngle = angleFromMinutes(dialMinutes)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 9998,
        background: 'rgba(0,0,0,0.15)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        animation: 'timerModalIn 0.3s ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center"
        style={{
          width: '320px',
          padding: '24px',
          borderRadius: '28px',
          background: isDark ? 'rgba(30, 30, 35, 0.92)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.9)',
          boxShadow: isDark ? '0 10px 40px rgba(0, 0, 0, 0.4)' : '0 10px 40px rgba(0, 0, 0, 0.08)',
          animation: 'timerDialIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Segmented Tab Selector with Sliding Indicator */}
        <div
          className="relative flex w-full mb-6 overflow-hidden"
          style={{
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.06)',
            borderRadius: '12px',
            padding: '3px',
            height: '44px',
          }}
        >
          {/* Sliding Indicator - 与底槽同高同圆角 */}
          <div
            className="absolute transition-all duration-300 ease-out"
            style={{
              width: 'calc(50% - 3px)',
              height: 'calc(100% - 6px)',
              top: '3px',
              left: mode === 'stopwatch' ? '3px' : 'calc(50%)',
              background: isDark ? 'rgba(255,255,255,0.95)' : '#fff',
              borderRadius: '9px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            }}
          />
          <button
            onClick={() => setMode('stopwatch')}
            className="relative flex-1 flex items-center justify-center text-[13px] font-semibold transition-colors duration-300 z-10"
            style={{
              color: mode === 'stopwatch' ? '#7C4DFF' : (isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa'),
              height: '100%',
            }}
          >
            正计时
          </button>
          <button
            onClick={() => setMode('countdown')}
            className="relative flex-1 flex items-center justify-center text-[13px] font-semibold transition-colors duration-300 z-10"
            style={{
              color: mode === 'countdown' ? '#7C4DFF' : (isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa'),
              height: '100%',
            }}
          >
            倒计时
          </button>
        </div>

        {/* Stopwatch Mode */}
        {mode === 'stopwatch' && (
          <div className="w-full flex flex-col items-center" style={{ animation: 'timerContentIn 0.35s ease-out' }}>
            {/* Time Display Circle */}
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: '120px',
                height: '120px',
                marginBottom: '20px',
                background: isDark
                  ? 'linear-gradient(145deg, rgba(124,77,255,0.15) 0%, rgba(124,77,255,0.05) 100%)'
                  : 'linear-gradient(145deg, rgba(124,77,255,0.08) 0%, rgba(124,77,255,0.03) 100%)',
                border: isDark ? '2px solid rgba(124,77,255,0.25)' : '2px solid rgba(124,77,255,0.15)',
                boxShadow: 'inset 0 2px 10px rgba(124,77,255,0.05)',
              }}
            >
              <span className="font-mono text-[34px] font-bold tracking-tight" style={{ color: '#7C4DFF' }}>
                00:00
              </span>
            </div>

            <p className="text-[12px] mb-5" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa' }}>
              滑动开始计时
            </p>

            {/* Slide to Start Track */}
            <div
              ref={sliderRef}
              className="relative w-full rounded-full"
              style={{
                height: '56px',
                background: isDark ? 'rgba(124, 77, 255, 0.12)' : 'rgba(124, 77, 255, 0.06)',
                border: isDark ? '1px solid rgba(124, 77, 255, 0.2)' : '1px solid rgba(124, 77, 255, 0.1)',
              }}
            >
              {/* Progress Fill */}
              <div
                className="absolute top-1 bottom-1 left-1 rounded-full"
                style={{
                  width: `calc(${slideProgress * 100}% * 0.82 + 48px)`,
                  background: isDark
                    ? 'linear-gradient(90deg, rgba(124,77,255,0.2) 0%, rgba(124,77,255,0.35) 100%)'
                    : 'linear-gradient(90deg, rgba(124,77,255,0.12) 0%, rgba(124,77,255,0.25) 100%)',
                  transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  maxWidth: 'calc(100% - 8px)',
                }}
              />

              {/* Slider Thumb */}
              <div
                className="absolute top-1/2 w-12 h-12 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
                style={{
                  left: `calc(4px + ${slideProgress} * (100% - 56px))`,
                  transform: `translateY(-50%) scale(${isDragging ? 1.08 : 1})`,
                  background: slideProgress > 0.85
                    ? 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)'
                    : 'linear-gradient(135deg, #7C4DFF 0%, #A78BFA 100%)',
                  boxShadow: slideProgress > 0.85
                    ? '0 4px 16px rgba(34, 197, 94, 0.4)'
                    : '0 4px 16px rgba(124, 77, 255, 0.35)',
                  transition: isDragging ? 'transform 0.1s, background 0.2s, box-shadow 0.2s' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseDown={handleSlideStart}
                onTouchStart={handleSlideStart}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {slideProgress > 0.85 ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  )}
                </svg>
              </div>

              {/* End Indicator - only show when not completed */}
              {slideProgress < 0.85 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C4DFF" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Countdown Mode */}
        {mode === 'countdown' && (
          <div className="w-full flex flex-col items-center" style={{ animation: 'timerContentIn 0.35s ease-out' }}>
            {/* Circular Dial - 180px diameter, 使用SVG实现精准弧线 */}
            <div
              ref={dialRef}
              className="relative cursor-pointer select-none"
              style={{ width: '180px', height: '180px', marginBottom: '20px' }}
              onMouseDown={handleDialStart}
              onTouchStart={handleDialStart}
            >
              {/* SVG 圆环：size=180, strokeWidth=12, trackRadius = (180-12)/2 = 84 */}
              {(() => {
                const size = 180
                const strokeWidth = 12
                const trackRadius = (size - strokeWidth) / 2  // 84px，确保描边不溢出
                const circumference = 2 * Math.PI * trackRadius
                const arcLength = (dialAngle / 360) * circumference
                return (
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
                    {/* 灰色底轨道 */}
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={trackRadius}
                      fill="none"
                      stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.06)'}
                      strokeWidth={strokeWidth}
                    />
                    {/* 紫色进度弧线 - 共享同一 trackRadius，无 linecap 避免溢出 */}
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={trackRadius}
                      fill="none"
                      stroke="url(#dialGradient)"
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${arcLength} ${circumference}`}
                      style={{ transition: isDialDragging ? 'none' : 'stroke-dasharray 0.15s ease-out' }}
                    />
                    <defs>
                      <linearGradient id="dialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#7C4DFF" />
                        <stop offset="100%" stopColor="#A78BFA" />
                      </linearGradient>
                    </defs>
                  </svg>
                )
              })()}

              {/* 刻度标记 - 12个刻度，基于 trackRadius=84, strokeWidth=12 */}
              {[...Array(12)].map((_, i) => {
                const tickAngle = i * 30
                const isActive = tickAngle < dialAngle || (dialAngle === 360 && tickAngle === 0)
                const isMajor = i % 3 === 0
                // 刻度位于轨道内侧边缘：90 - 84 + 6 = 12px
                return (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      left: '50%',
                      top: '12px',
                      width: isMajor ? '3px' : '2px',
                      height: isMajor ? '8px' : '5px',
                      borderRadius: '2px',
                      background: isActive
                        ? '#fff'
                        : (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0, 0, 0, 0.2)'),
                      transformOrigin: '50% 78px', // 90 - 12 = 78
                      transform: `translateX(-50%) rotate(${tickAngle}deg)`,
                      transition: 'background 0.15s',
                      boxShadow: isActive ? '0 0 4px rgba(124,77,255,0.5)' : 'none',
                    }}
                  />
                )
              })}

              {/* 内圆背景 - 位于轨道内侧: inset = 90 - (84 - 6) - 2 = 20px */}
              <div
                className="absolute rounded-full flex flex-col items-center justify-center"
                style={{
                  top: '20px',
                  left: '20px',
                  right: '20px',
                  bottom: '20px',
                  background: isDark ? 'rgba(30,30,35,0.95)' : 'rgba(255, 255, 255, 0.98)',
                  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.04)',
                }}
              >
                <span className="font-mono text-[44px] font-bold tracking-tight" style={{ color: '#7C4DFF', lineHeight: 1 }}>
                  {dialMinutes}
                </span>
                <span className="text-[12px] font-medium mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa' }}>分钟</span>
              </div>

              {/* 把手 - 位于轨道中心线上：center=90, trackRadius=84, 把手中心在 y=6 */}
              <div
                className="absolute"
                style={{
                  width: '16px',
                  height: '16px',
                  left: 'calc(50% - 8px)',
                  top: '-2px', // 把手中心在 y=6: -2 + 8 = 6
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7C4DFF 0%, #A78BFA 100%)',
                  boxShadow: '0 2px 8px rgba(124, 77, 255, 0.5)',
                  border: '2px solid #fff',
                  transformOrigin: '8px 92px', // 从 top=-2 到 center=90: 92px
                  transform: `rotate(${dialAngle}deg)`,
                  transition: isDialDragging ? 'none' : 'transform 0.15s ease-out',
                }}
              />
            </div>

            {/* 快捷时长 Chips - 等宽单行：minWidth=64, nowrap */}
            <div className="flex justify-center flex-nowrap" style={{ gap: '10px', marginBottom: '16px' }}>
              {[5, 15, 25, 45].map((m) => {
                const isSelected = dialMinutes === m
                return (
                  <button
                    key={m}
                    onClick={() => setDialMinutes(m)}
                    className="flex items-center justify-center text-[13px] font-medium transition-all duration-200"
                    style={{
                      height: '34px',
                      minWidth: '64px',
                      padding: '0 12px',
                      borderRadius: '17px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flexShrink: 0,
                      background: isSelected
                        ? (isDark ? 'rgba(124, 77, 255, 0.18)' : 'rgba(124, 77, 255, 0.1)')
                        : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.05)'),
                      color: isSelected
                        ? '#7C4DFF'
                        : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0, 0, 0, 0.45)'),
                      border: isSelected
                        ? '1px solid rgba(124, 77, 255, 0.2)'
                        : '1px solid transparent',
                    }}
                  >
                    {m}分钟
                  </button>
                )
              })}
            </div>

            {/* Primary Button - 开始 */}
            <button
              onClick={() => { onStartCountDown(dialMinutes); onClose() }}
              className="w-full flex items-center justify-center text-[15px] font-semibold text-white transition-all duration-200"
              style={{
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #7C4DFF 0%, #9575FF 100%)',
                boxShadow: '0 2px 12px rgba(124, 77, 255, 0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.01)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(124, 77, 255, 0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(124, 77, 255, 0.25)'
              }}
            >
              开始 {dialMinutes} 分钟
            </button>

            {/* Secondary Button - 取消 */}
            <button
              onClick={onClose}
              className="w-full flex items-center justify-center text-[14px] font-medium transition-all duration-200"
              style={{
                height: '44px',
                marginTop: '10px',
                borderRadius: '12px',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.04)',
                color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0, 0, 0, 0.5)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.07)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.04)'
              }}
            >
              取消
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes timerModalIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes timerDialIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes timerContentIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ─── Main Component ─── */
export default function TodoTab() {
  const currentDate = useTodoStore((s) => s.currentDate)
  const todoDay = useTodoStore((s) => s.todoDay)
  const loading = useTodoStore((s) => s.loading)
  const loadTodos = useTodoStore((s) => s.loadTodos)
  const setDate = useTodoStore((s) => s.setDate)
  const addItem = useTodoStore((s) => s.addItem)
  const toggleItem = useTodoStore((s) => s.toggleItem)
  const updateItem = useTodoStore((s) => s.updateItem)
  const deleteItem = useTodoStore((s) => s.deleteItem)
  const setItemColor = useTodoStore((s) => s.setItemColor)
  const goPrevDay = useTodoStore((s) => s.goPrevDay)
  const goNextDay = useTodoStore((s) => s.goNextDay)
  const reorderItems = useTodoStore((s) => s.reorderItems)

  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const [addFocused, setAddFocused] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Timer state from global store
  const activeTimerId = useTimerStore((s) => s.activeTimerId)
  const timerLimit = useTimerStore((s) => s.timerLimit)
  const startTimer = useTimerStore((s) => s.startTimer)
  const stopTimer = useTimerStore((s) => s.stopTimer)
  const getRemaining = useTimerStore((s) => s.getRemaining)
  const getElapsed = useTimerStore((s) => s.getElapsed)
  const timerFinishedId = useTimerStore((s) => s.timerFinishedId)
  const setTimerFinishedId = useTimerStore((s) => s.setTimerFinishedId)

  const [timerMenuFor, setTimerMenuFor] = useState<{ id: string; x: number; y: number } | null>(null)
  const [timerSavedFlash, setTimerSavedFlash] = useState<{ id: string; seconds: number } | null>(null)
  const [, forceTimerUpdate] = useState(0)

  // Re-render for timer display
  useEffect(() => {
    if (!activeTimerId) return
    const interval = setInterval(() => forceTimerUpdate((n) => n + 1), 1000)
    return () => clearInterval(interval)
  }, [activeTimerId])

  // Compute timer seconds for display
  const timerSeconds = activeTimerId
    ? (timerLimit ? getRemaining() : getElapsed())
    : 0

  const isDark = document.documentElement.classList.contains('dark')

  // Real-time today detection
  const [todayStr, setTodayStr] = useState(() => new Date().toISOString().split('T')[0])
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().toISOString().split('T')[0]
      setTodayStr((prev) => (prev !== now ? now : prev))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const isToday = currentDate === todayStr

  useEffect(() => { loadTodos() }, [loadTodos])

  // Reload todos when timer finishes to show updated completedDuration
  useEffect(() => {
    if (timerFinishedId) {
      loadTodos()
    }
  }, [timerFinishedId, loadTodos])

  useEffect(() => {
    if (!showCalendar) return
    const handler = () => setShowCalendar(false)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [showCalendar])

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length)
    }
  }, [editingId])


  const handleTimerStart = useCallback((id: string) => {
    // Stop any existing timer first
    if (activeTimerId && activeTimerId !== id) {
      const { elapsed } = stopTimer()
      const prevItem = todoDay.items.find(i => i.id === activeTimerId)
      if (prevItem && elapsed > 0) {
        updateItem(activeTimerId, { timerSpent: (prevItem.timerSpent || 0) + elapsed })
      }
    }

    const item = todoDay.items.find(i => i.id === id)
    if (!item) return

    const limit = item.timerLimit && item.timerLimit > 0 ? item.timerLimit : null
    startTimer(id, item.content, currentDate, limit, item.timerSpent || 0)
  }, [activeTimerId, todoDay.items, startTimer, stopTimer, updateItem, currentDate])

  const handleTimerStop = useCallback((id: string) => {
    const { elapsed } = stopTimer()

    // Save elapsed time
    const item = todoDay.items.find(i => i.id === id)
    if (item && elapsed > 0) {
      const newSpent = (item.timerSpent || 0) + elapsed
      updateItem(id, { timerSpent: newSpent })
      // Show saved flash
      setTimerSavedFlash({ id, seconds: elapsed })
      setTimeout(() => setTimerSavedFlash(null), 1500)
    }
  }, [todoDay.items, updateItem, stopTimer])

  const handleTimerToggle = useCallback((id: string) => {
    if (activeTimerId === id) {
      handleTimerStop(id)
    } else {
      handleTimerStart(id)
    }
  }, [activeTimerId, handleTimerStart, handleTimerStop])

  const openTimerMenu = useCallback((id: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTimerMenuFor({ id, x: rect.left, y: rect.bottom + 6 })
  }, [])

  const startCountUp = useCallback((id: string) => {
    setTimerMenuFor(null)
    const item = todoDay.items.find(i => i.id === id)
    if (!item) return

    // Update item and start timer immediately with no limit (count up)
    updateItem(id, { timerLimit: undefined, timerSpent: 0 })
    startTimer(id, item.content, currentDate, null, 0)
  }, [updateItem, todoDay.items, startTimer, currentDate])

  const startCountDown = useCallback((id: string, minutes: number) => {
    setTimerMenuFor(null)
    const item = todoDay.items.find(i => i.id === id)
    if (!item) return

    const limitSeconds = minutes * 60
    // Update item and start timer immediately with the new limit
    updateItem(id, { timerLimit: limitSeconds, timerSpent: 0 })
    startTimer(id, item.content, currentDate, limitSeconds, 0)
  }, [updateItem, todoDay.items, startTimer, currentDate])

  // ── dnd-kit ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const items = todoDay.items
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reordered = arrayMove(items, oldIndex, newIndex)
    reorderItems(reordered.map((i) => i.id))
  }

  const activeItem = activeId ? todoDay.items.find((i) => i.id === activeId) : null

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newContent.trim()) {
      e.preventDefault()
      addItem(newContent)
      setNewContent('')
    }
  }

  const openEdit = (id: string, content: string) => {
    setEditingId(id)
    setEditText(content)
  }

  const confirmEdit = () => {
    if (!editingId) return
    if (editText.trim() && editText.trim() !== todoDay.items.find(i => i.id === editingId)?.content) {
      updateItem(editingId, { content: editText.trim() })
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  const handleCalendarSelect = (date: string) => {
    setDate(date)
    setShowCalendar(false)
  }

  const doneCount = todoDay.items.filter((i) => i.done).length
  const totalCount = todoDay.items.length
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0

  return (
    <div className="flex flex-col h-full" style={{ padding: '0 var(--container-padding)' }}>

      {/* ━━━ Date Navigator ━━━ */}
      <div className="flex-shrink-0 relative" style={{ zIndex: showCalendar ? 50 : 'auto', overflow: 'visible', marginTop: '14px' }}>
        <div className="flex items-center justify-between">
          <button
            onClick={goPrevDay}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ color: isDark ? '#71717a' : '#a1a1aa', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#7C4DFF'; e.currentTarget.style.background = 'rgba(124,77,255,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = isDark ? '#71717a' : '#a1a1aa'; e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
          >
            <ChevronLeft size={18} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setShowCalendar(!showCalendar) }}
            className="flex items-center gap-2.5 transition-all"
            style={{
              padding: '10px 18px',
              borderRadius: '14px',
              fontWeight: 600,
              fontSize: '14px',
              color: isDark ? '#e4e4e7' : '#27272a',
              background: showCalendar
                ? 'rgba(124,77,255,0.08)'
                : isDark ? 'rgba(39,39,42,0.6)' : 'rgba(255,255,255,0.8)',
              border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.6)',
              boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
            }}
            onMouseEnter={(e) => { if (!showCalendar) e.currentTarget.style.background = isDark ? 'rgba(39,39,42,0.8)' : 'rgba(255,255,255,0.95)' }}
            onMouseLeave={(e) => { if (!showCalendar) e.currentTarget.style.background = isDark ? 'rgba(39,39,42,0.6)' : 'rgba(255,255,255,0.8)' }}
          >
            <CalendarDays size={15} style={{ color: '#7C4DFF' }} />
            <span>{formatDateDisplay(currentDate)}</span>
            {isToday && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
                style={{ background: isDark ? 'rgba(124,77,255,0.15)' : 'rgba(124,77,255,0.1)', color: '#7C4DFF' }}
              >
                今天
              </span>
            )}
          </button>

          <button
            onClick={goNextDay}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ color: isDark ? '#71717a' : '#a1a1aa', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#7C4DFF'; e.currentTarget.style.background = 'rgba(124,77,255,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = isDark ? '#71717a' : '#a1a1aa'; e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div style={{ padding: '14px 0 0' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>进度</span>
              <span className="text-[11px] font-bold" style={{ color: '#7C4DFF' }}>{doneCount}/{totalCount}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: '#7C4DFF',
                  boxShadow: progress > 0 ? '0 0 8px rgba(124,77,255,0.3)' : 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* Calendar Picker */}
        {showCalendar && (
          <CalendarPicker
            selectedDate={currentDate}
            onSelect={handleCalendarSelect}
            onClose={() => setShowCalendar(false)}
          />
        )}
      </div>

      {/* ━━━ Add Task ━━━ */}
      <div className="flex-shrink-0" style={{ marginTop: '16px' }}>
        <div
          className="flex items-center gap-2 transition-all duration-200"
          style={{
            padding: '8px 8px 8px 6px',
            borderRadius: '16px',
            background: isDark
              ? (addFocused ? 'rgba(39,39,42,0.8)' : 'rgba(39,39,42,0.5)')
              : (addFocused ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.8)'),
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: addFocused
              ? '1px solid rgba(124,77,255,0.2)'
              : isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.6)',
            boxShadow: addFocused
              ? '0 4px 20px -4px rgba(124,77,255,0.12), 0 0 0 1px rgba(0,0,0,0.02)'
              : isDark ? '0 2px 8px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <input
            ref={inputRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={handleAddKeyDown}
            onFocus={() => setAddFocused(true)}
            onBlur={() => setAddFocused(false)}
            placeholder="添加新事项..."
            className="flex-1 px-3 py-2.5 text-[14px] bg-transparent focus:outline-none"
            style={{ color: isDark ? '#e4e4e7' : '#27272a', caretColor: '#7C4DFF' }}
          />
          <button
            onClick={() => { if (newContent.trim()) { addItem(newContent); setNewContent('') } }}
            disabled={!newContent.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
            style={newContent.trim()
              ? { background: '#7C4DFF', color: '#fff', boxShadow: '0 2px 8px rgba(124,77,255,0.3)' }
              : { background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', color: isDark ? '#52525b' : '#d4d4d8', cursor: 'not-allowed' }
            }
            onMouseEnter={(e) => { if (newContent.trim()) e.currentTarget.style.background = '#6B3FE4' }}
            onMouseLeave={(e) => { if (newContent.trim()) e.currentTarget.style.background = '#7C4DFF' }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ━━━ Todo List with Drag & Drop ━━━ */}
      <div className="flex-1 overflow-y-auto stagger" style={{ paddingTop: '10px', paddingBottom: '12px' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={todoDay.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {todoDay.items.map((item) => (
                <SortableTodoItem
                  key={item.id}
                  item={item}
                  isDark={isDark}
                  onToggle={() => {
                    // Stop timer if running when toggling done
                    let totalDuration = item.timerSpent || 0
                    if (activeTimerId === item.id) {
                      const { elapsed } = stopTimer()
                      totalDuration += elapsed
                      if (elapsed > 0) {
                        updateItem(item.id, { timerSpent: totalDuration })
                      }
                    }
                    // Save completed duration if task had timer
                    if (!item.done && totalDuration > 0) {
                      updateItem(item.id, { completedDuration: totalDuration })
                    }
                    toggleItem(item.id)
                  }}
                  onEdit={() => openEdit(item.id, item.content)}
                  onDelete={() => {
                    // Stop timer if running when deleting
                    if (activeTimerId === item.id) {
                      stopTimer()
                    }
                    deleteItem(item.id)
                  }}
                  onColorPicker={() => setColorPickerFor(colorPickerFor === item.id ? null : item.id)}
                  colorPickerOpen={colorPickerFor === item.id}
                  isTimerActive={activeTimerId === item.id}
                  timerSeconds={activeTimerId === item.id ? timerSeconds : undefined}
                  onTimerToggle={() => handleTimerToggle(item.id)}
                  onOpenTimerMenu={(e) => openTimerMenu(item.id, e)}
                  isTimerFinished={timerFinishedId === item.id}
                  showTimerSaved={timerSavedFlash?.id === item.id ? timerSavedFlash.seconds : undefined}
                />
              ))}
            </div>
          </SortableContext>

          {/* Drag Overlay — shows a floating copy of the dragged item */}
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <SortableTodoItem
                item={activeItem}
                isDark={isDark}
                isOverlay
                onToggle={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                onColorPicker={() => {}}
                colorPickerOpen={false}
                isTimerActive={activeTimerId === activeItem.id}
                timerSeconds={activeTimerId === activeItem.id ? timerSeconds : undefined}
                onTimerToggle={() => {}}
                onOpenTimerMenu={() => {}}
                isTimerFinished={false}
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Color Picker - Export Dialog Style */}
        {colorPickerFor && (
          <div
            className="flex flex-col gap-3 my-2 animate-scaleIn"
            style={{
              padding: '16px',
              borderRadius: '16px',
              background: isDark ? 'rgba(39,39,42,0.95)' : 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(12px)',
              border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.6)',
              boxShadow: isDark ? '0 4px 20px -4px rgba(0,0,0,0.2)' : '0 4px 20px -4px rgba(0,0,0,0.06)',
            }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>选择颜色</span>
            <div className="flex gap-2.5">
              {COLORS.map((color, i) => (
                <button
                  key={i}
                  onClick={() => { setItemColor(colorPickerFor, color); setColorPickerFor(null) }}
                  className="rounded-xl hover:scale-110 transition-all duration-150"
                  style={{
                    width: '28px', height: '28px',
                    backgroundColor: color || (isDark ? '#52525b' : '#d4d4d8'),
                    border: isDark ? '2px solid rgba(0,0,0,0.3)' : '2px solid rgba(255,255,255,0.9)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => setColorPickerFor(null)}
              className="text-[12px] mt-1"
              style={{ color: isDark ? '#71717a' : '#a1a1aa' }}
            >
              取消
            </button>
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && !loading && (
          <div className="flex flex-col items-center justify-center animate-fadeInUp" style={{ marginTop: '25%' }}>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: isDark ? 'rgba(124,77,255,0.1)' : 'rgba(124,77,255,0.06)' }}
            >
              <CheckSquare size={26} style={{ color: isDark ? 'rgba(124,77,255,0.5)' : 'rgba(124,77,255,0.4)' }} />
            </div>
            <p className="text-[13px] font-medium" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>
              {isToday ? '今日暂无事项' : '这天没有事项'}
            </p>
            <p className="text-[11px] mt-1" style={{ color: isDark ? '#52525b' : '#d4d4d8' }}>在上方输入框添加</p>
          </div>
        )}
      </div>

      {/* ━━━ Edit Modal Card ━━━ */}
      {editingId && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center animate-fadeIn"
          style={{ background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)' }}
          onClick={cancelEdit}
        >
          <div
            className="w-full animate-scaleIn"
            style={{
              maxWidth: '360px',
              margin: '0 20px',
              padding: '24px',
              borderRadius: '24px',
              background: isDark ? 'rgba(39,39,42,0.98)' : 'rgba(255,255,255,0.98)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: isDark ? '0 20px 60px -12px rgba(0,0,0,0.4)' : '0 20px 60px -12px rgba(0,0,0,0.12)',
              border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-semibold" style={{ color: isDark ? '#e4e4e7' : '#27272a' }}>
                编辑事项
              </span>
              <button
                onClick={cancelEdit}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{ color: isDark ? '#71717a' : '#a1a1aa', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}
              >
                <X size={14} />
              </button>
            </div>

            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit() }
                if (e.key === 'Escape') cancelEdit()
              }}
              className="w-full text-[14px] focus:outline-none resize-none leading-relaxed"
              style={{
                minHeight: '100px',
                maxHeight: '160px',
                padding: '14px 16px',
                borderRadius: '16px',
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(250,250,250,0.8)',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.04)',
                color: isDark ? '#e4e4e7' : '#27272a',
                caretColor: '#7C4DFF',
              }}
              placeholder="输入内容..."
            />

            <div className="flex items-center gap-3 mt-4">
              {/* Secondary: 取消 */}
              <button
                onClick={cancelEdit}
                className="flex-1 flex items-center justify-center text-[14px] font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
                style={{
                  height: '46px',
                  borderRadius: '14px',
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.1)',
                  color: isDark ? 'rgba(255,255,255,0.75)' : '#52525b',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'
                  e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#fff'
                  e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)'
                  e.currentTarget.style.transform = 'scale(0.98)'
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                取消
              </button>
              {/* Primary: 确定 */}
              <button
                onClick={confirmEdit}
                disabled={!editText.trim()}
                className="flex-1 flex items-center justify-center text-[14px] font-semibold text-white transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
                style={{
                  height: '46px',
                  borderRadius: '14px',
                  background: editText.trim()
                    ? 'linear-gradient(135deg, #7C4DFF 0%, #9575FF 100%)'
                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                  color: editText.trim() ? '#fff' : (isDark ? '#52525b' : '#a1a1aa'),
                  boxShadow: editText.trim() ? '0 4px 14px -2px rgba(124,77,255,0.35)' : 'none',
                  cursor: editText.trim() ? 'pointer' : 'not-allowed',
                  opacity: editText.trim() ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  if (editText.trim()) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)'
                    e.currentTarget.style.boxShadow = '0 6px 18px -2px rgba(124,77,255,0.45)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (editText.trim()) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #7C4DFF 0%, #9575FF 100%)'
                    e.currentTarget.style.boxShadow = '0 4px 14px -2px rgba(124,77,255,0.35)'
                  }
                }}
                onMouseDown={(e) => {
                  if (editText.trim()) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #6D3FE0 0%, #8B5CF6 100%)'
                    e.currentTarget.style.transform = 'scale(0.98)'
                  }
                }}
                onMouseUp={(e) => {
                  if (editText.trim()) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)'
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes timerRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes timerRipple {
          0% { opacity: 1; transform: scale(0.8); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        @keyframes timerUrgent {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes timerMenuIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes timerSavedFlash {
          0% { opacity: 0; transform: translateY(4px); }
          20% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes timerBreathGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(124,77,255,0.15), 0 2px 12px -2px rgba(124,77,255,0.1); }
          50% { box-shadow: 0 0 28px rgba(124,77,255,0.25), 0 2px 16px -2px rgba(124,77,255,0.15); }
        }
        @keyframes timerBreathBg {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* ━━━ Timer Menu - Xiaomi Clock Style ━━━ */}
      {timerMenuFor && createPortal(
        <TimerDialModal
          isDark={isDark}
          onClose={() => setTimerMenuFor(null)}
          onStartCountUp={() => startCountUp(timerMenuFor.id)}
          onStartCountDown={(minutes) => startCountDown(timerMenuFor.id, minutes)}
        />,
        document.body
      )}

    </div>
  )
}
