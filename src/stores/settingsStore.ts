import { create } from 'zustand'

export type TabType = 'notes' | 'todo' | 'translate' | 'ai' | 'settings'
export type ThemeType = 'light' | 'dark' | 'system'

interface SettingsState {
  activeTab: TabType
  theme: ThemeType
  config: Record<string, unknown>
  // Workspace state
  activeWorkspaceId: string
  workspaces: Workspace[]
  // Actions
  setActiveTab: (tab: TabType) => void
  setTheme: (theme: ThemeType) => void
  loadConfig: () => Promise<void>
  saveConfig: (partial: Record<string, unknown>) => Promise<void>
  // Workspace actions
  loadWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  activeTab: 'notes',
  theme: 'light',
  config: {},
  activeWorkspaceId: 'default',
  workspaces: [],

  setActiveTab: (tab) => set({ activeTab: tab }),

  setTheme: async (theme) => {
    set({ theme })
    await window.api.config.set({ theme })
  },

  loadConfig: async () => {
    try {
      const config = await window.api.config.get()
      const wsId = await window.api.workspace.getActive()
      const workspaces = await window.api.workspace.list()
      set({
        config,
        theme: (config.theme as ThemeType) || 'light',
        activeWorkspaceId: wsId || 'default',
        workspaces,
      })
    } catch {
      // ignore
    }
  },

  saveConfig: async (partial) => {
    await window.api.config.set(partial)
    const config = await window.api.config.get()
    set({ config })
  },

  loadWorkspaces: async () => {
    try {
      const workspaces = await window.api.workspace.list()
      const wsId = await window.api.workspace.getActive()
      set({ workspaces, activeWorkspaceId: wsId || 'default' })
    } catch {}
  },

  setActiveWorkspace: async (id: string) => {
    try {
      await window.api.workspace.setActive(id)
      set({ activeWorkspaceId: id })
    } catch {}
  },

}))
