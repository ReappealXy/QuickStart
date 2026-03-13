import { useState, useEffect, useRef, useCallback } from 'react'

interface TimerDialModalProps {
  isDark: boolean
  onClose: () => void
  onStartCountUp: () => void
  onStartCountDown: (minutes: number) => void
}

/**
 * 小米时钟风格计时器弹窗
 * 支持正计时（滑动开始）和倒计时（圆形拨盘 + 快捷时长）
 * @param props.isDark 暗色模式
 * @param props.onClose 关闭回调
 * @param props.onStartCountUp 正计时开始回调
 * @param props.onStartCountDown 倒计时开始回调（参数为分钟数）
 */
export default function TimerDialModal({ isDark, onClose, onStartCountUp, onStartCountDown }: TimerDialModalProps) {
  var [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch')
  var [dialMinutes, setDialMinutes] = useState(25)
  var [slideProgress, setSlideProgress] = useState(0)
  var [isDragging, setIsDragging] = useState(false)
  var [isDialDragging, setIsDialDragging] = useState(false)
  var dialRef = useRef<HTMLDivElement>(null)
  var sliderRef = useRef<HTMLDivElement>(null)

  /** @param minutes 分钟数转角度（12点钟为0°，顺时针增加） */
  var angleFromMinutes = (minutes: number): number => (minutes / 60) * 360

  // 滑动开始处理
  var handleSlideStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  var handleSlideMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !sliderRef.current) return
    var rect = sliderRef.current.getBoundingClientRect()
    var clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    var thumbWidth = 48
    var padding = 4
    var availableWidth = rect.width - thumbWidth - padding * 2
    var progress = Math.max(0, Math.min(1, (clientX - rect.left - padding - thumbWidth / 2) / availableWidth))
    setSlideProgress(progress)
  }, [isDragging])

  var handleSlideEnd = useCallback(() => {
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

  // 拨盘旋转处理
  var handleDialStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDialDragging(true)
  }

  var handleDialMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDialDragging || !dialRef.current) return
    var rect = dialRef.current.getBoundingClientRect()
    var centerX = rect.left + rect.width / 2
    var centerY = rect.top + rect.height / 2
    var clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    var clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    var dx = clientX - centerX
    var dy = clientY - centerY
    var degrees = Math.atan2(dx, -dy) * (180 / Math.PI)
    degrees = (degrees + 360) % 360
    var minutes = Math.round(degrees / 6)
    setDialMinutes(Math.max(1, Math.min(60, minutes === 0 ? 60 : minutes)))
  }, [isDialDragging])

  var handleDialEnd = useCallback(() => {
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

  var dialAngle = angleFromMinutes(dialMinutes)

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
        {/* 分段选择器 */}
        <div
          className="relative flex w-full mb-6 overflow-hidden"
          style={{
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.06)',
            borderRadius: '12px',
            padding: '3px',
            height: '44px',
          }}
        >
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
            style={{ color: mode === 'stopwatch' ? '#7C4DFF' : (isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa'), height: '100%' }}
          >
            正计时
          </button>
          <button
            onClick={() => setMode('countdown')}
            className="relative flex-1 flex items-center justify-center text-[13px] font-semibold transition-colors duration-300 z-10"
            style={{ color: mode === 'countdown' ? '#7C4DFF' : (isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa'), height: '100%' }}
          >
            倒计时
          </button>
        </div>

        {/* 正计时模式 */}
        {mode === 'stopwatch' && (
          <div className="w-full flex flex-col items-center" style={{ animation: 'timerContentIn 0.35s ease-out' }}>
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
              <span className="font-mono text-[34px] font-bold tracking-tight" style={{ color: '#7C4DFF' }}>00:00</span>
            </div>

            <p className="text-[12px] mb-5" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa' }}>
              滑动开始计时
            </p>

            {/* 滑动开始轨道 */}
            <div
              ref={sliderRef}
              className="relative w-full rounded-full"
              style={{
                height: '56px',
                background: isDark ? 'rgba(124, 77, 255, 0.12)' : 'rgba(124, 77, 255, 0.06)',
                border: isDark ? '1px solid rgba(124, 77, 255, 0.2)' : '1px solid rgba(124, 77, 255, 0.1)',
              }}
            >
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

        {/* 倒计时模式 */}
        {mode === 'countdown' && (
          <div className="w-full flex flex-col items-center" style={{ animation: 'timerContentIn 0.35s ease-out' }}>
            {/* 圆形拨盘 */}
            <div
              ref={dialRef}
              className="relative cursor-pointer select-none"
              style={{ width: '180px', height: '180px', marginBottom: '20px' }}
              onMouseDown={handleDialStart}
              onTouchStart={handleDialStart}
            >
              {(() => {
                var size = 180
                var strokeWidth = 12
                var trackRadius = (size - strokeWidth) / 2
                var circumference = 2 * Math.PI * trackRadius
                var arcLength = (dialAngle / 360) * circumference
                return (
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={size / 2} cy={size / 2} r={trackRadius} fill="none" stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0, 0, 0, 0.06)'} strokeWidth={strokeWidth} />
                    <circle cx={size / 2} cy={size / 2} r={trackRadius} fill="none" stroke="url(#dialGradient)" strokeWidth={strokeWidth} strokeDasharray={`${arcLength} ${circumference}`} style={{ transition: isDialDragging ? 'none' : 'stroke-dasharray 0.15s ease-out' }} />
                    <defs>
                      <linearGradient id="dialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#7C4DFF" />
                        <stop offset="100%" stopColor="#A78BFA" />
                      </linearGradient>
                    </defs>
                  </svg>
                )
              })()}

              {/* 刻度标记 */}
              {[...Array(12)].map((_, i) => {
                var tickAngle = i * 30
                var isActive = tickAngle < dialAngle || (dialAngle === 360 && tickAngle === 0)
                var isMajor = i % 3 === 0
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
                      background: isActive ? '#fff' : (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0, 0, 0, 0.2)'),
                      transformOrigin: '50% 78px',
                      transform: `translateX(-50%) rotate(${tickAngle}deg)`,
                      transition: 'background 0.15s',
                      boxShadow: isActive ? '0 0 4px rgba(124,77,255,0.5)' : 'none',
                    }}
                  />
                )
              })}

              {/* 内圆 */}
              <div
                className="absolute rounded-full flex flex-col items-center justify-center"
                style={{
                  top: '20px', left: '20px', right: '20px', bottom: '20px',
                  background: isDark ? 'rgba(30,30,35,0.95)' : 'rgba(255, 255, 255, 0.98)',
                  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.04)',
                }}
              >
                <span className="font-mono text-[44px] font-bold tracking-tight" style={{ color: '#7C4DFF', lineHeight: 1 }}>{dialMinutes}</span>
                <span className="text-[12px] font-medium mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#a1a1aa' }}>分钟</span>
              </div>

              {/* 拨盘把手 */}
              <div
                className="absolute"
                style={{
                  width: '16px', height: '16px',
                  left: 'calc(50% - 8px)', top: '-2px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7C4DFF 0%, #A78BFA 100%)',
                  boxShadow: '0 2px 8px rgba(124, 77, 255, 0.5)',
                  border: '2px solid #fff',
                  transformOrigin: '8px 92px',
                  transform: `rotate(${dialAngle}deg)`,
                  transition: isDialDragging ? 'none' : 'transform 0.15s ease-out',
                }}
              />
            </div>

            {/* 快捷时长 */}
            <div className="flex justify-center flex-nowrap" style={{ gap: '10px', marginBottom: '16px' }}>
              {[5, 15, 25, 45].map((m) => {
                var isSelected = dialMinutes === m
                return (
                  <button
                    key={m}
                    onClick={() => setDialMinutes(m)}
                    className="flex items-center justify-center text-[13px] font-medium transition-all duration-200"
                    style={{
                      height: '34px', minWidth: '64px', padding: '0 12px', borderRadius: '17px',
                      whiteSpace: 'nowrap', flexShrink: 0,
                      background: isSelected ? (isDark ? 'rgba(124, 77, 255, 0.18)' : 'rgba(124, 77, 255, 0.1)') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0, 0, 0, 0.05)'),
                      color: isSelected ? '#7C4DFF' : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0, 0, 0, 0.45)'),
                      border: isSelected ? '1px solid rgba(124, 77, 255, 0.2)' : '1px solid transparent',
                    }}
                  >
                    {m}分钟
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => { onStartCountDown(dialMinutes); onClose() }}
              className="w-full flex items-center justify-center text-[15px] font-semibold text-white transition-all duration-200"
              style={{
                height: '46px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #7C4DFF 0%, #9575FF 100%)',
                boxShadow: '0 2px 12px rgba(124, 77, 255, 0.25)',
              }}
            >
              开始 {dialMinutes} 分钟
            </button>

            <button
              onClick={onClose}
              className="w-full flex items-center justify-center text-[14px] font-medium transition-all duration-200"
              style={{
                height: '44px', marginTop: '10px', borderRadius: '12px',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.04)',
                color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0, 0, 0, 0.5)',
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
