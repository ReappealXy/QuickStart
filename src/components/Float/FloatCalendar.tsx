import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
var DEFAULT_BAR_COLOR = '#8b5cf6'

interface FloatCalendarProps {
  items: TodoItem[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

/**
 * 浮动窗口内紧凑月历 + 任务色条
 * @param props.items 全部任务（用于渲染色条）
 * @param props.selectedDate 当前选中日期
 * @param props.onSelectDate 日期点击回调
 */
export default function FloatCalendar({ items, selectedDate, onSelectDate }: FloatCalendarProps) {
  var [year, setYear] = useState(() => new Date().getFullYear())
  var [month, setMonth] = useState(() => new Date().getMonth())

  var todayStr = useMemo(() => {
    var d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  var goPrev = () => { if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1) }
  var goNext = () => { if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1) }

  var cells = useMemo(() => {
    var first = new Date(year, month, 1)
    var startPad = first.getDay()
    var daysInMonth = new Date(year, month + 1, 0).getDate()
    var result: { date: string; day: number; cur: boolean }[] = []

    var prevDays = new Date(year, month, 0).getDate()
    var py = month === 0 ? year - 1 : year
    var pm = month === 0 ? 12 : month
    Array.from({ length: startPad }).forEach((_, i) => {
      var d = prevDays - startPad + 1 + i
      result.push({ date: `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, cur: false })
    })

    var ym = `${year}-${String(month + 1).padStart(2, '0')}`
    Array.from({ length: daysInMonth }).forEach((_, i) => {
      result.push({ date: `${ym}-${String(i + 1).padStart(2, '0')}`, day: i + 1, cur: true })
    })

    var remain = (7 - (result.length % 7)) % 7
    var ny = month === 11 ? year + 1 : year
    var nm = month === 11 ? 1 : month + 2
    Array.from({ length: remain }).forEach((_, i) => {
      result.push({ date: `${ny}-${String(nm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, day: i + 1, cur: false })
    })
    return result
  }, [year, month])

  // 任务色条
  var monthStart = cells[0]?.date || ''
  var monthEnd = cells[cells.length - 1]?.date || ''
  var visibleTasks = useMemo(() =>
    items.filter(t => {
      var s = t.startDate || ''
      var e = t.endDate || s
      return s <= monthEnd && e >= monthStart
    }).slice(0, 20),
  [items, monthStart, monthEnd])

  var rows = cells.length / 7

  var taskBars = useMemo(() => {
    var bars: { task: TodoItem; rowIdx: number; startCol: number; span: number; lane: number }[] = []
    var laneMaps: { lane: number; start: number; end: number }[][] = Array.from({ length: rows }, () => [])

    visibleTasks.forEach(task => {
      var s = task.startDate || ''
      var e = task.endDate || s
      Array.from({ length: rows }).forEach((_, ri) => {
        var rs = cells[ri * 7].date
        var re = cells[ri * 7 + 6].date
        if (s > re || e < rs) return
        var cs = s < rs ? rs : s
        var ce = e > re ? re : e
        var sc = cells.findIndex(c => c.date === cs) - ri * 7
        var ec = cells.findIndex(c => c.date === ce) - ri * 7
        if (sc < 0) sc = 0; if (ec < 0) ec = 6
        var span = ec - sc + 1
        var lane = 0
        while (laneMaps[ri].some(m => m.lane === lane && !(sc > m.end || (sc + span - 1) < m.start))) lane++
        if (lane >= 2) return
        laneMaps[ri].push({ lane, start: sc, end: sc + span - 1 })
        bars.push({ task, rowIdx: ri, startCol: sc, span, lane })
      })
    })
    return bars
  }, [visibleTasks, cells, rows])

  return (
    <div style={{ padding: '4px 10px 0' }}>
      {/* 月份导航 */}
      <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
        <button onClick={goPrev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px' }}>
          <ChevronLeft size={13} />
        </button>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a' }}>{year}年{month + 1}月</span>
        <button onClick={goNext} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px' }}>
          <ChevronRight size={13} />
        </button>
      </div>

      {/* 星期表头 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: '9px', fontWeight: 600, color: '#a1a1aa', padding: '2px 0' }}>{w}</div>
        ))}
      </div>

      {/* 日期 + 色条 */}
      {Array.from({ length: rows }).map((_, ri) => {
        var rowCells = cells.slice(ri * 7, ri * 7 + 7)
        var rowBars = taskBars.filter(b => b.rowIdx === ri)
        return (
          <div key={ri} style={{ position: 'relative' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {rowCells.map(cell => {
                var isToday = cell.date === todayStr
                var isSelected = cell.date === selectedDate
                return (
                  <div
                    key={cell.date}
                    onClick={() => onSelectDate(cell.date)}
                    style={{
                      textAlign: 'center',
                      padding: '3px 0 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      fontSize: '10px',
                      fontWeight: isToday || isSelected ? 700 : 400,
                      color: !cell.cur ? '#d4d4d8' : isToday ? '#fff' : isSelected ? '#667eea' : '#52525b',
                      background: isToday ? '#667eea' : 'transparent',
                      padding: '1px 4px',
                      borderRadius: '4px',
                      textDecoration: isSelected && !isToday ? 'underline' : 'none',
                    }}>
                      {cell.day}
                    </span>
                  </div>
                )
              })}
            </div>
            {rowBars.map((bar, i) => (
              <div
                key={`${bar.task.id}-${ri}-${i}`}
                style={{
                  position: 'absolute',
                  top: `${16 + bar.lane * 8}px`,
                  left: `${(bar.startCol / 7) * 100}%`,
                  width: `${(bar.span / 7) * 100}%`,
                  height: '6px',
                  borderRadius: '2px',
                  background: bar.task.color || DEFAULT_BAR_COLOR,
                  opacity: bar.task.done ? 0.3 : 0.65,
                }}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
