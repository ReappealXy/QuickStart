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
    export: (startDate: string, endDate: string, format: 'md' | 'pdf', wsId?: string) =>
      ipcRenderer.invoke('notes:export', startDate, endDate, format, wsId),
    exportSingle: (wsId: string, noteId: string, format: 'md' | 'pdf') =>
      ipcRenderer.invoke('notes:exportSingle', wsId, noteId, format),
    updateStatusIcon: (wsId: string, noteId: string, statusIcon: string) =>
      ipcRenderer.invoke('notes:updateStatusIcon', wsId, noteId, statusIcon),
    openPath: (filePath: string) => ipcRenderer.invoke('notes:openPath', filePath),
  },
  todos: {
    list: () => ipcRenderer.invoke('todos:list'),
    add: (item: Record<string, unknown>) => ipcRenderer.invoke('todos:add', item),
    update: (id: string, partial: Record<string, unknown>) => ipcRenderer.invoke('todos:update', id, partial),
    delete: (id: string) => ipcRenderer.invoke('todos:delete', id),
    reorder: (ids: string[]) => ipcRenderer.invoke('todos:reorder', ids),
    monthSummary: (yearMonth: string) => ipcRenderer.invoke('todos:monthSummary', yearMonth),
    export: (startDate: string, endDate: string, format: 'md' | 'pdf') =>
      ipcRenderer.invoke('todos:export', startDate, endDate, format),
  },
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    getActive: () => ipcRenderer.invoke('workspace:getActive'),
    setActive: (wsId: string) => ipcRenderer.invoke('workspace:setActive', wsId),
    create: (name: string, color: string) => ipcRenderer.invoke('workspace:create', name, color),
    rename: (wsId: string, name: string, color?: string) => ipcRenderer.invoke('workspace:rename', wsId, name, color),
    delete: (wsId: string) => ipcRenderer.invoke('workspace:delete', wsId),
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
    getRootPath: () => ipcRenderer.invoke('storage:getRootPath'),
    setRootPath: (newPath: string | null, migrate?: boolean) => ipcRenderer.invoke('storage:setRootPath', newPath, migrate ?? true),
    getTodosPath: () => ipcRenderer.invoke('storage:getTodosPath'),
    setTodosPath: (newPath: string | null, migrate?: boolean) => ipcRenderer.invoke('storage:setTodosPath', newPath, migrate ?? true),
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
    exportSession: (sessionId: string, format: 'md' | 'pdf') => ipcRenderer.invoke('ai:exportSession', sessionId, format),
    onToken: (callback: (data: { content?: string; reasoning?: string; done: boolean; error?: string }) => void) => {
      const handler = (_e: unknown, data: { content?: string; reasoning?: string; done: boolean; error?: string }) => callback(data)
      ipcRenderer.on('ai:token', handler)
      return () => ipcRenderer.removeListener('ai:token', handler)
    }
  },
  window: {
    hide: () => ipcRenderer.send('window:hide'),
    minimize: () => ipcRenderer.send('window:minimize'),
    togglePin: () => ipcRenderer.send('window:toggle-pin'),
    setHeight: (height: number) => ipcRenderer.send('window:set-height', height),
  },
  floating: {
    create: () => ipcRenderer.invoke('floating:create'),
    close: () => ipcRenderer.invoke('floating:close'),
    setOpacity: (value: number) => ipcRenderer.invoke('floating:setOpacity', value),
    isOpen: () => ipcRenderer.invoke('floating:isOpen'),
    setPinned: (pinned: boolean) => ipcRenderer.invoke('floating:setPinned', pinned),
    isPinned: () => ipcRenderer.invoke('floating:isPinned'),
    setAutoShow: (enabled: boolean) => ipcRenderer.invoke('floating:setAutoShow', enabled),
    getAutoShow: () => ipcRenderer.invoke('floating:getAutoShow'),
    getBounds: () => ipcRenderer.invoke('floating:getBounds'),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('floating:setBounds', bounds),
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
  prompts: {
    list: () => ipcRenderer.invoke('prompts:list'),
    save: (prompt: { id?: string; name: string; tag: string; content: string; isPinned?: boolean }) =>
      ipcRenderer.invoke('prompts:save', prompt),
    delete: (id: string) => ipcRenderer.invoke('prompts:delete', id),
    import: (items: unknown[]) => ipcRenderer.invoke('prompts:import', items),
    export: () => ipcRenderer.invoke('prompts:export'),
    getStoragePath: () => ipcRenderer.invoke('prompts:getStoragePath'),
    setStoragePath: (newPath: string | null, migrate?: boolean) => ipcRenderer.invoke('prompts:setStoragePath', newPath, migrate),
  },
  clipboard: {
    getHistory: (limit?: number, offset?: number) =>
      ipcRenderer.invoke('clipboard:getHistory', limit, offset),
    writeBack: (itemId: string) =>
      ipcRenderer.invoke('clipboard:writeBack', itemId),
    deleteItem: (itemId: string) =>
      ipcRenderer.invoke('clipboard:deleteItem', itemId),
    updateItem: (itemId: string, content: string) =>
      ipcRenderer.invoke('clipboard:updateItem', itemId, content),
    openInFolder: (imagePath: string) =>
      ipcRenderer.invoke('clipboard:openInFolder', imagePath),
    clearHistory: () => ipcRenderer.invoke('clipboard:clearHistory'),
    getStoragePath: () => ipcRenderer.invoke('clipboard:getStoragePath'),
    setStoragePath: (newPath: string | null, migrate?: boolean) =>
      ipcRenderer.invoke('clipboard:setStoragePath', newPath, migrate ?? true),
    openStorageDir: () => ipcRenderer.invoke('clipboard:openStorageDir'),
    onNewItem: (callback: (item: { id: string; type: string; content: string; preview: string; timestamp: number; imagePath?: string }) => void) => {
      const handler = (_e: unknown, item: { id: string; type: string; content: string; preview: string; timestamp: number; imagePath?: string }) => callback(item)
      ipcRenderer.on('clipboard:newItem', handler)
      return () => ipcRenderer.removeListener('clipboard:newItem', handler)
    }
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  }
})
