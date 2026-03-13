import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Check, Calendar, Clock, Pause, Play, Square, Timer, RotateCcw, X, Trash2 } from 'lucide-react'
import { useTodoStore, filterTodoItems } from '../../stores/todoStore'
import { useTimerStore } from '../../stores/timerStore'

/**
 * 本地日期字符串
 * @param d Date
 * @return YYYY-MM-DD
 */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 秒数转可读时长
 * @param sec 秒数
 * @return "Xh Ym Zs" 格式
 */
function formatDuration(sec: number): string {
  if (sec <= 0) return '0s'
  var h = Math.floor(sec / 3600)
  var m = Math.floor((sec % 3600) / 60)
  var s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * 秒数转 mm:ss 格式
 * @param sec 秒数
 * @return mm:ss
 */
function formatTimerDisplay(sec: number): string {
  var m = Math.floor(Math.abs(sec) / 60)
  var s = Math.abs(sec) % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

var QUADRANT_DOTS: Record<string, string> = {
  'urgent-important': '#ef4444',
  'important': '#f97316',
  'urgent': '#3b82f6',
  'normal': '#22c55e',
}

interface UndoToast {
  item: TodoItem
  timer: ReturnType<typeof setTimeout>
  remaining: number
  intervalId: ReturnType<typeof setInterval>
}

interface ListViewProps {
  onEdit: (item: TodoItem) => void
  onTimerStart: (item: TodoItem) => void
}

/**
 * 增强版列表视图，支持 DnD、四象限标签、日期范围、完整计时器 UI
 * @param props.onEdit 点击编辑的回调
 * @param props.onTimerStart 打开计时器弹窗的回调
 */
export default function ListView({ onEdit, onTimerStart }: ListViewProps) {
  var storeItems = useTodoStore(s => s.items)
  var filterDate = useTodoStore(s => s.filterDate)
  var items = useMemo(() => filterTodoItems(storeItems, filterDate), [storeItems, filterDate])
  var toggleItem = useTodoStore(s => s.toggleItem)
  var reorderItems = useTodoStore(s => s.reorderItems)
  var updateItem = useTodoStore(s => s.updateItem)
  var activeTimerId = useTimerStore(s => s.activeTimerId)
  var timerLimit = useTimerStore(s => s.timerLimit)
  var startTimer = useTimerStore(s => s.startTimer)
  var stopTimer = useTimerStore(s => s.stopTimer)
  var timerFinishedId = useTimerStore(s => s.timerFinishedId)
  var [activeId, setActiveId] = useState<string | null>(null)
  var [tick, setTick] = useState(0)
  var [undoToast, setUndoToast] = useState<UndoToast | null>(null)

  /**
   * 软删除：先从 UI 移除，30s 后再真正删除；期间可撤销
   * @param item 要删除的任务
   */
  var handleDelete = useCallback((item: TodoItem) => {
    if (undoToast) {
      clearTimeout(undoToast.timer)
      clearInterval(undoToast.intervalId)
      window.api.todos.delete(undoToast.item.id)
    }
    useTodoStore.setState(state => ({ items: state.items.filter(i => i.id !== item.id) }))
    var remaining = 30
    var intervalId = setInterval(() => {
      remaining -= 1
      setUndoToast(prev => prev ? { ...prev, remaining } : null)
    }, 1000)
    var timer = setTimeout(async () => {
      clearInterval(intervalId)
      await window.api.todos.delete(item.id)
      setUndoToast(null)
    }, 30000)
    setUndoToast({ item, timer, remaining, intervalId })
  }, [undoToast])

  /** 撤销删除：恢复任务到列表 */
  var handleUndo = useCallback(() => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    useTodoStore.setState(state => ({
      items: [...state.items, undoToast.item].sort((a, b) => a.order - b.order),
    }))
    setUndoToast(null)
  }, [undoToast])

  /** 立即永久删除（关闭 Toast） */
  var handleForceDelete = useCallback(async () => {
    if (!undoToast) return
    clearTimeout(undoToast.timer)
    clearInterval(undoToast.intervalId)
    await window.api.todos.delete(undoToast.item.id)
    setUndoToast(null)
  }, [undoToast])

  // 每秒刷新一次以更新计时器显示
  useEffect(() => {
    if (!activeTimerId) return
    var interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [activeTimerId])

  /**
   * 暂停当前计时（保留已计时长，不清零）
   * @param item 当前任务
   */
  var handlePause = useCallback((item: TodoItem) => {
    if (activeTimerId !== item.id) return
    var result = stopTimer()
    if (result.taskId) {
      updateItem(result.taskId, {
        timerSpent: (item.timerSpent || 0) + result.elapsed,
      })
    }
  }, [activeTimerId, stopTimer, updateItem])

  /**
   * 继续计时（从已暂停的时长恢复）
   * @param item 当前任务
   */
  var handleResume = useCallback((item: TodoItem) => {
    if (activeTimerId) {
      var prev = stopTimer()
      if (prev.taskId) {
        var old = storeItems.find(i => i.id === prev.taskId)
        if (old) {
          updateItem(prev.taskId, {
            timerSpent: (old.timerSpent || 0) + prev.elapsed,
          })
        }
      }
    }
    startTimer(item.id, item.title, toLocalDateStr(new Date()), item.timerLimit || null, item.timerSpent || 0)
  }, [activeTimerId, startTimer, stopTimer, updateItem, storeItems])

  /**
   * 结束计时（保存总时长到 completedDuration）
   * @param item 当前任务
   */
  var handleEnd = useCallback((item: TodoItem) => {
    var elapsed = 0
    if (activeTimerId === item.id) {
      var result = stopTimer()
      elapsed = result.elapsed
    }
    var totalSpent = (item.timerSpent || 0) + elapsed
    updateItem(item.id, {
      timerSpent: 0,
      completedDuration: (item.completedDuration || 0) + totalSpent,
    })
  }, [activeTimerId, stopTimer, updateItem])

  /**
   * 重置已暂停的计时
   * @param item 当前任务
   */
  var handleResetPaused = useCallback((item: TodoItem) => {
    updateItem(item.id, { timerSpent: 0 })
  }, [updateItem])

  var sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  var handleDragStart = useCallback((e: DragStartEvent) => { setActiveId(e.active.id as string) }, [])

  var handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    var { active, over } = e
    if (!over || active.id === over.id) return
    var pendingItems = items.filter(i => !i.done)
    var oldIdx = pendingItems.findIndex(i => i.id === active.id)
    var newIdx = pendingItems.findIndex(i => i.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    var reordered = arrayMove(pendingItems, oldIdx, newIdx)
    var doneItems = items.filter(i => i.done)
    reorderItems([...reordered, ...doneItems].map(i => i.id))
  }, [items, reorderItems])

  var pendingItems = items.filter(i => !i.done)
  var doneItems = items.filter(i => i.done)
  var activeItem = activeId ? items.find(i => i.id === activeId) : null

  // 计算当前活动计时器的已用时间
  var getElapsedNow = useCallback(() => {
    var state = useTimerStore.getState()
    if (!state.startedAt) return state.timerSpent
    return state.timerSpent + Math.floor((Date.now() - state.startedAt) / 1000)
  }, [])

  var getRemainingNow = useCallback(() => {
    var state = useTimerStore.getState()
    if (!state.endAt) return 0
    return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000))
  }, [])

  return (
    <div className="flex-1 min-h-0 relative">
      <div className="h-full overflow-y-auto" style={{ padding: '0 0 8px' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={pendingItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {pendingItems.map(item => (
              <SortableTaskRow
                key={item.id}
                item={item}
                onToggle={() => toggleItem(item.id)}
                onEdit={() => onEdit(item)}
                onDelete={() => handleDelete(item)}
                isTimerActive={activeTimerId === item.id}
                isPaused={(item.timerSpent || 0) > 0 && activeTimerId !== item.id}
                isFinished={timerFinishedId === item.id}
                timerLimit={activeTimerId === item.id ? timerLimit : null}
                getElapsedNow={getElapsedNow}
                getRemainingNow={getRemainingNow}
                onPause={() => handlePause(item)}
                onResume={() => handleResume(item)}
                onEnd={() => handleEnd(item)}
                onResetPaused={() => handleResetPaused(item)}
                onTimerStart={() => onTimerStart(item)}
                tick={tick}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeItem && <TaskRow item={activeItem} isDragOverlay tick={tick} />}
          </DragOverlay>
        </DndContext>

        {doneItems.length > 0 && (
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: '6px' }}>
            <p style={{ fontSize: '10px', fontWeight: 600, color: '#a1a1aa', padding: '0 4px 4px', letterSpacing: '0.05em' }}>
              已完成 ({doneItems.length})
            </p>
            {doneItems.map(item => (
              <TaskRow key={item.id} item={item} onToggle={() => toggleItem(item.id)} onEdit={() => onEdit(item)} onDelete={() => handleDelete(item)} tick={tick} />
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#a1a1aa', fontSize: '13px' }}>
            暂无任务，点击 + 添加
          </div>
        )}
      </div>

      {/* ====== Undo Delete Toast ====== */}
      {undoToast && (
        <div
          className="absolute"
          style={{
            left: '50%',
            bottom: 16,
            transform: 'translateX(-50%)',
            width: 'min(420px, calc(100% - 24px))',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 16,
            border: '1px solid rgba(196,181,253,0.5)',
            boxShadow: '0 8px 32px rgba(139,92,246,0.15), 0 2px 8px rgba(139,92,246,0.08)',
            padding: '14px 16px 12px',
            overflow: 'hidden',
            animation: 'undoSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
            zIndex: 1000,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <Trash2 size={14} className="text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-700 font-medium">已移除任务</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                「{undoToast.item.title.slice(0, 20)}{undoToast.item.title.length > 20 ? '...' : ''}」 · {undoToast.remaining}s 后永久删除
              </p>
            </div>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-violet-500 cursor-pointer transition-all hover:text-violet-400"
            >
              <RotateCcw size={12} /> 撤销
            </button>
            <button
              onClick={handleForceDelete}
              className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 cursor-pointer transition-colors hover:text-violet-600 hover:bg-violet-500/10"
            >
              <X size={14} />
            </button>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: 2,
              borderRadius: '0 2px 2px 0',
              background: 'linear-gradient(90deg, #a78bfa, #e879f9)',
              width: `${(undoToast.remaining / 30) * 100}%`,
              transition: 'width 1s linear',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes timerBreath {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes timerRipple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes timerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,77,255,0.3); }
          50% { box-shadow: 0 0 0 4px rgba(124,77,255,0.08); }
        }
        @keyframes undoSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

/* ── 可拖拽任务行 ── */
interface SortableTaskRowProps {
  item: TodoItem
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  isTimerActive?: boolean
  isPaused?: boolean
  isFinished?: boolean
  timerLimit?: number | null
  getElapsedNow?: () => number
  getRemainingNow?: () => number
  onPause?: () => void
  onResume?: () => void
  onEnd?: () => void
  onResetPaused?: () => void
  onTimerStart?: () => void
  tick: number
}

function SortableTaskRow(props: SortableTaskRowProps) {
  var { item, ...rest } = props
  var { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: item.done })
  var style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskRow item={item} dragListeners={listeners} {...rest} />
    </div>
  )
}

/* ── 单行任务（含完整计时器 UI）── */
interface TaskRowProps {
  item: TodoItem
  dragListeners?: Record<string, unknown>
  onToggle?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isDragOverlay?: boolean
  isTimerActive?: boolean
  isPaused?: boolean
  isFinished?: boolean
  timerLimit?: number | null
  getElapsedNow?: () => number
  getRemainingNow?: () => number
  onPause?: () => void
  onResume?: () => void
  onEnd?: () => void
  onResetPaused?: () => void
  onTimerStart?: () => void
  tick: number
}

function TaskRow({
  item, dragListeners, onToggle, onEdit, onDelete, isDragOverlay,
  isTimerActive, isPaused, isFinished,
  timerLimit, getElapsedNow, getRemainingNow,
  onPause, onResume, onEnd, onResetPaused, onTimerStart,
  tick,
}: TaskRowProps) {
  var [hovered, setHovered] = useState(false)
  var qDot = item.quadrant ? QUADRANT_DOTS[item.quadrant] : null
  var hasDateRange = item.endDate && item.endDate !== item.startDate
  var hasFocusDone = (item.completedDuration || 0) > 0

  // 计时进度（用于 SVG 环）
  var timerProgress = 0
  var timerDisplayText = ''
  var isCountdown = false

  if (isTimerActive && getElapsedNow && getRemainingNow) {
    var elapsed = getElapsedNow()
    var remaining = getRemainingNow()
    isCountdown = (timerLimit || 0) > 0

    if (isCountdown && timerLimit) {
      timerProgress = Math.min(1, elapsed / timerLimit)
      timerDisplayText = formatTimerDisplay(remaining)
    } else {
      // 正计时：60分钟一圈
      timerProgress = (elapsed % 3600) / 3600
      timerDisplayText = formatTimerDisplay(elapsed)
    }
  }

  // 复位 tick 引用以避免 TS 未使用警告
  void tick

  return (
    <div
      className="glass"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '12px',
        marginBottom: '4px',
        cursor: 'pointer',
        transition: isDragOverlay ? 'none' : 'all 0.15s',
        borderLeft: item.color ? `3px solid ${item.color}` : '3px solid transparent',
        opacity: item.done ? 0.55 : 1,
        boxShadow: isDragOverlay
          ? '0 8px 24px rgba(0,0,0,0.12)'
          : isTimerActive
            ? '0 0 0 1.5px rgba(124,77,255,0.25), 0 2px 12px rgba(124,77,255,0.08)'
            : isFinished
              ? '0 0 0 2px rgba(34,197,94,0.3)'
              : undefined,
        animation: isFinished ? 'timerPulse 0.6s ease-out' : undefined,
        position: 'relative',
        overflow: 'visible',
      }}
      onClick={onEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 完成涟漪效果 */}
      {isFinished && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '30px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'rgba(34,197,94,0.3)',
          transform: 'translate(-50%, -50%)',
          animation: 'timerRipple 1s ease-out forwards',
          pointerEvents: 'none',
        }} />
      )}

      {/* 拖拽手柄 */}
      {!item.done && dragListeners && (
        <div
          {...dragListeners}
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: '16px', height: '20px', color: '#d4d4d8', cursor: 'grab', marginTop: '1px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={12} />
        </div>
      )}

      {/* 勾选框 + 计时环 */}
      <div className="relative flex-shrink-0" style={{ width: '22px', height: '22px', marginTop: '0px' }}>
        {/* 计时器进度环 SVG */}
        {isTimerActive && (
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: 'rotate(-90deg)',
              animation: 'timerBreath 2s ease-in-out infinite',
            }}
          >
            <circle cx="11" cy="11" r="9.5" fill="none" stroke="rgba(124,77,255,0.12)" strokeWidth="2" />
            <circle
              cx="11"
              cy="11"
              r="9.5"
              fill="none"
              stroke="url(#timerRingGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${timerProgress * 59.7} 59.7`}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
            <defs>
              <linearGradient id="timerRingGrad" x1="0" y1="0" x2="22" y2="0">
                <stop offset="0%" stopColor="#7C4DFF" />
                <stop offset="100%" stopColor="#A78BFA" />
              </linearGradient>
            </defs>
          </svg>
        )}
        {/* 已暂停的计时环（静态灰环） */}
        {isPaused && !isTimerActive && (
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
          >
            <circle cx="11" cy="11" r="9.5" fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="2" />
            <circle
              cx="11"
              cy="11"
              r="9.5"
              fill="none"
              stroke="rgba(245,158,11,0.5)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="5 4"
            />
          </svg>
        )}
        {/* 勾选框本体 */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.() }}
          className="flex items-center justify-center"
          style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            width: '18px',
            height: '18px',
            borderRadius: '6px',
            border: item.done ? 'none' : '1.5px solid #d4d4d8',
            background: item.done ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {item.done && <Check size={11} style={{ color: '#fff' }} />}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {qDot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: qDot, flexShrink: 0 }} />}
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            color: item.done ? '#a1a1aa' : '#1a1a1a',
            textDecoration: item.done ? 'line-through' : 'none',
            lineHeight: '1.4',
          }}>
            {item.title || ''}
          </span>
        </div>

        {/* 计时器实时显示 */}
        {isTimerActive && (
          <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '11px', color: '#7C4DFF', fontWeight: 600 }}>
            <Timer size={10} style={{ animation: 'timerBreath 2s ease-in-out infinite' }} />
            <span className="tabular-nums">{timerDisplayText}</span>
            <span style={{ fontSize: '9px', color: '#a78bfa', fontWeight: 500 }}>
              {isCountdown ? '倒计时' : '正计时'}
            </span>
          </div>
        )}

        {/* 已暂停标记 */}
        {isPaused && !isTimerActive && (
          <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
            <Pause size={9} />
            <span>已暂停 · {formatDuration(item.timerSpent || 0)}</span>
          </div>
        )}

        {/* 日期信息 */}
        {(item.startDate || hasDateRange) && !isTimerActive && !isPaused && (
          <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '10px', color: '#a1a1aa' }}>
            <Calendar size={9} />
            <span>{item.startDate}{hasDateRange ? ` → ${item.endDate}` : ''}</span>
          </div>
        )}

        {/* 专注完成标记 */}
        {hasFocusDone && !isTimerActive && (
          <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600 }}>
            <Clock size={9} />
            <span>专注 {formatDuration(item.completedDuration || 0)}</span>
          </div>
        )}
      </div>

      {/* 右侧控制区域 */}
      <div className="flex items-center gap-1 flex-shrink-0" style={{ marginTop: '0px' }} onClick={(e) => e.stopPropagation()}>
        {/* 计时器运行中：暂停/结束 药丸 */}
        {isTimerActive && (
          <div
            className="flex items-center overflow-hidden"
            style={{
              borderRadius: '10px',
              background: 'rgba(124,77,255,0.08)',
              border: '1px solid rgba(124,77,255,0.15)',
            }}
          >
            <button
              onClick={onPause}
              title="暂停"
              style={{
                width: '26px',
                height: '24px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                color: '#f59e0b',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Pause size={10} />
            </button>
            <div style={{ width: '1px', height: '14px', background: 'rgba(124,77,255,0.12)' }} />
            <button
              onClick={onEnd}
              title="结束计时"
              style={{
                width: '26px',
                height: '24px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                color: '#ef4444',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Square size={9} />
            </button>
          </div>
        )}

        {/* 已暂停：继续/结束/重置 */}
        {isPaused && !isTimerActive && (
          <div
            className="flex items-center overflow-hidden"
            style={{
              borderRadius: '10px',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.15)',
            }}
          >
            <button
              onClick={onResume}
              title="继续计时"
              style={{
                width: '26px',
                height: '24px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                color: '#22c55e',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Play size={10} />
            </button>
            <div style={{ width: '1px', height: '14px', background: 'rgba(245,158,11,0.1)' }} />
            <button
              onClick={onEnd}
              title="结束计时"
              style={{
                width: '26px',
                height: '24px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                color: '#ef4444',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Square size={9} />
            </button>
            <div style={{ width: '1px', height: '14px', background: 'rgba(245,158,11,0.1)' }} />
            <button
              onClick={onResetPaused}
              title="重置计时"
              style={{
                width: '26px',
                height: '24px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                color: '#a1a1aa',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <RotateCcw size={9} />
            </button>
          </div>
        )}

        {/* 空闲状态：计时入口按钮（hover 时显示） */}
        {!item.done && !isTimerActive && !isPaused && hovered && onTimerStart && (
          <button
            onClick={onTimerStart}
            title="开始计时"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(124,77,255,0.08)',
              color: '#7C4DFF',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,77,255,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(124,77,255,0.08)' }}
          >
            <Timer size={12} />
          </button>
        )}

        {/* 删除按钮 */}
        {onDelete && hovered && !isTimerActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex items-center justify-center flex-shrink-0 cursor-pointer"
            style={{
              background: 'none',
              border: 'none',
              width: '20px',
              height: '20px',
              borderRadius: '6px',
              color: '#d4d4d8',
              padding: 0,
              marginTop: '1px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#d4d4d8'; e.currentTarget.style.background = 'none' }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
