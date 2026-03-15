import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, Minus, Pin, PinOff, Sun, Moon, Power, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
// @ts-ignore
import _lunarLib from 'lunar-javascript'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var _Solar: any = (_lunarLib as any)?.Solar ?? (_lunarLib as any)?.default?.Solar ?? _lunarLib

interface LunarInfo {
  label: string
  type: 'day' | 'monthFirst' | 'term' | 'festival'
}

/**
 * 获取指定公历日期的农历/节气信息
 * @param y 年 @param m 月（1-based） @param d 日
 */
function getLunarInfo(y: number, m: number, d: number): LunarInfo {
  try {
    var lunar = _Solar.fromYmd(y, m, d).getLunar()
    var jq = ''
    try { jq = lunar.getJieQi() || '' } catch { /* ignore */ }
    if (jq) return { label: jq, type: 'term' }
    var festivals: string[] = []
    try { festivals = lunar.getFestivals() || [] } catch { /* ignore */ }
    if (festivals.length > 0) return { label: festivals[0], type: 'festival' }
    if (lunar.getDay() === 1) return { label: lunar.getMonthInChinese() + '月', type: 'monthFirst' }
    return { label: lunar.getDayInChinese(), type: 'day' }
  } catch {
    return { label: '', type: 'day' }
  }
}

var WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

var TASK_PALETTE = [
  '#ef4444', '#22c55e', '#3b82f6', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#eab308', '#14b8a6', '#e11d48',
]

/**
 * 根据任务 ID 生成稳定的颜色
 * @param id 任务 ID
 * @param customColor 自定义颜色
 * @return 颜色值
 */
function getTaskColor(id: string, customColor: string | null): string {
  if (customColor) return customColor
  var hash = 0
  id.split('').forEach(c => { hash = ((hash << 5) - hash) + c.charCodeAt(0); hash |= 0 })
  return TASK_PALETTE[Math.abs(hash) % TASK_PALETTE.length]
}

var EDGE_SIZE = 6
var CORNER_SIZE = 12
var MIN_W = 260
var MIN_H = 280

// 8 个方向的拖拽缩放区域
var RESIZE_EDGES: { name: string; style: Record<string, number>; cursor: string }[] = [
  { name: 'top', style: { top: 0, left: CORNER_SIZE, right: CORNER_SIZE, height: EDGE_SIZE }, cursor: 'n-resize' },
  { name: 'bottom', style: { bottom: 0, left: CORNER_SIZE, right: CORNER_SIZE, height: EDGE_SIZE }, cursor: 's-resize' },
  { name: 'left', style: { left: 0, top: CORNER_SIZE, bottom: CORNER_SIZE, width: EDGE_SIZE }, cursor: 'w-resize' },
  { name: 'right', style: { right: 0, top: CORNER_SIZE, bottom: CORNER_SIZE, width: EDGE_SIZE }, cursor: 'e-resize' },
  { name: 'top-left', style: { top: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE }, cursor: 'nw-resize' },
  { name: 'top-right', style: { top: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE }, cursor: 'ne-resize' },
  { name: 'bottom-left', style: { bottom: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE }, cursor: 'sw-resize' },
  { name: 'bottom-right', style: { bottom: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE }, cursor: 'se-resize' },
]

/**
 * 桌面浮动窗口根组件
 * 纯日历网格 + 任务色条，支持边框拖拽缩放
 */
export default function FloatingApp() {
  var [items, setItems] = useState<TodoItem[]>([])
  var [opacity, setOpacity] = useState(0.85)
  var [showOpacity, setShowOpacity] = useState(false)
  var [pinned, setPinned] = useState(true)
  var [autoShow, setAutoShow] = useState(false)
  var [isDark, setIsDark] = useState(false)
  var [year, setYear] = useState(() => new Date().getFullYear())
  var [month, setMonth] = useState(() => new Date().getMonth())
  var opacityRef = useRef<HTMLDivElement>(null)
  var [cellPopup, setCellPopup] = useState<{ date: string; x: number; y: number } | null>(null)
  var cellHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  var todayStr = useMemo(() => {
    var d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  var loadItems = useCallback(async () => {
    try {
      var list = await window.api.todos.list()
      setItems(Array.isArray(list) ? list : [])
    } catch { setItems([]) }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => {
    window.api?.floating?.isPinned?.().then((v: boolean) => setPinned(v)).catch(() => {})
    window.api?.floating?.getAutoShow?.().then((v: boolean) => setAutoShow(v)).catch(() => {})
  }, [])
  useEffect(() => {
    var timer = setInterval(loadItems, 5000)
    return () => clearInterval(timer)
  }, [loadItems])

  // 点击外部关闭透明度面板
  useEffect(() => {
    if (!showOpacity) return
    var handler = (e: MouseEvent) => {
      if (opacityRef.current && !opacityRef.current.contains(e.target as Node)) {
        setShowOpacity(false)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [showOpacity])

  var handleOpacityChange = async (val: number) => {
    setOpacity(val)
    await window.api.floating.setOpacity(val)
  }
  var handleClose = () => { window.api.floating.close() }
  var handleTogglePin = async () => { var next = !pinned; setPinned(next); await window.api.floating.setPinned(next) }
  var handleToggleAutoShow = async () => { var next = !autoShow; setAutoShow(next); await window.api.floating.setAutoShow(next) }
  var handleToggleTheme = () => setIsDark(!isDark)

  // ─── 边框拖拽缩放 ────────────────────────────────────
  var resizeRef = useRef<{
    edge: string
    startX: number
    startY: number
    startBounds: { x: number; y: number; width: number; height: number }
  } | null>(null)

  /**
   * 开始缩放
   * @param e 指针事件
   * @param edge 缩放方向
   */
  var handleResizeDown = async (e: React.PointerEvent, edge: string) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    var bounds = await window.api.floating.getBounds()
    resizeRef.current = { edge, startX: e.screenX, startY: e.screenY, startBounds: bounds }
  }

  /** @param e 指针移动 */
  var handleResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return
    var { edge, startX, startY, startBounds } = resizeRef.current
    var dx = e.screenX - startX
    var dy = e.screenY - startY
    var b = { ...startBounds }

    if (edge.includes('right')) b.width = Math.max(MIN_W, startBounds.width + dx)
    if (edge.includes('bottom')) b.height = Math.max(MIN_H, startBounds.height + dy)
    if (edge.includes('left')) {
      var dw = Math.min(dx, startBounds.width - MIN_W)
      b.x = startBounds.x + dw
      b.width = startBounds.width - dw
    }
    if (edge.includes('top')) {
      var dh = Math.min(dy, startBounds.height - MIN_H)
      b.y = startBounds.y + dh
      b.height = startBounds.height - dh
    }
    window.api.floating.setBounds(b)
  }

  /** @param e 指针抬起 */
  var handleResizeUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId)
    resizeRef.current = null
  }

  var getTasksForDate = useCallback((date: string) =>
    items.filter(t => { var s = t.startDate || ''; var e = t.endDate || s; return s <= date && e >= date }),
  [items])

  var handleCellMouseEnter = useCallback((date: string, e: React.MouseEvent) => {
    var rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    cellHoverTimer.current = setTimeout(() => {
      setCellPopup({ date, x: rect.left + rect.width / 2, y: rect.bottom + 4 })
    }, 400)
  }, [])

  var handleCellMouseLeave = useCallback(() => {
    if (cellHoverTimer.current) clearTimeout(cellHoverTimer.current)
    setCellPopup(null)
  }, [])

  // ─── 日历 ────────────────────────────────────
  var goPrev = () => { if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1) }
  var goNext = () => { if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1) }
  var goToday = () => { var now = new Date(); setYear(now.getFullYear()); setMonth(now.getMonth()) }

  var calendarDays = useMemo(() => {
    var firstDay = new Date(year, month, 1)
    var startPad = (firstDay.getDay() + 6) % 7
    var daysInMonth = new Date(year, month + 1, 0).getDate()
    var cells: { date: string; day: number; cur: boolean }[] = []

    var prevDays = new Date(year, month, 0).getDate()
    var py = month === 0 ? year - 1 : year
    var pm = month === 0 ? 12 : month
    Array.from({ length: startPad }).forEach((_, i) => {
      var d = prevDays - startPad + 1 + i
      cells.push({ date: `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, cur: false })
    })

    var ym = `${year}-${String(month + 1).padStart(2, '0')}`
    Array.from({ length: daysInMonth }).forEach((_, i) => {
      cells.push({ date: `${ym}-${String(i + 1).padStart(2, '0')}`, day: i + 1, cur: true })
    })

    var remain = (7 - (cells.length % 7)) % 7
    var ny = month === 11 ? year + 1 : year
    var nm = month === 11 ? 1 : month + 2
    Array.from({ length: remain }).forEach((_, i) => {
      cells.push({ date: `${ny}-${String(nm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, day: i + 1, cur: false })
    })
    return cells
  }, [year, month])

  var rows = calendarDays.length / 7
  var monthStart = calendarDays[0]?.date || ''
  var monthEnd = calendarDays[calendarDays.length - 1]?.date || ''

  var visibleTasks = useMemo(() =>
    items.filter(t => {
      var s = t.startDate || ''
      var e = t.endDate || s
      if (s > monthEnd || e < monthStart) return false
      // 单日任务（无结束日期或结束日等于开始日）且已完成 → 不显示
      var isSingleDay = !t.endDate || t.endDate === t.startDate
      if (isSingleDay && t.done) return false
      return true
    }).slice(0, 30),
  [items, monthStart, monthEnd])

  var taskBars = useMemo(() => {
    var bars: { task: TodoItem; rowIdx: number; startCol: number; span: number; lane: number; isStart: boolean; isEnd: boolean; color: string }[] = []
    var laneMaps: { lane: number; start: number; end: number }[][] = Array.from({ length: rows }, () => [])

    visibleTasks.forEach(task => {
      var s = task.startDate || ''
      var e = task.endDate || s
      var color = getTaskColor(task.id, task.color)

      Array.from({ length: rows }).forEach((_, ri) => {
        var rs = calendarDays[ri * 7].date
        var re = calendarDays[ri * 7 + 6].date
        if (s > re || e < rs) return
        var cs = s < rs ? rs : s
        var ce = e > re ? re : e
        var sc = calendarDays.findIndex(c => c.date === cs) - ri * 7
        var ec = calendarDays.findIndex(c => c.date === ce) - ri * 7
        if (sc < 0) sc = 0
        if (ec < 0) ec = 6
        var span = ec - sc + 1
        var lane = 0
        while (laneMaps[ri].some(m => m.lane === lane && !(sc > m.end || (sc + span - 1) < m.start))) lane++
        if (lane >= 3) return
        laneMaps[ri].push({ lane, start: sc, end: sc + span - 1 })
        bars.push({ task, rowIdx: ri, startCol: sc, span, lane, isStart: cs === s, isEnd: ce === e, color })
      })
    })
    return bars
  }, [visibleTasks, calendarDays, rows])

  var maxLanesPerRow = useMemo(() => {
    var result: number[] = Array.from({ length: rows }, () => 0)
    taskBars.forEach(bar => { result[bar.rowIdx] = Math.max(result[bar.rowIdx], bar.lane + 1) })
    return result
  }, [taskBars, rows])

  // 主题色
  var bg = isDark ? `rgba(30,30,35,${opacity * 0.95})` : `rgba(255,255,255,${opacity * 0.95})`
  var textPrimary = isDark ? '#f4f4f5' : '#1a1a1a'
  var textSecondary = isDark ? '#a1a1aa' : '#71717a'
  var textMuted = isDark ? '#52525b' : '#d4d4d8'
  var borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  var hoverBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.015)'
  var todayBg = '#667eea'
  var btnBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  // 上下分层：DATE_H = 日期区固定高度，LANE_GAP = 每条任务行间距
  var DATE_H = 34
  var LANE_GAP = 15
  var BAR_H = 11

  return (
    <><div
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        background: bg,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)'
          : '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
      }}
    >
      {/* 边框拖拽缩放区域：钉住时禁用 */}
      {!pinned && RESIZE_EDGES.map(edge => (
        <div
          key={edge.name}
          className="no-drag"
          style={{
            position: 'absolute',
            ...edge.style,
            cursor: edge.cursor,
            zIndex: 100,
          }}
          onPointerDown={(e) => handleResizeDown(e, edge.name)}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      ))}

      {/* 顶部拖拽栏 + 窗口控制（钉住时禁止拖动） */}
      <div
        className={pinned ? 'flex items-center justify-between' : 'drag-region flex items-center justify-between'}
        style={{ padding: '10px 12px 4px', flexShrink: 0 }}
      >
        <span className="no-drag" style={{ fontSize: '11px', fontWeight: 700, color: '#667eea' }}>QuickStart</span>
        <div className="no-drag flex items-center gap-1" style={{ position: 'relative' }}>
          {/* 透明度 */}
          <button
            onClick={() => setShowOpacity(!showOpacity)}
            title="调节透明度"
            style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showOpacity ? 'rgba(102,126,234,0.15)' : btnBg, color: showOpacity ? '#667eea' : textSecondary, transition: 'all 0.15s' }}
          >
            <SlidersHorizontal size={9} />
          </button>
          {/* 随启动显示 */}
          <button
            onClick={handleToggleAutoShow}
            title={autoShow ? '随启动显示: 开' : '随启动显示: 关'}
            style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: autoShow ? 'rgba(34,197,94,0.15)' : btnBg, color: autoShow ? '#22c55e' : textSecondary, transition: 'all 0.15s' }}
          >
            <Power size={9} />
          </button>
          {/* 主题切换 */}
          <button
            onClick={handleToggleTheme}
            title={isDark ? '切换到浅色' : '切换到深色'}
            style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: btnBg, color: textSecondary, transition: 'all 0.15s' }}
          >
            {isDark ? <Sun size={9} /> : <Moon size={9} />}
          </button>
          {/* 固定 */}
          <button
            onClick={handleTogglePin}
            title={pinned ? '已固定（点击取消可拖动）' : '固定到桌面（锁定位置）'}
            style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pinned ? 'rgba(102,126,234,0.15)' : btnBg, color: pinned ? '#667eea' : textSecondary, transition: 'all 0.15s' }}
          >
            {pinned ? <Pin size={9} /> : <PinOff size={9} />}
          </button>
          {/* 最小化（钉住时禁用） */}
          <button
            onClick={() => !pinned && window.api.window.minimize?.()}
            disabled={pinned}
            style={{
              width: '20px', height: '20px', borderRadius: '50%', border: 'none',
              cursor: pinned ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: btnBg, color: pinned ? textMuted : textSecondary,
              opacity: pinned ? 0.5 : 1,
              pointerEvents: pinned ? 'none' : 'auto',
            }}
          >
            <Minus size={9} />
          </button>
          {/* 关闭（钉住时禁用） */}
          <button
            onClick={() => !pinned && handleClose()}
            disabled={pinned}
            style={{
              width: '20px', height: '20px', borderRadius: '50%', border: 'none',
              cursor: pinned ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: btnBg, color: pinned ? textMuted : textSecondary,
              opacity: pinned ? 0.5 : 1,
              pointerEvents: pinned ? 'none' : 'auto',
            }}
          >
            <X size={9} />
          </button>

          {/* 透明度弹出面板 */}
          {showOpacity && (
            <div
              ref={opacityRef}
              className="no-drag"
              style={{
                position: 'absolute',
                top: '28px',
                right: '0',
                padding: '8px 12px',
                borderRadius: '10px',
                background: isDark ? 'rgba(40,40,48,0.97)' : 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '10px', color: textSecondary }}>透明度</span>
              <input
                type="range" min="0.3" max="1" step="0.05"
                value={opacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                style={{ width: '100px', accentColor: '#667eea', height: '3px' }}
              />
              <span style={{ fontSize: '10px', color: textSecondary, minWidth: '26px', textAlign: 'right' }}>
                {Math.round(opacity * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 月份导航 */}
      <div className="flex items-center justify-between" style={{ padding: '4px 12px 6px', flexShrink: 0 }}>
        <button onClick={goPrev} className="no-drag" style={{ background: 'none', border: 'none', cursor: 'pointer', color: textSecondary, padding: '2px' }}>
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '13px', fontWeight: 700, color: textPrimary }}>{year}年{month + 1}月</span>
          <button
            onClick={goToday}
            className="no-drag"
            style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '5px', border: `1px solid ${borderColor}`, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)', color: '#667eea', cursor: 'pointer' }}
          >
            今天
          </button>
        </div>
        <button onClick={goNext} className="no-drag" style={{ background: 'none', border: 'none', cursor: 'pointer', color: textSecondary, padding: '2px' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 日历网格区域 */}
      <div className="no-drag" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 8px 8px' }}>
        {/* 星期表头 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${borderColor}`, flexShrink: 0 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, padding: '4px 0', color: i >= 5 ? (isDark ? '#52525b' : '#a1a1aa') : textSecondary, borderRight: i < 6 ? `1px solid ${borderColor}` : 'none' }}>
              {w}
            </div>
          ))}
        </div>

        {/* 日期行 — 上下分层，彻底消除重叠 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {Array.from({ length: rows }).map((_, rowIdx) => {
            var rowCells = calendarDays.slice(rowIdx * 7, rowIdx * 7 + 7)
            var rowBars = taskBars.filter(b => b.rowIdx === rowIdx)
            var lanesInRow = maxLanesPerRow[rowIdx]
            var taskAreaH = lanesInRow > 0 ? lanesInRow * LANE_GAP + 2 : 0

            return (
              <div
                key={rowIdx}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  borderBottom: rowIdx < rows - 1 ? `1px solid ${borderColor}` : 'none',
                  minHeight: `${DATE_H + taskAreaH}px`,
                }}
              >
                {/* ── 上层：日期区（固定高度） ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: `${DATE_H}px`, flexShrink: 0 }}>
                  {rowCells.map((cell, colIdx) => {
                    var isToday = cell.date === todayStr
                    var isWeekend = colIdx >= 5
                    var [cy, cm, cd] = cell.date.split('-').map(Number)
                    var lunar = getLunarInfo(cy, cm, cd)
                    var dayColor = isToday ? '#fff'
                      : !cell.cur ? textMuted
                      : isWeekend ? (isDark ? '#f87171' : '#ef4444')
                      : textPrimary
                    var lunarColor = lunar.type === 'term' ? '#16a34a'
                      : lunar.type === 'festival' || lunar.type === 'monthFirst' ? '#e11d48'
                      : !cell.cur ? textMuted : (isDark ? '#52525b' : '#a1a1aa')
                    return (
                      <div
                        key={cell.date}
                        style={{
                          display: 'flex', flexDirection: 'column',
                          padding: '2px 3px 1px',
                          cursor: 'pointer',
                          borderRight: colIdx < 6 ? `1px solid ${borderColor}` : 'none',
                          transition: 'background 0.1s',
                          background: isToday ? (isDark ? 'rgba(102,126,234,0.08)' : 'rgba(102,126,234,0.04)') : 'transparent',
                          overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => {
                          if (!isToday) e.currentTarget.style.background = hoverBg
                          handleCellMouseEnter(cell.date, e)
                        }}
                        onMouseLeave={(e) => {
                          if (!isToday) e.currentTarget.style.background = isToday ? (isDark ? 'rgba(102,126,234,0.08)' : 'rgba(102,126,234,0.04)') : 'transparent'
                          handleCellMouseLeave()
                        }}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: isToday ? '18px' : 'auto', height: isToday ? '18px' : 'auto',
                          borderRadius: isToday ? '50%' : '0',
                          background: isToday ? todayBg : 'transparent',
                          fontSize: '10px', fontWeight: isToday ? 700 : cell.cur ? 500 : 400,
                          color: dayColor, flexShrink: 0,
                        }}>
                          {cell.day}
                        </span>
                        {lunar.label && (
                          <span style={{
                            fontSize: '7px', lineHeight: 1.1, color: lunarColor, marginTop: '1px',
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

                {/* ── 下层：任务色条区（独立区域，绝不与日期重叠） ── */}
                {taskAreaH > 0 && (
                  <div style={{ position: 'relative', height: `${taskAreaH}px`, flexShrink: 0 }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} style={{
                        position: 'absolute', left: `${(i / 7) * 100}%`,
                        top: 0, bottom: 0, width: '1px',
                        background: borderColor, pointerEvents: 'none',
                      }} />
                    ))}
                    {rowBars.map((bar, i) => {
                      var colW = 100 / 7
                      var padL = bar.isStart ? 2 : 0
                      var padR = bar.isEnd ? 2 : 0
                      return (
                        <div
                          key={`${bar.task.id}-${rowIdx}-${i}`}
                          title={bar.task.title || ''}
                          style={{
                            position: 'absolute',
                            top: `${1 + bar.lane * LANE_GAP}px`,
                            left: `calc(${bar.startCol * colW}% + ${padL}px)`,
                            width: `calc(${bar.span * colW}% - ${padL + padR}px)`,
                            height: `${BAR_H}px`,
                            borderRadius: `${bar.isStart ? '3px' : '0'} ${bar.isEnd ? '3px' : '0'} ${bar.isEnd ? '3px' : '0'} ${bar.isStart ? '3px' : '0'}`,
                            background: bar.task.done ? `${bar.color}30` : `${bar.color}77`,
                            overflow: 'hidden', display: 'flex', alignItems: 'center',
                            paddingLeft: bar.isStart ? '4px' : '2px',
                            zIndex: 2,
                          }}
                        >
                          <span style={{ fontSize: '8px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
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
    </div>

    {/* ── 日期悬停任务浮层 ── */}
    {cellPopup && (() => {
      var popupTasks = getTasksForDate(cellPopup.date)
      if (popupTasks.length === 0) return null
      var popW = 160
      var left = Math.min(Math.max(cellPopup.x - popW / 2, 4), window.innerWidth - popW - 4)
      return (
        <div
          style={{
            position: 'fixed',
            left,
            top: cellPopup.y,
            width: `${popW}px`,
            background: isDark ? 'rgba(30,30,38,0.97)' : 'rgba(255,255,255,0.97)',
            borderRadius: '10px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            padding: '6px',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <p style={{ fontSize: '9px', fontWeight: 700, color: isDark ? '#71717a' : '#a1a1aa', marginBottom: '4px', padding: '0 2px' }}>
            {cellPopup.date} · {popupTasks.length} 个任务
          </p>
          {popupTasks.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '3px 4px', borderRadius: '6px', marginBottom: '2px',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: getTaskColor(t.id, t.color), opacity: t.done ? 0.4 : 1,
              }} />
              <span style={{
                fontSize: '10px', color: t.done ? (isDark ? '#52525b' : '#a1a1aa') : (isDark ? '#e4e4e7' : '#3f3f46'),
                textDecoration: t.done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t.title}
              </span>
            </div>
          ))}
        </div>
      )
    })()}
  </>)
}
