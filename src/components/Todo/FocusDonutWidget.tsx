import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * 秒数转中文时长
 * @param seconds 秒数
 * @return "X小时Ym" 或 "Xm" 或 "0分"
 */
function formatDurationCN(seconds: number): string {
  var totalMins = Math.floor(Math.max(0, seconds) / 60)
  var h = Math.floor(totalMins / 60)
  var m = totalMins % 60
  if (h > 0) return `${h}小时${m}分`
  if (totalMins > 0) return `${totalMins}分`
  return '0分'
}

type FocusSegment = {
  label: string
  duration: number
  ratio: number
  color: string
}

interface FocusDonutWidgetProps {
  items: TodoItem[]
  isDark: boolean
}

/**
 * 专注时长饼图统计组件
 * 点击小饼图按钮弹出完整统计弹窗
 * @param props.items 当日任务列表
 * @param props.isDark 暗色模式
 */
export default function FocusDonutWidget({ items, isDark }: FocusDonutWidgetProps) {
  var [isOpen, setIsOpen] = useState(false)
  var [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  var { segments, totalDuration } = useMemo(() => {
    var focusItems = items
      .map((i) => ({
        label: (i.title || '').trim() || '未命名事项',
        duration: i.completedDuration && i.completedDuration > 0 ? i.completedDuration : 0,
      }))
      .filter((i) => i.duration > 0)
      .sort((a, b) => b.duration - a.duration)

    var total = focusItems.reduce((sum, i) => sum + i.duration, 0)
    if (total <= 0) return { segments: [] as FocusSegment[], totalDuration: 0 }

    var palette = ['#F28AA5', '#7CC8C4', '#B7E9E9', '#77A7B5', '#F3D39A', '#8E88E8', '#D6D7EA', '#5EB9E6', '#CFCFCF', '#F6B8C9']
    var computed: FocusSegment[] = focusItems.map((item, idx) => ({
      label: item.label,
      duration: item.duration,
      ratio: item.duration / total,
      color: palette[idx % palette.length],
    }))
    return { segments: computed, totalDuration: total }
  }, [items])

  var hasData = totalDuration > 0
  var closeModal = useCallback(() => {
    setIsOpen(false)
    setHoveredIndex(null)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    var handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', handleEsc)
    var prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, closeModal])

  /**
   * 渲染饼图 SVG
   * @param size SVG 尺寸
   * @param radius 饼图半径
   * @param interactive 是否启用 hover 交互
   * @param withLabels 是否显示标注线和标签
   */
  var renderPie = (size: number, radius: number, interactive = false, withLabels = false) => {
    var center = size / 2
    var full = 2 * Math.PI
    var accumulated = -Math.PI / 2

    type ArcMeta = { segment: FocusSegment; index: number; start: number; end: number; mid: number; sweep: number }
    var arcs: ArcMeta[] = segments.map((segment, index) => {
      var sweep = segment.ratio * full
      var start = accumulated
      var end = accumulated + sweep
      accumulated = end
      return { segment, index, start, end, mid: start + sweep / 2, sweep }
    })

    type RawCallout = { arc: ArcMeta; side: 'left' | 'right'; x1: number; y1: number; x2: number; anchorY: number }
    type PositionedCallout = RawCallout & { y: number; x3: number; textX: number; anchor: 'start' | 'end' }

    var arrangeCallouts = (rows: RawCallout[], side: 'left' | 'right'): PositionedCallout[] => {
      if (rows.length === 0) return []
      var sorted = [...rows].sort((a, b) => a.anchorY - b.anchorY)
      var minY = center - radius - 12
      var maxY = center + radius + 12
      var gap = 14

      var positioned: PositionedCallout[] = sorted.map((row) => ({ ...row, y: row.anchorY, x3: 0, textX: 0, anchor: (side === 'right' ? 'start' : 'end') as 'start' | 'end' }))
      positioned.forEach((p, i) => { if (i > 0) p.y = Math.max(p.y, positioned[i - 1].y + gap) })
      if (positioned[positioned.length - 1].y > maxY) {
        var overflow = positioned[positioned.length - 1].y - maxY
        positioned.forEach(p => { p.y -= overflow })
        for (var i = positioned.length - 2; i >= 0; i--) positioned[i].y = Math.min(positioned[i].y, positioned[i + 1].y - gap)
      }
      if (positioned[0].y < minY) {
        var underflow = minY - positioned[0].y
        positioned.forEach(p => { p.y += underflow })
        positioned.forEach((p, idx) => { if (idx > 0) p.y = Math.max(p.y, positioned[idx - 1].y + gap) })
      }
      return positioned.map((row) => {
        var dir = side === 'right' ? 1 : -1
        var x3 = center + dir * (radius + 40)
        return { ...row, x3, textX: x3 + dir * 12, anchor: (side === 'right' ? 'start' : 'end') as 'start' | 'end' }
      })
    }

    var callouts = withLabels ? (() => {
      var left: RawCallout[] = []
      var right: RawCallout[] = []
      var calloutR = radius + 2
      var elbowR = radius + 16
      arcs.forEach((arc) => {
        var side: 'left' | 'right' = Math.cos(arc.mid) >= 0 ? 'right' : 'left'
        var row: RawCallout = { arc, side, x1: center + Math.cos(arc.mid) * calloutR, y1: center + Math.sin(arc.mid) * calloutR, x2: center + Math.cos(arc.mid) * elbowR, anchorY: center + Math.sin(arc.mid) * elbowR }
        if (side === 'right') right.push(row)
        else left.push(row)
      })
      return [...arrangeCallouts(left, 'left'), ...arrangeCallouts(right, 'right')]
    })() : []

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((arc) => {
          var { segment: s, index: idx, start, end, mid, sweep } = arc
          var active = hoveredIndex === idx
          if (sweep >= full - 0.0001) {
            return <circle key={`${s.label}-${idx}-${size}`} cx={center} cy={center} r={radius} fill={s.color} stroke="none" strokeWidth={0} onMouseEnter={interactive ? () => setHoveredIndex(idx) : undefined} onMouseLeave={interactive ? () => setHoveredIndex(null) : undefined} style={{ filter: active ? `drop-shadow(0 0 7px ${s.color}8a)` : 'none', cursor: interactive ? 'pointer' : 'default', transition: 'all 180ms ease' }} />
          }
          var x1 = center + radius * Math.cos(start)
          var y1 = center + radius * Math.sin(start)
          var x2 = center + radius * Math.cos(end)
          var y2 = center + radius * Math.sin(end)
          var largeArcFlag = sweep > Math.PI ? 1 : 0
          var path = [`M ${center} ${center}`, `L ${x1} ${y1}`, `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`, 'Z'].join(' ')
          return <path key={`${s.label}-${idx}-${size}`} d={path} fill={s.color} stroke="none" strokeWidth={0} onMouseEnter={interactive ? () => setHoveredIndex(idx) : undefined} onMouseLeave={interactive ? () => setHoveredIndex(null) : undefined} style={{ filter: active ? `drop-shadow(0 0 7px ${s.color}8a)` : 'none', cursor: interactive ? 'pointer' : 'default', transition: 'all 180ms ease' }} />
        })}

        {withLabels && callouts.map((callout) => {
          var active = hoveredIndex === callout.arc.index
          var durationText = formatDurationCN(callout.arc.segment.duration)
          var labelX = callout.textX
          var lineEndX = callout.anchor === 'start' ? labelX - 12 : labelX + 12
          return (
            <g key={`callout-${callout.arc.index}-${size}`} onMouseEnter={interactive ? () => setHoveredIndex(callout.arc.index) : undefined} onMouseLeave={interactive ? () => setHoveredIndex(null) : undefined} style={{ cursor: interactive ? 'pointer' : 'default' }}>
              <polyline fill="none" stroke={active ? '#7C4DFF' : (isDark ? 'rgba(228,228,231,0.8)' : 'rgba(63,63,70,0.72)')} strokeWidth={active ? 1.6 : 1.2} points={`${callout.x1},${callout.y1} ${callout.x2},${callout.y} ${lineEndX},${callout.y}`} style={{ transition: 'all 150ms ease', strokeLinejoin: 'round', strokeLinecap: 'round' }} />
              <text x={labelX} y={callout.y} textAnchor={callout.anchor} dominantBaseline="middle" style={{ fontSize: '12px', fill: active ? '#7C4DFF' : (isDark ? '#f4f4f5' : '#27272a'), fontWeight: 700, paintOrder: 'stroke', stroke: isDark ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.96)', strokeWidth: 5.2, strokeLinejoin: 'round', strokeLinecap: 'round' }}>{durationText}</text>
            </g>
          )
        })}

        {withLabels && arcs.map((arc) => {
          if (arc.segment.ratio < 0.12) return null
          var labelR = radius * 0.58
          var lx = center + Math.cos(arc.mid) * labelR
          var ly = center + Math.sin(arc.mid) * labelR
          var text = arc.segment.label.length > 6 ? `${arc.segment.label.slice(0, 6)}...` : arc.segment.label
          return <text key={`inner-label-${arc.index}-${size}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '10px', fill: isDark ? '#f4f4f5' : '#27272a', fontWeight: 600, pointerEvents: 'none' }}>{text}</text>
        })}

        <circle cx={center} cy={center} r={radius} fill="none" stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} strokeWidth={0.8} />
      </svg>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
        style={{
          background: isOpen
            ? (isDark ? 'rgba(124,77,255,0.18)' : 'rgba(124,77,255,0.1)')
            : (isDark ? 'rgba(39,39,42,0.6)' : 'rgba(255,255,255,0.82)'),
          border: isOpen
            ? '1px solid rgba(124,77,255,0.28)'
            : (isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.6)'),
          boxShadow: hasData
            ? '0 2px 12px -2px rgba(124,77,255,0.18)'
            : (isDark ? '0 2px 8px rgba(0,0,0,0.14)' : '0 2px 8px rgba(0,0,0,0.03)'),
          transform: 'translateZ(0)',
        }}
        title="查看专注统计"
      >
        {hasData ? (
          <div className="transition-transform duration-200" style={{ transform: isOpen ? 'scale(1.05)' : 'scale(1)' }}>
            {renderPie(30, 11)}
          </div>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" strokeDasharray="2.5 3" />
          </svg>
        )}
      </button>

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center"
          style={{
            background: isDark ? 'rgba(0,0,0,0.48)' : 'rgba(24,24,27,0.24)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            padding: '24px 30px',
            animation: 'fadeIn 0.25s ease-out',
          }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[620px] max-h-[88vh] overflow-y-auto rounded-3xl"
            style={{
              background: isDark ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(124,77,255,0.14)',
              boxShadow: isDark ? '0 24px 56px -16px rgba(0,0,0,0.52)' : '0 20px 46px -16px rgba(124,77,255,0.3)',
              padding: '16px 16px 14px',
              animation: 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold tracking-wide" style={{ color: isDark ? '#e4e4e7' : '#52525b' }}>今日专注</span>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{ color: isDark ? '#a1a1aa' : '#71717a', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(124,77,255,0.08)' }}
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mb-4">
              <div className="text-[11px]" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>
                总时长 {hasData ? formatDurationCN(totalDuration) : '0分'}
              </div>
            </div>

            {hasData ? (
              <>
                <div className="flex flex-col items-center">
                  <div className="w-full flex items-center justify-center">
                    <div className="relative w-[252px] h-[252px] flex items-center justify-center">
                      {renderPie(252, 82, true, true)}
                    </div>
                  </div>
                  <div className="mt-1 text-[15px] font-semibold tabular-nums" style={{ color: isDark ? '#f4f4f5' : '#27272a' }}>
                    总计 {formatDurationCN(totalDuration)}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-[12px] mb-2 font-semibold" style={{ color: isDark ? '#d4d4d8' : '#52525b' }}>模块时长分布</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {segments.map((s, idx) => {
                      var active = hoveredIndex === idx
                      return (
                        <div
                          key={`${s.label}-${idx}-row`}
                          className="flex items-start justify-between rounded-lg transition-all duration-150"
                          style={{
                            padding: '4px 6px',
                            background: active ? (isDark ? 'rgba(124,77,255,0.14)' : 'rgba(124,77,255,0.08)') : 'transparent',
                            border: active ? '1px solid rgba(124,77,255,0.24)' : '1px solid transparent',
                          }}
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ background: s.color, boxShadow: active ? `0 0 0 3px ${s.color}30` : 'none' }} />
                            <div className="min-w-0">
                              <div className="text-[13px] leading-tight whitespace-normal break-words" style={{ color: isDark ? '#f4f4f5' : '#27272a', fontWeight: active ? 700 : 600 }}>{s.label}</div>
                              <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: isDark ? '#a1a1aa' : '#71717a' }}>{formatDurationCN(s.duration)}</div>
                            </div>
                          </div>
                          <span className="text-[13px] font-semibold tabular-nums ml-2" style={{ color: active ? '#7C4DFF' : (isDark ? '#d4d4d8' : '#52525b') }}>
                            {(s.ratio * 100).toFixed(1)}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.6">
                  <circle cx="12" cy="12" r="9" strokeDasharray="2.5 3" />
                </svg>
                <span className="text-[12px]" style={{ color: isDark ? '#71717a' : '#a1a1aa' }}>今天还没有专注时长记录</span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
