import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import TitleBar from './components/Layout/TitleBar'
import TabBar from './components/Layout/TabBar'
import NotesTab from './components/Notes/NotesTab'
import ErrorBoundary from './components/ErrorBoundary'

var TodoTab = lazy(() => import('./components/Todo/TodoTab'))
import TranslatorTab from './components/Translator/TranslatorTab'
import AITab from './components/AI/AITab'
import ClipboardTab from './components/Clipboard/ClipboardTab'
import PromptTab from './components/Prompts/PromptTab'
import ToolsTab from './components/Tools/ToolsTab'
import ToolSubPageHeader from './components/Tools/ToolSubPageHeader'
import SettingsTab from './components/Settings/SettingsTab'
import { useSettingsStore } from './stores/settingsStore'
import { useTodoStore } from './stores/todoStore'
import { useTimerStore, startGlobalTimerTick, stopGlobalTimerTick, setTimerCallbacks } from './stores/timerStore'

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function App() {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const loadConfig = useSettingsStore((s) => s.loadConfig)

  const timerFinishedModal = useTimerStore((s) => s.timerFinishedModal)
  const setTimerFinishedModal = useTimerStore((s) => s.setTimerFinishedModal)
  const activeTimerId = useTimerStore((s) => s.activeTimerId)

  const [, forceUpdate] = useState(0)

  // Setup timer callbacks for updating todo items
  useEffect(() => {
    setTimerCallbacks({
      onTick: () => forceUpdate((n) => n + 1),
      onFinished: (taskName, duration) => {
        setTimerFinishedModal({ taskName, duration })
      },
      onUpdateTask: async (taskId, _taskDate, updates) => {
        await useTodoStore.getState().updateItem(taskId, updates)
      },
    })
  }, [setTimerFinishedModal])

  // Start global timer tick when there's an active timer
  useEffect(() => {
    if (activeTimerId) {
      startGlobalTimerTick()
    } else {
      stopGlobalTimerTick()
    }
    return () => stopGlobalTimerTick()
  }, [activeTimerId])

  var theme = useSettingsStore((s) => s.theme)

  useEffect(() => { loadConfig() }, [loadConfig])

  // 主题跟随 store
  useEffect(() => {
    var applyTheme = (dark: boolean) => {
      if (dark) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    }
    if (theme === 'system') {
      var mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches)
      var handler = (e: MediaQueryListEvent) => applyTheme(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
    applyTheme(theme === 'dark')
  }, [theme])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.api?.window?.hide?.()
      if (e.ctrlKey && e.key >= '1' && e.key <= '3') {
        e.preventDefault()
        const tabs = ['notes', 'todo', 'tools'] as const
        useSettingsStore.getState().setActiveTab(tabs[parseInt(e.key) - 1])
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        useSettingsStore.getState().setActiveTab('settings')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="h-full flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #f8f7ff 0%, #f0eeff 30%, #f5f0ff 60%, #fdf2f8 100%)'
      }}
    >
      <TitleBar />
      <TabBar />
      <div className="flex-1 overflow-hidden animate-fadeIn">
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'todo' && (
          <ErrorBoundary>
            <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center', color: '#a1a1aa', fontSize: '13px' }}>加载中…</div>}>
              <TodoTab />
            </Suspense>
          </ErrorBoundary>
        )}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'translate' && (
          <div className="flex flex-col h-full">
            <ToolSubPageHeader title="翻译" />
            <div className="flex-1 min-h-0 overflow-hidden"><TranslatorTab /></div>
          </div>
        )}
        {activeTab === 'ai' && (
          <div className="flex flex-col h-full">
            <ToolSubPageHeader title="AI 助手" />
            <div className="flex-1 min-h-0 overflow-hidden"><AITab /></div>
          </div>
        )}
        {activeTab === 'clipboard' && (
          <div className="flex flex-col h-full">
            <ToolSubPageHeader title="剪贴板" />
            <div className="flex-1 min-h-0 overflow-hidden"><ClipboardTab /></div>
          </div>
        )}
        {activeTab === 'prompts' && (
          <div className="flex flex-col h-full">
            <ToolSubPageHeader title="提示词" />
            <div className="flex-1 min-h-0 overflow-hidden"><PromptTab /></div>
          </div>
        )}
        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {/* Global Timer Finished Modal */}
      {timerFinishedModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            zIndex: 9999,
            background: 'rgba(0,0,0,0.2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.25s ease-out',
          }}
          onClick={() => setTimerFinishedModal(null)}
        >
          <div
            className="flex flex-col items-center"
            style={{
              width: '300px',
              padding: '28px 24px',
              borderRadius: '24px',
              background: isDark ? 'rgba(30, 30, 35, 0.95)' : 'rgba(255, 255, 255, 0.92)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(255, 255, 255, 0.9)',
              boxShadow: isDark ? '0 16px 48px rgba(0, 0, 0, 0.5)' : '0 16px 48px rgba(0, 0, 0, 0.12)',
              animation: 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Checkmark Icon */}
            <div
              className="flex items-center justify-center rounded-full mb-4"
              style={{
                width: '64px',
                height: '64px',
                background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
                boxShadow: '0 8px 24px rgba(34, 197, 94, 0.35)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            {/* Title */}
            <h3 className="text-[18px] font-bold mb-2" style={{ color: isDark ? '#fff' : '#1a1a1a' }}>
              计时结束
            </h3>

            {/* Task Name */}
            <p
              className="text-[14px] text-center mb-1 px-4"
              style={{
                color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {timerFinishedModal.taskName}
            </p>

            {/* Duration */}
            <p className="text-[13px] font-medium mb-6" style={{ color: '#7C4DFF' }}>
              专注时长：{formatTimer(timerFinishedModal.duration)}
            </p>

            {/* Button */}
            <button
              onClick={() => setTimerFinishedModal(null)}
              className="w-full flex items-center justify-center text-[15px] font-semibold text-white transition-all duration-200"
              style={{
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #7C4DFF 0%, #9575FF 100%)',
                boxShadow: '0 2px 12px rgba(124, 77, 255, 0.25)',
              }}
            >
              知道了
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
