/// <reference types="vite/client" />

interface Workspace {
  id: string
  name: string
  color: string
  folderName: string
}

interface Window {
  api: {
    notes: {
      list(wsId: string): Promise<{ workspace: unknown; notes: NoteMeta[] }>
      save(wsId: string, note: Record<string, unknown>): Promise<{ success: boolean; id?: string }>
      load(wsId: string, noteId: string): Promise<string>
      delete(wsId: string, noteId: string): Promise<{ success: boolean }>
      saveAttachment(wsId: string, fileName: string, base64Data: string): Promise<{ success: boolean; path?: string }>
      readAttachment(filePath: string): Promise<string | null>
      pasteImage(wsId: string): Promise<{ success: boolean; fileName?: string; filePath?: string; imageUrl?: string; size?: number; error?: string }>
      export(startDate: string, endDate: string, format: 'md' | 'pdf', wsId?: string): Promise<{ success: boolean; filePath?: string; count?: number; canceled?: boolean; error?: string }>
      exportSingle(wsId: string, noteId: string, format: 'md' | 'pdf'): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>
      updateStatusIcon(wsId: string, noteId: string, statusIcon: string): Promise<{ success: boolean }>
      openPath(filePath: string): Promise<void>
    }
    todos: {
      load(date: string): Promise<TodoDay>
      save(date: string, data: TodoDay): Promise<{ success: boolean }>
      monthSummary(yearMonth: string): Promise<Record<string, { total: number; done: number }>>
      export(startDate: string, endDate: string, format: 'md' | 'pdf'): Promise<{ success: boolean; filePath?: string; count?: number; canceled?: boolean; error?: string }>
    }
    workspace: {
      list(): Promise<Workspace[]>
      getActive(): Promise<string>
      setActive(wsId: string): Promise<{ success: boolean; error?: string }>
      create(name: string, color: string): Promise<{ success: boolean; id?: string; error?: string }>
      rename(wsId: string, name: string, color?: string): Promise<{ success: boolean; error?: string }>
      delete(wsId: string): Promise<{ success: boolean; error?: string }>
    }
    config: {
      get(): Promise<Record<string, unknown>>
      set(config: Record<string, unknown>): Promise<{ success: boolean }>
      getDataDir(): Promise<string>
      setHotkey(hotkey: string): Promise<{ success: boolean; error?: string }>
    }
    attachments: {
      getPath(): Promise<string>
      getDefaultPath(): Promise<string>
      selectDir(): Promise<{ success: boolean; path?: string; canceled?: boolean }>
      setPath(newPath: string, migrate: boolean): Promise<{ success: boolean; migratedCount?: number; error?: string }>
      resetPath(migrate: boolean): Promise<{ success: boolean; migratedCount?: number; error?: string }>
    }
    storage: {
      selectDir(title: string): Promise<{ success: boolean; path?: string; canceled?: boolean }>
      getRootPath(): Promise<string>
      setRootPath(newPath: string | null): Promise<{ success: boolean; oldRoot?: string; newRoot?: string; error?: string }>
      getTodosPath(): Promise<string>
      setTodosPath(newPath: string | null): Promise<{ success: boolean; oldPath?: string; newPath?: string; error?: string }>
      clearNotes(): Promise<{ success: boolean; cleared?: number; backupDir?: string; error?: string }>
      clearTodos(): Promise<{ success: boolean; cleared?: number; backupDir?: string; error?: string }>
    }
    ai: {
      getNodes(): Promise<AINode[]>
      saveNode(node: AINodeInput): Promise<{ success: boolean; error?: string }>
      deleteNode(nodeId: string): Promise<{ success: boolean; error?: string }>
      toggleNode(nodeId: string): Promise<{ success: boolean; enabled?: boolean; error?: string }>
      reorderNodes(ids: string[]): Promise<{ success: boolean; error?: string }>
      validate(cfg: { provider: string; apiKey: string; model: string }): Promise<{ success: boolean; error?: string }>
      chat(messages: ChatMessage[]): Promise<{ success: boolean; error?: string }>
      onToken(callback: (data: TokenEvent) => void): () => void
      listSessions(): Promise<SessionMeta[]>
      loadSession(sessionId: string): Promise<SessionData>
      saveSession(session: SessionData): Promise<{ success: boolean; error?: string }>
      deleteSession(sessionId: string): Promise<{ success: boolean; error?: string }>
      selectFiles(): Promise<{ success: boolean; paths?: string[]; canceled?: boolean }>
      readFileContent(filePath: string): Promise<FileReadResult>
      translate(text: string, from: string, to: string): Promise<{ success: boolean; error?: string }>
      hasTranslateNode(): Promise<boolean>
    }
    window: {
      hide(): void
      minimize(): void
      togglePin(): void
    }
    app: {
      getAutoStart(): Promise<boolean>
      setAutoStart(enabled: boolean): Promise<{ success: boolean; error?: string }>
      relaunch(): void
      onAutoStartChanged(callback: (enabled: boolean) => void): () => void
    }
    shell: {
      openExternal(url: string): Promise<void>
    }
  }
}

type AINodePurpose = 'chat' | 'translate' | 'both'

interface AINode {
  id: string
  name: string
  provider: string
  apiKey: string
  model: string
  enabled: boolean
  order: number
  purpose: AINodePurpose
}

interface AINodeInput {
  id?: string
  name: string
  provider: string
  apiKey: string
  model: string
  enabled: boolean
  purpose: AINodePurpose
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface TokenEvent {
  content?: string
  reasoning?: string
  done: boolean
  error?: string
}

interface NoteMeta {
  id: string
  title: string
  preview: string
  tags: string[]
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  fileName?: string
  statusIcon?: string
}

interface TodoItem {
  id: string
  content: string
  done: boolean
  color: string | null
  time: string | null
  order: number
  createdAt: string
  doneAt?: string
}

interface TodoDay {
  date: string
  archived: boolean
  items: TodoItem[]
}

interface SessionMeta {
  id: string
  title: string
  updatedAt: number
  messageCount: number
}

interface SessionData {
  id: string
  title: string
  messages: SessionMessage[]
  updatedAt: number
}

interface SessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: number
  attachments?: FileAttachment[]
}

interface FileAttachment {
  name: string
  type: 'image' | 'text' | 'document'
  url?: string      // for images (quickstart://media/...)
  content?: string   // extracted text for documents
}

interface FileReadResult {
  success: boolean
  type?: 'image' | 'text' | 'document'
  name?: string
  url?: string
  content?: string
  error?: string
}
