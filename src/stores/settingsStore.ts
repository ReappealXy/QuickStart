import { create } from 'zustand'

export type TabType = 'notes' | 'todo' | 'translate' | 'ai' | 'settings'
export type ThemeType = 'light' | 'dark' | 'system'

interface SettingsState {
  activeTab: TabType
  theme: ThemeType
  config: Record<string, unknown>
  setActiveTab: (tab: TabType) => void
  setTheme: (theme: ThemeType) => void
  loadConfig: () => Promise<void>
  saveConfig: (partial: Record<string, unknown>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  activeTab: 'notes',
  theme: 'light',
  config: {},

  setActiveTab: (tab) => set({ activeTab: tab }),

  setTheme: async (theme) => {
    set({ theme })
    await window.api.config.set({ theme })
  },

  loadConfig: async () => {
    try {
      const config = await window.api.config.get()
      set({
        config,
        theme: (config.theme as ThemeType) || 'light'
      })
    } catch {
      // ignore
    }
  },

  saveConfig: async (partial) => {
    await window.api.config.set(partial)
    const config = await window.api.config.get()
    set({ config })
  }
}))
