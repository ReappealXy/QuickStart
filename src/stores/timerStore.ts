import { create } from 'zustand'

interface TimerState {
  // Active timer info
  activeTimerId: string | null
  activeTaskName: string | null
  activeTaskDate: string | null  // Date when timer was started (YYYY-MM-DD)
  timerLimit: number | null  // Total seconds for countdown (null = stopwatch)
  timerSpent: number  // Already spent before this session
  startedAt: number | null  // Timestamp when current session started
  endAt: number | null  // For countdown: when it will end

  // UI state
  timerFinishedModal: { taskName: string; duration: number } | null
  timerFinishedId: string | null

  // Actions
  startTimer: (id: string, taskName: string, date: string, limit: number | null, spent: number) => void
  stopTimer: () => { elapsed: number; taskId: string | null; taskDate: string | null }
  setTimerFinishedModal: (modal: { taskName: string; duration: number } | null) => void
  setTimerFinishedId: (id: string | null) => void
  getRemaining: () => number
  getElapsed: () => number
  reset: () => void
}

const STORAGE_KEY = 'quickstart_active_timer'

function loadFromStorage(): Partial<TimerState> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      // Check if timer already ended
      if (data.endAt && Date.now() >= data.endAt) {
        localStorage.removeItem(STORAGE_KEY)
        return {
          timerFinishedModal: {
            taskName: data.activeTaskName || '任务',
            duration: data.timerLimit || 0,
          },
        }
      }
      return data
    }
  } catch (e) {
    console.error('Failed to load timer from storage:', e)
  }
  return {}
}

function saveToStorage(state: TimerState) {
  if (state.activeTimerId) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeTimerId: state.activeTimerId,
      activeTaskName: state.activeTaskName,
      activeTaskDate: state.activeTaskDate,
      timerLimit: state.timerLimit,
      timerSpent: state.timerSpent,
      startedAt: state.startedAt,
      endAt: state.endAt,
    }))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

const initialState = {
  activeTimerId: null,
  activeTaskName: null,
  activeTaskDate: null,
  timerLimit: null,
  timerSpent: 0,
  startedAt: null,
  endAt: null,
  timerFinishedModal: null,
  timerFinishedId: null,
  ...loadFromStorage(),
}

export const useTimerStore = create<TimerState>((set, get) => ({
  ...initialState,

  startTimer: (id, taskName, date, limit, spent) => {
    const now = Date.now()
    const isCountdown = limit !== null && limit > 0
    const remaining = isCountdown ? (limit - spent) : 0
    const endAt = isCountdown ? now + remaining * 1000 : null

    const newState = {
      activeTimerId: id,
      activeTaskDate: date,
      activeTaskName: taskName,
      timerLimit: limit,
      timerSpent: spent,
      startedAt: now,
      endAt,
      timerFinishedId: null,
    }

    set(newState)
    saveToStorage({ ...get(), ...newState })
  },

  stopTimer: () => {
    const { startedAt, activeTimerId, activeTaskDate } = get()
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0

    set({
      activeTimerId: null,
      activeTaskName: null,
      activeTaskDate: null,
      timerLimit: null,
      timerSpent: 0,
      startedAt: null,
      endAt: null,
    })
    localStorage.removeItem(STORAGE_KEY)

    return { elapsed, taskId: activeTimerId, taskDate: activeTaskDate }
  },

  setTimerFinishedModal: (modal) => set({ timerFinishedModal: modal }),
  setTimerFinishedId: (id) => set({ timerFinishedId: id }),

  getRemaining: () => {
    const { endAt, timerLimit, timerSpent, startedAt } = get()
    if (!startedAt) return 0
    if (endAt) {
      return Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
    }
    return 0
  },

  getElapsed: () => {
    const { startedAt, timerSpent } = get()
    if (!startedAt) return timerSpent
    return timerSpent + Math.floor((Date.now() - startedAt) / 1000)
  },

  reset: () => {
    set({
      activeTimerId: null,
      activeTaskName: null,
      timerLimit: null,
      timerSpent: 0,
      startedAt: null,
      endAt: null,
      timerFinishedModal: null,
      timerFinishedId: null,
    })
    localStorage.removeItem(STORAGE_KEY)
  },
}))

// Global timer tick manager
let tickInterval: ReturnType<typeof setInterval> | null = null
let finishedTriggered = false

export interface TimerFinishCallback {
  onTick: () => void
  onFinished: (taskName: string, duration: number, taskId: string, taskDate: string) => void
  onUpdateTask: (taskId: string, taskDate: string, updates: { timerSpent?: number; completedDuration?: number }) => void
}

let globalCallbacks: TimerFinishCallback | null = null

export function setTimerCallbacks(callbacks: TimerFinishCallback) {
  globalCallbacks = callbacks
}

export function startGlobalTimerTick() {
  if (tickInterval) return

  finishedTriggered = false

  tickInterval = setInterval(() => {
    const state = useTimerStore.getState()
    if (!state.activeTimerId || !state.startedAt) return

    globalCallbacks?.onTick()

    // Check if countdown finished
    if (state.endAt && Date.now() >= state.endAt && !finishedTriggered) {
      finishedTriggered = true
      const taskId = state.activeTimerId
      const taskDate = state.activeTaskDate
      const taskName = state.activeTaskName || '任务'
      const duration = state.timerLimit || 0

      // Update task data before stopping timer
      if (globalCallbacks && taskId && taskDate) {
        globalCallbacks.onUpdateTask(taskId, taskDate, {
          timerSpent: duration,
          completedDuration: duration,
        })
      }

      // Set finished ID for ripple effect
      state.setTimerFinishedId(taskId)
      setTimeout(() => state.setTimerFinishedId(null), 1500)

      // Stop the timer
      state.stopTimer()

      // Trigger finished callback
      if (globalCallbacks && taskId && taskDate) {
        globalCallbacks.onFinished(taskName, duration, taskId, taskDate)
      }

      // System notification if not focused
      if (!document.hasFocus() && 'Notification' in window) {
        const formatTime = (s: number) => {
          const m = Math.floor(s / 60)
          const sec = s % 60
          return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        }
        if (Notification.permission === 'granted') {
          new Notification('计时结束', {
            body: `「${taskName}」${formatTime(duration)} 已完成`,
          })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission()
        }
      }
    }
  }, 1000)
}

export function stopGlobalTimerTick() {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

// Handle visibility change
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Force re-check on visibility
      const state = useTimerStore.getState()
      if (state.activeTimerId && state.endAt && Date.now() >= state.endAt && !finishedTriggered) {
        finishedTriggered = true
        const taskId = state.activeTimerId
        const taskDate = state.activeTaskDate
        const taskName = state.activeTaskName || '任务'
        const duration = state.timerLimit || 0

        // Update task data
        if (globalCallbacks && taskId && taskDate) {
          globalCallbacks.onUpdateTask(taskId, taskDate, {
            timerSpent: duration,
            completedDuration: duration,
          })
        }

        state.setTimerFinishedId(taskId)
        setTimeout(() => state.setTimerFinishedId(null), 1500)

        state.stopTimer()
        state.setTimerFinishedModal({ taskName, duration })
      }
    }
  })
}
