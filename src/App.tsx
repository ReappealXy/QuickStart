import { useEffect } from 'react'
import TitleBar from './components/Layout/TitleBar'
import TabBar from './components/Layout/TabBar'
import NotesTab from './components/Notes/NotesTab'
import TodoTab from './components/Todo/TodoTab'
import TranslatorTab from './components/Translator/TranslatorTab'
import AITab from './components/AI/AITab'
import SettingsTab from './components/Settings/SettingsTab'
import { useSettingsStore } from './stores/settingsStore'

export default function App() {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const loadConfig = useSettingsStore((s) => s.loadConfig)

  useEffect(() => {
    loadConfig()
    // Ensure always light mode
    document.documentElement.classList.remove('dark')
  }, [loadConfig])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.api.window.hide()
      if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const tabs = ['notes', 'todo', 'translate', 'ai'] as const
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
        {activeTab === 'todo' && <TodoTab />}
        {activeTab === 'translate' && <TranslatorTab />}
        {activeTab === 'ai' && <AITab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
