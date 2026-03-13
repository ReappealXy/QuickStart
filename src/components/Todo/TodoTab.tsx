import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { List, LayoutGrid, CalendarDays, Plus, ChevronLeft, ChevronRight, Monitor } from 'lucide-react'
import { useTodoStore, filterTodoItems } from '../../stores/todoStore'
import { useTimerStore, setTimerCallbacks, startGlobalTimerTick, stopGlobalTimerTick } from '../../stores/timerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import ListView from './ListView'
import QuadrantView from './QuadrantView'
import MonthCalendarView from './MonthCalendarView'
import TaskEditModal from './TaskEditModal'
import TimerDialModal from './TimerDialModal'
import FocusDonutWidget from './FocusDonutWidget'

/**
 * 将 Date 格式化为本地 YYYY-MM-DD，避免 toISOString 的 UTC 偏差
 * @param d Date 对象
 * @return YYYY-MM-DD
 */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 待办主容器：视图切换（列表/四象限/日历）+ 顶栏 + 新增/编辑弹窗 + 计时器 + 专注统计
 */
export default function TodoTab() {
  var viewMode = useTodoStore(s => s.viewMode)
  var setViewMode = useTodoStore(s => s.setViewMode)
  var filterDate = useTodoStore(s => s.filterDate)
  var setFilterDate = useTodoStore(s => s.setFilterDate)
  var loadItems = useTodoStore(s => s.loadItems)
  var addItem = useTodoStore(s => s.addItem)
  var updateItem = useTodoStore(s => s.updateItem)
  var storeItems = useTodoStore(s => s.items)
  var theme = useSettingsStore(s => s.theme)

  var isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'system' && typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  }, [theme])

  // 当前日期筛选后的任务（用于 FocusDonutWidget）
  var filteredItems = useMemo(() => filterTodoItems(storeItems, filterDate), [storeItems, filterDate])

  var [modalOpen, setModalOpen] = useState(false)
  var [editingItem, setEditingItem] = useState<TodoItem | null>(null)
  var [timerModalOpen, setTimerModalOpen] = useState(false)
  var [timerTargetItem, setTimerTargetItem] = useState<TodoItem | null>(null)

  // 计时器完成弹窗
  var timerFinishedModal = useTimerStore(s => s.timerFinishedModal)

  useEffect(() => { loadItems() }, [loadItems])

  // 注册全局计时器 tick 回调（空依赖，通过 getState 获取最新函数避免无限循环）
  var timerCallbacksRegistered = useRef(false)
  useEffect(() => {
    if (timerCallbacksRegistered.current) return
    timerCallbacksRegistered.current = true
    setTimerCallbacks({
      onTick: () => {},
      onFinished: (taskName, duration) => {
        useTimerStore.getState().setTimerFinishedModal({ taskName, duration })
      },
      onUpdateTask: (taskId, _taskDate, updates) => {
        useTodoStore.getState().updateItem(taskId, updates)
      },
    })
    startGlobalTimerTick()
    return () => { stopGlobalTimerTick(); timerCallbacksRegistered.current = false }
  }, [])

  var doneCount = storeItems.filter(i => i.done).length
  var totalCount = storeItems.length
  var progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  /** @param data 保存（新增或编辑） */
  var handleSave = async (data: { id?: string; title: string; description: string; color: string | null; quadrant: Quadrant | null; startDate: string; endDate: string | null }) => {
    if (data.id) {
      await updateItem(data.id, {
        title: data.title,
        description: data.description,
        color: data.color,
        quadrant: data.quadrant,
        startDate: data.startDate,
        endDate: data.endDate,
      })
    } else {
      await addItem({
        title: data.title,
        description: data.description,
        color: data.color,
        quadrant: data.quadrant,
        startDate: data.startDate,
        endDate: data.endDate,
      })
    }
    setModalOpen(false)
    setEditingItem(null)
  }

  var handleEdit = (item: TodoItem) => {
    setEditingItem(item)
    setModalOpen(true)
  }

  var handleAdd = () => {
    setEditingItem(null)
    setModalOpen(true)
  }

  /**
   * 从 ListView 点击计时器按钮时打开 TimerDialModal
   * @param item 目标任务
   */
  var handleTimerStart = useCallback((item: TodoItem) => {
    setTimerTargetItem(item)
    setTimerModalOpen(true)
  }, [])

  var handleStartCountUp = useCallback(() => {
    if (!timerTargetItem) return
    var startTimer = useTimerStore.getState().startTimer
    startTimer(timerTargetItem.id, timerTargetItem.title, toLocalDateStr(new Date()), null, timerTargetItem.timerSpent || 0)
  }, [timerTargetItem])

  var handleStartCountDown = useCallback((minutes: number) => {
    if (!timerTargetItem) return
    var totalSeconds = minutes * 60
    var startTimer = useTimerStore.getState().startTimer
    updateItem(timerTargetItem.id, { timerLimit: totalSeconds })
    startTimer(timerTargetItem.id, timerTargetItem.title, toLocalDateStr(new Date()), totalSeconds, timerTargetItem.timerSpent || 0)
  }, [timerTargetItem, updateItem])

  // 日期切换（使用本地日期，避免 UTC 偏差）
  var prevDay = () => {
    if (!filterDate) return
    var d = new Date(filterDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    setFilterDate(toLocalDateStr(d))
  }
  var nextDay = () => {
    if (!filterDate) return
    var d = new Date(filterDate + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    setFilterDate(toLocalDateStr(d))
  }
  var goToday = () => {
    setFilterDate(toLocalDateStr(new Date()))
  }

  /** 从日历点击日期 → 切换到列表视图并筛选该天 */
  var handleCalendarSelectDate = (date: string) => {
    setFilterDate(date)
    setViewMode('list')
  }

  var VIEW_BTNS: { mode: typeof viewMode; icon: typeof List; tip: string }[] = [
    { mode: 'list', icon: List, tip: '列表' },
    { mode: 'quadrant', icon: LayoutGrid, tip: '四象限' },
    { mode: 'calendar', icon: CalendarDays, tip: '日历' },
  ]

  var handleOpenFloat = async () => {
    if (window.api?.floating?.create) await window.api.floating.create()
  }

  /**
   * 秒数转可读格式
   * @param sec 秒数
   * @return "Xm Ys"
   */
  var formatFinishDuration = (sec: number): string => {
    var m = Math.floor(sec / 60)
    var s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

          return (
    <div className="h-full flex flex-col" style={{ padding: '0 var(--container-padding)' }}>
      {/* 顶栏 */}
      <div className="flex items-center justify-between flex-shrink-0" style={{ padding: '10px 0 6px' }}>
        <div className="flex items-center gap-1">
          {/* 视图切换 */}
          {VIEW_BTNS.map(v => {
            var Icon = v.icon
            var isActive = viewMode === v.mode
          return (
      <button
                key={v.mode}
                title={v.tip}
                onClick={() => setViewMode(v.mode)}
        style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
                  color: isActive ? '#fff' : '#a1a1aa',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={14} />
      </button>
            )
          })}
          {/* 桌面便签 */}
          <button
            title="桌面便签"
            onClick={handleOpenFloat}
        style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: '#a1a1aa',
              transition: 'all 0.15s',
              marginLeft: '2px',
            }}
          >
            <Monitor size={14} />
        </button>
          {/* 专注统计饼图 */}
          {viewMode !== 'calendar' && (
            <FocusDonutWidget items={filteredItems} isDark={isDark} />
          )}
        </div>

        {/* 日期导航（列表/四象限视图显示） */}
        {viewMode !== 'calendar' && (
          <div className="flex items-center gap-1">
            <button onClick={prevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px' }}>
              <ChevronLeft size={14} />
              </button>
          <button
              onClick={goToday}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(255,255,255,0.7)',
                color: '#52525b',
                cursor: 'pointer',
              }}
            >
              {filterDate || '全部'}
              </button>
            <button onClick={nextDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px' }}>
              <ChevronRight size={14} />
              </button>
            </div>
          )}

        {/* 添加 + 进度 */}
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#a1a1aa' }}>
              {doneCount}/{totalCount}
                </span>
          )}
          <button
            onClick={handleAdd}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              boxShadow: '0 2px 6px rgba(102,126,234,0.3)',
            }}
          >
            <Plus size={14} />
          </button>
        </div>
            </div>

      {/* 进度条 */}
      {totalCount > 0 && viewMode !== 'calendar' && (
        <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(0,0,0,0.04)', marginBottom: '6px', flexShrink: 0 }}>
          <div style={{
            height: '100%',
                      borderRadius: '2px',
            background: 'linear-gradient(90deg, #667eea, #764ba2)',
            width: `${progress}%`,
            transition: 'width 0.3s ease',
          }} />
          </div>
        )}

      {/* 视图内容 */}
      {viewMode === 'list' && <ListView onEdit={handleEdit} onTimerStart={handleTimerStart} />}
      {viewMode === 'quadrant' && <QuadrantView onEdit={handleEdit} />}
      {viewMode === 'calendar' && <MonthCalendarView onSelectDate={handleCalendarSelectDate} />}

      {/* 编辑弹窗 */}
      {modalOpen && (
        <TaskEditModal
          item={editingItem}
          defaultDate={filterDate}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingItem(null) }}
        />
      )}

      {/* 计时器弹窗 */}
      {timerModalOpen && (
        <TimerDialModal
          isDark={isDark}
          onClose={() => { setTimerModalOpen(false); setTimerTargetItem(null) }}
          onStartCountUp={handleStartCountUp}
          onStartCountDown={handleStartCountDown}
        />
      )}

      {/* 计时完成通知 */}
      {timerFinishedModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)' }}
          onClick={() => useTimerStore.getState().setTimerFinishedModal(null)}
        >
          <div
            className="flex flex-col items-center"
            style={{
              padding: '32px 40px',
              borderRadius: '24px',
              background: isDark ? 'rgba(30,30,35,0.95)' : 'rgba(255,255,255,0.95)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              animation: 'timerFinishIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: isDark ? '#f4f4f5' : '#1a1a1a', marginBottom: '6px' }}>
              计时完成！
          </div>
            <div style={{ fontSize: '13px', color: isDark ? '#a1a1aa' : '#71717a', marginBottom: '4px' }}>
              「{timerFinishedModal.taskName}」
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
              {formatFinishDuration(timerFinishedModal.duration)}
          </div>
              <button
              onClick={() => useTimerStore.getState().setTimerFinishedModal(null)}
              style={{
                marginTop: '20px',
                padding: '8px 32px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              好的
              </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes timerFinishIn {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
