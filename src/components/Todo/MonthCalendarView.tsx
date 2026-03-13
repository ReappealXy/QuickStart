import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTodoStore } from '../../stores/todoStore'
// @ts-ignore
import _lunarLib from 'lunar-javascript'
// CJS 包在 Rollup 构建时 default 是整个 module.exports 对象
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var Solar: any = (_lunarLib as any)?.Solar ?? (_lunarLib as any)?.default?.Solar ?? _lunarLib

var WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

var TASK_PALETTE = [
  '#ef4444', '#22c55e', '#3b82f6', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#eab308', '#14b8a6', '#e11d48',
]

// ── 节假日缓存（模块级，避免重复请求） ────────────────────────
var _holidayCache = new Map<number, Map<string, { name: string; isOffDay: boolean }>>()
var _holidayFetching = new Set<number>()

/**
 * 懒加载指定年份节假日数据
 * @param year 年份
 * @return 日期→节假日信息的 Map
 */
async function fetchHolidays(year: number): Promise<Map<string, { name: string; isOffDay: boolean }>> {
  if (_holidayCache.has(year)) return _holidayCache.get(year)!
  if (_holidayFetching.has(year)) {
    return new Map()
  }
  _holidayFetching.add(year)
  try {
    var resp = await fetch(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`)
    if (!resp.ok) throw new Error('fetch failed')
    var data = await resp.json()
    var m = new Map<string, { name: string; isOffDay: boolean }>()
    ;(data.days || []).forEach((d: { date: string; name: string; isOffDay: boolean }) => {
      m.set(d.date, { name: d.name, isOffDay: d.isOffDay })
    })
    _holidayCache.set(year, m)
    return m
  } catch {
    var empty = new Map<string, { name: string; isOffDay: boolean }>()
    _holidayCache.set(year, empty)
    return empty
  } finally {
    _holidayFetching.delete(year)
  }
}

// ── 农历/节气信息 ────────────────────────────────────────────

interface LunarInfo {
  label: string
  type: 'day' | 'monthFirst' | 'term' | 'festival'
}

/**
 * 获取指定公历日期的农历/节气信息
 * @param y 年
 * @param m 月（1-based）
 * @param d 日
 */
function getLunarInfo(y: number, m: number, d: number): LunarInfo {
  try {
    var lunar = Solar.fromYmd(y, m, d).getLunar()

    // 节气优先
    var jq: string = ''
    try { jq = lunar.getJieQi() || '' } catch { /* ignore */ }
    if (jq) return { label: jq, type: 'term' }

    // 传统节日
    var festivals: string[] = []
    try { festivals = lunar.getFestivals() || [] } catch { /* ignore */ }
    if (festivals.length > 0) return { label: festivals[0], type: 'festival' }

    // 农历初一显示月份
    var dayNum: number = lunar.getDay()
    if (dayNum === 1) return { label: lunar.getMonthInChinese() + '月', type: 'monthFirst' }

    return { label: lunar.getDayInChinese(), type: 'day' }
  } catch {
    return { label: '', type: 'day' }
  }
}

// ── 颜色工具 ─────────────────────────────────────────────────

/**
 * 根据任务 ID 生成稳定颜色
 * @param id 任务 ID
 * @param customColor 自定义颜色
 */
function getTaskColor(id: string, customColor: string | null): string {
  if (customColor) return customColor
  var hash = 0
  id.split('').forEach(c => { hash = ((hash << 5) - hash) + c.charCodeAt(0); hash |= 0 })
  return TASK_PALETTE[Math.abs(hash) % TASK_PALETTE.length]
}

// ── 布局常量 ──────────────────────────────────────────────────
var DATE_H = 46    // 日期区域固定高度（含日期数字 + 农历）
var LANE_GAP = 22  // 每条任务行的间距
var BAR_H = 17     // 任务色条高度
var BORDER = 'rgba(0,0,0,0.06)'

// ── 主组件 ───────────────────────────────────────────────────

/**
 * 日历月视图 — 上下分层：日期区 / 任务色条区，彻底消除重叠
 * @param props.onSelectDate 点击日期回调
 */
export default function MonthCalendarView({ onSelectDate }: { onSelectDate?: (date: string) => void }) {
  var allItems = useTodoStore(s => s.items)
  var [year, setYear] = useState(() => new Date().getFullYear())
  var [month, setMonth] = useState(() => new Date().getMonth())
  var [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  var [holidays, setHolidays] = useState<Map<string, { name: string; isOffDay: boolean }>>(new Map())
  var [cellPopup, setCellPopup] = useState<{ date: string; x: number; y: number } | null>(null)
  var cellHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  var todayStr = useMemo(() => {
    var d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // 加载节假日（当月及相邻月份可能跨年时同时加载）
  useEffect(() => {
    var years = new Set([year])
    if (month === 0) years.add(year - 1)
    if (month === 11) years.add(year + 1)

    var cancelled = false
    Promise.all([...years].map(y => fetchHolidays(y))).then(maps => {
      if (cancelled) return
      var merged = new Map<string, { name: string; isOffDay: boolean }>()
      maps.forEach(m => m.forEach((v, k) => merged.set(k, v)))
      setHolidays(merged)
    })
    return () => { cancelled = true }
  }, [year, month])

  /** 获取某天涵盖的全部任务（用于 hover 弹出） */
  var getTasksForDate = useCallback((date: string) =>
    allItems.filter(t => {
      var s = t.startDate || ''
      var e = t.endDate || s
      return s <= date && e >= date
    }),
  [allItems])

  var handleCellMouseEnter = useCallback((date: string, e: React.MouseEvent) => {
    var rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    cellHoverTimer.current = setTimeout(() => {
      setCellPopup({ date, x: rect.left + rect.width / 2, y: rect.bottom + 6 })
    }, 400)
  }, [])

  var handleCellMouseLeave = useCallback(() => {
    if (cellHoverTimer.current) clearTimeout(cellHoverTimer.current)
    setCellPopup(null)
  }, [])

  var goPrev = () => {
    if (month === 0) { setYear(year - 1); setMonth(11) }
    else setMonth(month - 1)
  }
  var goNext = () => {
    if (month === 11) { setYear(year + 1); setMonth(0) }
    else setMonth(month + 1)
  }
  var goToday = () => { var now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()) }

  // ── 生成日历单元格 ────────────────────────────────────────
  var calendarDays = useMemo(() => {
    var firstDay = new Date(year, month, 1)
    var startPad = (firstDay.getDay() + 6) % 7
    var daysInMonth = new Date(year, month + 1, 0).getDate()
    var cells: { date: string; day: number; isCurrentMonth: boolean }[] = []

    var prevDays = new Date(year, month, 0).getDate()
    var py = month === 0 ? year - 1 : year
    var pm = month === 0 ? 12 : month
    Array.from({ length: startPad }).forEach((_, i) => {
      var d = prevDays - startPad + 1 + i
      cells.push({ date: `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, isCurrentMonth: false })
    })

    var ym = `${year}-${String(month + 1).padStart(2, '0')}`
    Array.from({ length: daysInMonth }).forEach((_, i) => {
      cells.push({ date: `${ym}-${String(i + 1).padStart(2, '0')}`, day: i + 1, isCurrentMonth: true })
    })

    var remain = (7 - (cells.length % 7)) % 7
    var ny = month === 11 ? year + 1 : year
    var nm = month === 11 ? 1 : month + 2
    Array.from({ length: remain }).forEach((_, i) => {
      cells.push({ date: `${ny}-${String(nm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, day: i + 1, isCurrentMonth: false })
    })
    return cells
  }, [year, month])

  var rows = calendarDays.length / 7
  var monthStart = calendarDays[0]?.date || ''
  var monthEnd = calendarDays[calendarDays.length - 1]?.date || ''

  // ── 过滤可见任务 ──────────────────────────────────────────
  var visibleTasks = useMemo(() =>
    allItems.filter(item => {
      var s = item.startDate || ''
      var e = item.endDate || s
      return s <= monthEnd && e >= monthStart
    }).slice(0, 50),
  [allItems, monthStart, monthEnd])

  // ── 计算任务色条布局 ──────────────────────────────────────
  var taskBars = useMemo(() => {
    var bars: {
      task: TodoItem; rowIdx: number; startCol: number; span: number
      lane: number; isStart: boolean; isEnd: boolean; color: string
    }[] = []
    var laneMaps: { lane: number; start: number; end: number }[][] = Array.from({ length: rows }, () => [])

    visibleTasks.forEach(task => {
      var s = task.startDate || ''
      var e = task.endDate || s
      var color = getTaskColor(task.id, task.color)

      Array.from({ length: rows }).forEach((_, rowIdx) => {
        var rowStart = calendarDays[rowIdx * 7].date
        var rowEnd = calendarDays[rowIdx * 7 + 6].date
        if (s > rowEnd || e < rowStart) return

        var cs = s < rowStart ? rowStart : s
        var ce = e > rowEnd ? rowEnd : e
        var startCol = calendarDays.findIndex(c => c.date === cs) - rowIdx * 7
        var endCol = calendarDays.findIndex(c => c.date === ce) - rowIdx * 7
        if (startCol < 0) startCol = 0
        if (endCol < 0) endCol = 6
        var span = endCol - startCol + 1

        var lane = 0
        while (laneMaps[rowIdx].some(m =>
          m.lane === lane && !(startCol > m.end || (startCol + span - 1) < m.start)
        )) { lane++ }
        if (lane >= 3) return

        laneMaps[rowIdx].push({ lane, start: startCol, end: startCol + span - 1 })
        bars.push({ task, rowIdx, startCol, span, lane, isStart: cs === s, isEnd: ce === e, color })
      })
    })
    return bars
  }, [visibleTasks, calendarDays, rows])

  var maxLanesPerRow = useMemo(() => {
    var result: number[] = Array.from({ length: rows }, () => 0)
    taskBars.forEach(bar => { result[bar.rowIdx] = Math.max(result[bar.rowIdx], bar.lane + 1) })
    return result
  }, [taskBars, rows])

  return (
    <><div className="flex-1 min-h-0 flex flex-col" style={{ padding: '0 0 4px' }}>
      {/* 月份导航 */}
      <div className="flex items-center justify-between" style={{ padding: '4px 0 8px', flexShrink: 0 }}>
        <button onClick={goPrev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', padding: '4px' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>{year}年{month + 1}月</span>
          <button onClick={goToday} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', color: '#667eea', cursor: 'pointer' }}>
            今天
          </button>
        </div>
        <button onClick={goNext} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', padding: '4px' }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 星期表头 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: i >= 5 ? '#a1a1aa' : '#71717a', padding: '6px 0', borderRight: i < 6 ? `1px solid ${BORDER}` : 'none' }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── 日历网格主体 ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {Array.from({ length: rows }).map((_, rowIdx) => {
          var rowCells = calendarDays.slice(rowIdx * 7, rowIdx * 7 + 7)
          var rowBars = taskBars.filter(b => b.rowIdx === rowIdx)
          var lanesInRow = maxLanesPerRow[rowIdx]
          var taskAreaH = lanesInRow > 0 ? lanesInRow * LANE_GAP + 4 : 0

          return (
            <div
              key={rowIdx}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderBottom: rowIdx < rows - 1 ? `1px solid ${BORDER}` : 'none',
                minHeight: `${DATE_H + taskAreaH}px`,
              }}
            >
              {/* ── 上层：日期区（固定高度） ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: `${DATE_H}px`, flexShrink: 0 }}>
                {rowCells.map((cell, colIdx) => {
                  var isToday = cell.date === todayStr
                  var isWeekend = colIdx >= 5
                  var holiday = holidays.get(cell.date)
                  var lunar = getLunarInfo(...cell.date.split('-').map(Number) as [number, number, number])

                  var dayColor = isToday
                    ? '#fff'
                    : !cell.isCurrentMonth
                      ? '#d4d4d8'
                      : holiday?.isOffDay === false
                        ? '#f97316'   // 调休上班：橙色
                        : isWeekend || holiday?.isOffDay
                          ? '#ef4444' // 周末/法定节假日：红色
                          : '#3f3f46'

                  var lunarColor = lunar.type === 'term'
                    ? '#16a34a'
                    : lunar.type === 'festival' || lunar.type === 'monthFirst'
                      ? '#e11d48'
                      : !cell.isCurrentMonth ? '#d4d4d8' : '#a1a1aa'

                  return (
                    <div
                      key={cell.date}
                      onClick={() => onSelectDate?.(cell.date)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '4px 5px 2px',
                        cursor: 'pointer',
                        borderRight: colIdx < 6 ? `1px solid ${BORDER}` : 'none',
                        background: isToday ? 'rgba(102,126,234,0.04)' : 'transparent',
                        transition: 'background 0.12s',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        if (!isToday) e.currentTarget.style.background = 'rgba(0,0,0,0.015)'
                        handleCellMouseEnter(cell.date, e)
                      }}
                      onMouseLeave={(e) => {
                        if (!isToday) e.currentTarget.style.background = isToday ? 'rgba(102,126,234,0.04)' : 'transparent'
                        handleCellMouseLeave()
                      }}
                    >
                      {/* 第一行：日期数字 + 假期徽章 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: isToday ? '22px' : 'auto', height: isToday ? '22px' : 'auto',
                          borderRadius: isToday ? '50%' : '0',
                          background: isToday ? '#667eea' : 'transparent',
                          fontSize: '13px', fontWeight: isToday ? 700 : cell.isCurrentMonth ? 500 : 400,
                          color: dayColor,
                          flexShrink: 0,
                        }}>
                          {cell.day}
                        </span>
                        {/* 假期/调休徽章 */}
                        {holiday && cell.isCurrentMonth && (
                          <span style={{
                            fontSize: '8px', fontWeight: 700, lineHeight: 1,
                            padding: '1px 3px', borderRadius: '3px',
                            background: holiday.isOffDay ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)',
                            color: holiday.isOffDay ? '#ef4444' : '#f97316',
                            flexShrink: 0,
                          }}>
                            {holiday.isOffDay ? '休' : '班'}
                          </span>
                        )}
                      </div>
                      {/* 第二行：农历/节气 */}
                      {lunar.label && (
                        <span style={{
                          fontSize: '9px', lineHeight: 1, color: lunarColor,
                          fontWeight: lunar.type === 'term' || lunar.type === 'festival' ? 600 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {lunar.label}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── 下层：任务色条区（独立区域，高度由任务决定，永不与日期重叠） ── */}
              {taskAreaH > 0 && (
                <div style={{ position: 'relative', height: `${taskAreaH}px`, flexShrink: 0 }}>
                  {/* 列分隔线（保证视觉上与上层对齐） */}
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${(i / 7) * 100}%`,
                      top: 0, bottom: 0, width: '1px',
                      background: BORDER,
                      pointerEvents: 'none',
                    }} />
                  ))}

                  {/* 任务色条 */}
                  {rowBars.map((bar, i) => {
                    var isHovered = hoveredTaskId === bar.task.id
                    var colW = 100 / 7
                    var padL = bar.isStart ? 3 : 0
                    var padR = bar.isEnd ? 3 : 0
                    return (
                      <div
                        key={`${bar.task.id}-${rowIdx}-${i}`}
                        title={bar.task.title || ''}
                        style={{
                          position: 'absolute',
                          top: `${2 + bar.lane * LANE_GAP}px`,
                          left: `calc(${bar.startCol * colW}% + ${padL}px)`,
                          width: `calc(${bar.span * colW}% - ${padL + padR}px)`,
                          height: `${BAR_H}px`,
                          borderRadius: `${bar.isStart ? '4px' : '0'} ${bar.isEnd ? '4px' : '0'} ${bar.isEnd ? '4px' : '0'} ${bar.isStart ? '4px' : '0'}`,
                          background: bar.task.done ? `${bar.color}30` : isHovered ? `${bar.color}cc` : `${bar.color}99`,
                          cursor: 'pointer', overflow: 'hidden',
                          display: 'flex', alignItems: 'center',
                          paddingLeft: bar.isStart ? '6px' : '3px',
                          paddingRight: '3px',
                          transition: 'all 0.12s ease',
                          boxShadow: isHovered ? `0 2px 6px ${bar.color}30` : 'none',
                          transform: isHovered ? 'translateY(-1px)' : 'none',
                          zIndex: isHovered ? 10 : 1,
                          textDecoration: bar.task.done ? 'line-through' : 'none',
                        }}
                        onClick={(e) => { e.stopPropagation(); onSelectDate?.(bar.task.startDate) }}
                        onMouseEnter={() => setHoveredTaskId(bar.task.id)}
                        onMouseLeave={() => setHoveredTaskId(null)}
                      >
                        <span style={{
                          fontSize: '11px', fontWeight: 600, color: '#fff',
                          lineHeight: `${BAR_H}px`, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}>
                          {bar.task.title || ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>

    {/* ── 日期悬停任务弹出层 ──*/}
    {cellPopup && (() => {
      var popupTasks = getTasksForDate(cellPopup.date)
      if (popupTasks.length === 0) return null
      var popW = 200
      var left = Math.min(Math.max(cellPopup.x - popW / 2, 8), window.innerWidth - popW - 8)
      var top = cellPopup.y
      return createPortal(
        <div
          style={{
            position: 'fixed',
            left,
            top,
            width: `${popW}px`,
            background: 'rgba(255,255,255,0.97)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            padding: '8px',
            zIndex: 99998,
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#71717a', marginBottom: '6px', padding: '0 2px' }}>
            {cellPopup.date} · {popupTasks.length} 个任务
          </p>
          {popupTasks.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 6px', borderRadius: '7px', marginBottom: '2px',
              background: t.done ? 'rgba(0,0,0,0.02)' : 'rgba(102,126,234,0.04)',
            }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: getTaskColor(t.id, t.color),
                opacity: t.done ? 0.4 : 1,
              }} />
              <span style={{
                fontSize: '12px', color: t.done ? '#a1a1aa' : '#3f3f46',
                textDecoration: t.done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t.title}
              </span>
            </div>
          ))}
        </div>,
        document.body
      )
    })()}
  </>)
}
