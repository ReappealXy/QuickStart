import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  notes: {
    list: (wsId: string) => ipcRenderer.invoke('notes:list', wsId),
    save: (wsId: string, note: Record<string, unknown>) =>
      ipcRenderer.invoke('notes:save', wsId, note),
    load: (wsId: string, noteId: string) =>
      ipcRenderer.invoke('notes:load', wsId, noteId),
    delete: (wsId: string, noteId: string) =>
      ipcRenderer.invoke('notes:delete', wsId, noteId),
    saveAttachment: (wsId: string, fileName: string, base64Data: string) =>
      ipcRenderer.invoke('notes:saveAttachment', wsId, fileName, base64Data),
    readAttachment: (filePath: string) =>
      ipcRenderer.invoke('notes:readAttachment', filePath),
    pasteImage: (wsId: string) =>
      ipcRenderer.invoke('notes:pasteImage', wsId),
    export: (startDate: string, endDate: string, format: 'md' | 'pdf') =>
      ipcRenderer.invoke('notes:export', startDate, endDate, format),
    openPath: (filePath: string) => ipcRenderer.invoke('notes:openPath', filePath),
  },
  todos: {
    load: (date: string) => ipcRenderer.invoke('todos:load', date),
    save: (date: string, data: unknown) => ipcRenderer.invoke('todos:save', date, data),
    monthSummary: (yearMonth: string) => ipcRenderer.invoke('todos:monthSummary', yearMonth),
    export: (startDate: string, endDate: string, format: 'md' | 'pdf') =>
      ipcRenderer.invoke('todos:export', startDate, endDate, format),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config: Record<string, unknown>) => ipcRenderer.invoke('config:set', config),
    getDataDir: () => ipcRenderer.invoke('config:getDataDir'),
    setHotkey: (hotkey: string) => ipcRenderer.invoke('config:setHotkey', hotkey),
  },
  attachments: {
    getPath: () => ipcRenderer.invoke('attachments:getPath'),
    getDefaultPath: () => ipcRenderer.invoke('attachments:getDefaultPath'),
    selectDir: () => ipcRenderer.invoke('attachments:selectDir'),
    setPath: (newPath: string, migrate: boolean) =>
      ipcRenderer.invoke('attachments:setPath', newPath, migrate),
    resetPath: (migrate: boolean) =>
      ipcRenderer.invoke('attachments:resetPath', migrate)
  },
  storage: {
    selectDir: (title: string) => ipcRenderer.invoke('storage:selectDir', title),
    getNotesPath: () => ipcRenderer.invoke('storage:getNotesPath'),
    getDefaultNotesPath: () => ipcRenderer.invoke('storage:getDefaultNotesPath'),
    setNotesPath: (newPath: string, migrate: boolean) => ipcRenderer.invoke('storage:setNotesPath', newPath, migrate),
    resetNotesPath: (migrate: boolean) => ipcRenderer.invoke('storage:resetNotesPath', migrate),
    getTodosPath: () => ipcRenderer.invoke('storage:getTodosPath'),
    getDefaultTodosPath: () => ipcRenderer.invoke('storage:getDefaultTodosPath'),
    setTodosPath: (newPath: string, migrate: boolean) => ipcRenderer.invoke('storage:setTodosPath', newPath, migrate),
    resetTodosPath: (migrate: boolean) => ipcRenderer.invoke('storage:resetTodosPath', migrate),
    clearNotes: () => ipcRenderer.invoke('storage:clearNotes'),
    clearTodos: () => ipcRenderer.invoke('storage:clearTodos'),
  },
  ai: {
    getNodes: () => ipcRenderer.invoke('ai:getNodes'),
    saveNode: (node: { id?: string; name: string; provider: string; apiKey: string; model: string; enabled: boolean }) =>
      ipcRenderer.invoke('ai:saveNode', node),
    deleteNode: (nodeId: string) => ipcRenderer.invoke('ai:deleteNode', nodeId),
    toggleNode: (nodeId: string) => ipcRenderer.invoke('ai:toggleNode', nodeId),
    reorderNodes: (ids: string[]) => ipcRenderer.invoke('ai:reorderNodes', ids),
    validate: (cfg: { provider: string; apiKey: string; model: string }) =>
      ipcRenderer.invoke('ai:validate', cfg),
    chat: (messages: { role: string; content: string }[]) =>
      ipcRenderer.invoke('ai:chat', messages),
    listSessions: () => ipcRenderer.invoke('ai:listSessions'),
    loadSession: (sessionId: string) => ipcRenderer.invoke('ai:loadSession', sessionId),
    saveSession: (session: { id: string; title: string; messages: unknown[]; updatedAt: number }) =>
      ipcRenderer.invoke('ai:saveSession', session),
    deleteSession: (sessionId: string) => ipcRenderer.invoke('ai:deleteSession', sessionId),
    selectFiles: () => ipcRenderer.invoke('ai:selectFiles'),
    readFileContent: (filePath: string) => ipcRenderer.invoke('ai:readFileContent', filePath),
    translate: (text: string, from: string, to: string) => ipcRenderer.invoke('ai:translate', text, from, to),
    hasTranslateNode: () => ipcRenderer.invoke('ai:hasTranslateNode'),
    onToken: (callback: (data: { content?: string; reasoning?: string; done: boolean; error?: string }) => void) => {
      const handler = (_e: unknown, data: { content?: string; reasoning?: string; done: boolean; error?: string }) => callback(data)
      ipcRenderer.on('ai:token', handler)
      return () => ipcRenderer.removeListener('ai:token', handler)
    }
  },
  window: {
    hide: () => ipcRenderer.send('window:hide'),
    minimize: () => ipcRenderer.send('window:minimize'),
    togglePin: () => ipcRenderer.send('window:toggle-pin')
  },
  app: {
    getAutoStart: () => ipcRenderer.invoke('app:getAutoStart'),
    setAutoStart: (enabled: boolean) => ipcRenderer.invoke('app:setAutoStart', enabled),
    relaunch: () => ipcRenderer.send('app:relaunch'),
    onAutoStartChanged: (callback: (enabled: boolean) => void) => {
      const handler = (_e: unknown, enabled: boolean) => callback(enabled)
      ipcRenderer.on('config:autoStartChanged', handler)
      return () => ipcRenderer.removeListener('config:autoStartChanged', handler)
    }
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  }
})
