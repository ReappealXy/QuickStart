import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react'
import TitleBar from './components/Layout/TitleBar'
import FeatureList, { ALL_FEATURES } from './components/Layout/FeatureList'
import NotesTab from './components/Notes/NotesTab'
import ErrorBoundary from './components/ErrorBoundary'

var TodoTab = lazy(() => import('./components/Todo/TodoTab'))
import TranslatorTab from './components/Translator/TranslatorTab'
import AITab from './components/AI/AITab'
import ClipboardTab from './components/Clipboard/ClipboardTab'
import PromptTab from './components/Prompts/PromptTab'
import SettingsTab from './components/Settings/SettingsTab'
import { useSettingsStore, type TabType } from './stores/settingsStore'
import { useTodoStore } from './stores/todoStore'
import { useTimerStore, startGlobalTimerTick, stopGlobalTimerTick, setTimerCallbacks } from './stores/timerStore'

const COMPACT_HEIGHT = 140
const EXPANDED_HEIGHT = 540

const FEATURE_TITLES: Record<string, string> = {
  notes: '笔记',
  todo: '清单',
  translate: '翻译',
  ai: 'AI 助手',
  clipboard: '剪贴板',
  prompts: '提示词',
  settings: '设置',
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function App() {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const loadConfig = useSettingsStore((s) => s.loadConfig)

  const timerFinishedModal = useTimerStore((s) => s.timerFinishedModal)
  const setTimerFinishedModal = useTimerStore((s) => s.setTimerFinishedModal)
  const activeTimerId = useTimerStore((s) => s.activeTimerId)

  const [, forceUpdate] = useState(0)
  const [searchMode, setSearchMode] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

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

  const handleSelectFeature = useCallback((tab: TabType) => {
    setActiveTab(tab)
    setSearchMode(false)
    setSearchQuery('')
    window.api?.window?.setHeight?.(EXPANDED_HEIGHT)
  }, [setActiveTab])

  const handleBack = useCallback(() => {
    setSearchMode(true)
    setSearchQuery('')
    window.api?.window?.setHeight?.(COMPACT_HEIGHT)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!searchMode) {
          handleBack()
        } else {
          window.api?.window?.hide?.()
        }
      }
      if (e.ctrlKey && e.key >= '1' && e.key <= '3') {
        e.preventDefault()
        const tabs: TabType[] = ['notes', 'todo', 'translate']
        handleSelectFeature(tabs[parseInt(e.key) - 1])
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        handleSelectFeature('settings')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchMode, handleBack, handleSelectFeature])

  const filteredFeatures = useMemo(() => {
    if (!searchQuery.trim()) return ALL_FEATURES
    const q = searchQuery.toLowerCase()
    return ALL_FEATURES.filter(
      (f) => f.label.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const handleSearchEnter = useCallback(() => {
    if (filteredFeatures.length > 0) {
      handleSelectFeature(filteredFeatures[0].id)
    }
  }, [filteredFeatures, handleSelectFeature])

  var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="qs-root">
      <TitleBar
        searchMode={searchMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onBack={handleBack}
        featureTitle={FEATURE_TITLES[activeTab] || activeTab}
        onSearchEnter={handleSearchEnter}
      />

      {searchMode ? (
        <div className="qs-home">
          <FeatureList features={filteredFeatures} onSelect={handleSelectFeature} />
        </div>
      ) : (
        <div className="qs-feature-content">
          {activeTab === 'notes' && <NotesTab />}
          {activeTab === 'todo' && (
            <ErrorBoundary>
              <Suspense fallback={<div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '13px' }}>加载中…</div>}>
                <TodoTab />
              </Suspense>
            </ErrorBoundary>
          )}
          {activeTab === 'translate' && <TranslatorTab />}
          {activeTab === 'ai' && <AITab />}
          {activeTab === 'clipboard' && <ClipboardTab />}
          {activeTab === 'prompts' && <PromptTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      )}

      {timerFinishedModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            zIndex: 9999,
            background: 'rgba(0,0,0,0.4)',
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
              borderRadius: '20px',
              background: isDark ? 'rgba(40, 40, 45, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.3)',
              animation: 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-center rounded-full mb-4"
              style={{
                width: '56px',
                height: '56px',
                background: '#67c23a',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h3 className="text-[17px] font-bold mb-2" style={{ color: isDark ? '#e0e0e0' : '#1a1a1a' }}>
              计时结束
            </h3>

            <p
              className="text-[13px] text-center mb-1 px-4"
              style={{
                color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {timerFinishedModal.taskName}
            </p>

            <p className="text-[12px] font-medium mb-5" style={{ color: '#409eff' }}>
              专注时长：{formatTimer(timerFinishedModal.duration)}
            </p>

            <button
              onClick={() => setTimerFinishedModal(null)}
              className="w-full flex items-center justify-center text-[14px] font-semibold text-white"
              style={{
                height: '40px',
                borderRadius: '10px',
                background: '#409eff',
                border: 'none',
                cursor: 'pointer',
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
