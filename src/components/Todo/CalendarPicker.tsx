import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarPickerProps {
  selectedDate: string // 'YYYY-MM-DD'
  onSelect: (date: string) => void
  onClose: () => void
}

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatYM(year: number, month: number): string {
  return `${year}-${pad(month)}`
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Get all days to display in a month grid (includes prev/next month padding) */
function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate()

  const days: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = []

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const m = month === 1 ? 12 : month - 1
    const y = month === 1 ? year - 1 : year
    days.push({ day: d, month: m, year: y, isCurrentMonth: false })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, month, year, isCurrentMonth: true })
  }

  // Next month padding (fill to 42 = 6 rows)
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const m = month === 12 ? 1 : month + 1
    const y = month === 12 ? year + 1 : year
    days.push({ day: d, month: m, year: y, isCurrentMonth: false })
  }

  // If only 5 rows needed, trim
  if (days.length > 35 && days.slice(35).every(d => !d.isCurrentMonth)) {
    days.length = 35
  }

  return days
}

export default function CalendarPicker({ selectedDate, onSelect, onClose }: CalendarPickerProps) {
  const selParts = selectedDate.split('-')
  const [viewYear, setViewYear] = useState(parseInt(selParts[0]))
  const [viewMonth, setViewMonth] = useState(parseInt(selParts[1]))
  const [summary, setSummary] = useState<Record<string, { total: number; done: number }>>({})

  const isDark = document.documentElement.classList.contains('dark')
  const todayStr = new Date().toISOString().split('T')[0]

  // Load month summary
  const loadSummary = useCallback(async () => {
    try {
      const data = await window.api.todos.monthSummary(formatYM(viewYear, viewMonth))
      setSummary(data)
    } catch {
      setSummary({})
    }
  }, [viewYear, viewMonth])

  useEffect(() => { loadSummary() }, [loadSummary])

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12) }
    else setViewMonth(viewMonth - 1)
  }

  const goNextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1) }
    else setViewMonth(viewMonth + 1)
  }

  const days = getCalendarDays(viewYear, viewMonth)

  const handleSelect = (d: typeof days[0]) => {
    onSelect(formatDate(d.year, d.month, d.day))
  }

  return (
    <div
      className="absolute left-0 right-0 z-50 animate-scaleIn"
      style={{
        top: '100%',
        marginTop: '4px',
        borderRadius: '16px',
        background: isDark ? '#1e1e22' : '#ffffff',
        boxShadow: isDark
          ? '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)'
          : '0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
        padding: '16px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[14px] font-bold text-zinc-700 dark:text-zinc-200">
          {viewYear}年{viewMonth}月
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={goPrevMonth}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 transition-all"
            style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.color = '#8b5cf6' }}
            onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = '#a1a1aa' }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goNextMonth}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 transition-all"
            style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.color = '#8b5cf6' }}
            onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'; e.currentTarget.style.color = '#a1a1aa' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((wd) => (
          <div key={wd} className="text-center text-[10px] font-bold text-zinc-400/60 dark:text-zinc-500/60 uppercase py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d, i) => {
          const dateStr = formatDate(d.year, d.month, d.day)
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === todayStr
          const info = summary[dateStr]
          const hasTodos = !!info
          const hasIncomplete = info && info.done < info.total
          const allDone = info && info.done === info.total

          return (
            <button
              key={i}
              onClick={() => handleSelect(d)}
              className="relative flex flex-col items-center justify-center py-1 rounded-xl transition-all"
              style={{
                height: '36px',
                ...(isSelected
                  ? {
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      boxShadow: '0 3px 12px -2px rgba(102,126,234,0.45)',
                      fontWeight: 700,
                    }
                  : isToday
                    ? {
                        background: isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.08)',
                        color: '#8b5cf6',
                        fontWeight: 700,
                      }
                    : {
                        color: d.isCurrentMonth
                          ? (isDark ? '#d4d4d8' : '#3f3f46')
                          : (isDark ? '#3f3f46' : '#c4c4cc'),
                        fontWeight: d.isCurrentMonth ? 500 : 400,
                      }
                ),
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
              }}
              onMouseLeave={e => {
                if (!isSelected && !isToday) e.currentTarget.style.background = 'transparent'
                else if (isToday && !isSelected) e.currentTarget.style.background = isDark ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.08)'
              }}
            >
              <span className="text-[12px] leading-none">{d.day}</span>

              {/* Dots: colored markers for has-todos / incomplete */}
              {hasTodos && (
                <div className="flex items-center gap-0.5 mt-0.5">
                  {hasIncomplete && (
                    <div className="w-1 h-1 rounded-full" style={{ background: isSelected ? 'rgba(255,255,255,0.7)' : '#f97316' }} />
                  )}
                  {allDone && (
                    <div className="w-1 h-1 rounded-full" style={{ background: isSelected ? 'rgba(255,255,255,0.7)' : '#43e97b' }} />
                  )}
                  {!allDone && !hasIncomplete && (
                    <div className="w-1 h-1 rounded-full" style={{ background: isSelected ? 'rgba(255,255,255,0.7)' : '#667eea' }} />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-2" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#43e97b' }} />
          <span className="text-[9px] text-zinc-400/60 font-medium">已完成</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f97316' }} />
          <span className="text-[9px] text-zinc-400/60 font-medium">有待办</span>
        </div>
      </div>
    </div>
  )
}
