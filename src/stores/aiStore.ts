import { create } from 'zustand'

interface AIState {
  // Sessions
  sessions: SessionMeta[]
  activeSessionId: string | null
  messages: SessionMessage[]
  attachments: FileAttachment[]

  // State
  streaming: boolean
  error: string | null
  hasEnabledNode: boolean
  showSidebar: boolean

  // Actions
  checkNodes: () => Promise<void>
  loadSessions: () => Promise<void>
  createSession: () => void
  switchSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
  toggleSidebar: () => void

  // Attachments
  addFiles: () => Promise<void>
  removeAttachment: (idx: number) => void
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

async function persistSession(id: string, title: string, messages: SessionMessage[]) {
  await window.api.ai.saveSession({ id, title, messages, updatedAt: Date.now() })
}

export const useAIStore = create<AIState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  attachments: [],
  streaming: false,
  error: null,
  hasEnabledNode: false,
  showSidebar: false,

  checkNodes: async () => {
    try {
      const nodes = await window.api.ai.getNodes()
      set({ hasEnabledNode: nodes.some((n) => n.enabled && n.apiKey && (n.purpose === 'chat' || n.purpose === 'both' || !n.purpose)) })
    } catch {
      set({ hasEnabledNode: false })
    }
  },

  loadSessions: async () => {
    const sessions = await window.api.ai.listSessions()
    const { activeSessionId } = get()
    set({ sessions })
    // Auto-create if empty
    if (sessions.length === 0) {
      get().createSession()
    } else if (!activeSessionId || !sessions.find((s) => s.id === activeSessionId)) {
      await get().switchSession(sessions[0].id)
    }
  },

  createSession: () => {
    const id = generateId()
    const newSession: SessionMeta = { id, title: '新对话', updatedAt: Date.now(), messageCount: 0 }
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      activeSessionId: id,
      messages: [],
      attachments: [],
      error: null,
    }))
    persistSession(id, '新对话', [])
  },

  switchSession: async (id: string) => {
    // Save current session first
    const { activeSessionId, messages, sessions } = get()
    if (activeSessionId && messages.length > 0) {
      const current = sessions.find((s) => s.id === activeSessionId)
      await persistSession(activeSessionId, current?.title || '新对话', messages)
    }
    // Load new session
    const data = await window.api.ai.loadSession(id)
    set({
      activeSessionId: id,
      messages: data.messages || [],
      attachments: [],
      error: null,
      showSidebar: false,
    })
  },

  deleteSession: async (id: string) => {
    await window.api.ai.deleteSession(id)
    const { activeSessionId, sessions } = get()
    const remaining = sessions.filter((s) => s.id !== id)
    set({ sessions: remaining })
    if (id === activeSessionId) {
      if (remaining.length > 0) {
        await get().switchSession(remaining[0].id)
      } else {
        get().createSession()
      }
    }
  },

  renameSession: async (id: string, title: string) => {
    set((s) => ({
      sessions: s.sessions.map((sess) => sess.id === id ? { ...sess, title } : sess)
    }))
    const data = await window.api.ai.loadSession(id)
    await persistSession(id, title, data.messages || [])
  },

  sendMessage: async (content: string) => {
    const { messages, streaming, activeSessionId, sessions, attachments } = get()
    if (streaming || !content.trim()) return
    if (!activeSessionId) return

    // Build user message with attachments
    const userMsg: SessionMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }

    const assistantMsg: SessionMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
    }

    const newMessages = [...messages, userMsg, assistantMsg]
    set({ messages: newMessages, streaming: true, error: null, attachments: [] })

    // Auto-title from first message
    const currentSession = sessions.find((s) => s.id === activeSessionId)
    if (currentSession && (currentSession.title === '新对话' || !currentSession.title) && messages.length === 0) {
      const title = content.trim().substring(0, 30) + (content.trim().length > 30 ? '…' : '')
      set((s) => ({
        sessions: s.sessions.map((sess) => sess.id === activeSessionId ? { ...sess, title } : sess)
      }))
    }

    // Build context with attachments inlined
    const history = [...messages, userMsg]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map((m) => {
        let text = m.content
        // Inline attachment text for context
        if (m.attachments) {
          for (const att of m.attachments) {
            if (att.content) text += `\n\n[附件: ${att.name}]\n${att.content}`
          }
        }
        return { role: m.role as 'user' | 'assistant', content: text }
      })

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: '你是 QuickStart 的 AI 助手，简洁、友好、准确地回答问题。使用中文回复。如果用户发送了附件内容，请参考附件进行回答。' },
      ...history,
    ]

    const unsubscribe = window.api.ai.onToken((data) => {
      const { messages: currentMsgs } = get()
      const lastIdx = currentMsgs.length - 1
      if (lastIdx < 0) return
      const last = { ...currentMsgs[lastIdx] }

      if (data.error) {
        set({ error: data.error, streaming: false })
        last.streaming = undefined
        set({ messages: [...currentMsgs.slice(0, lastIdx), last] })
        unsubscribe()
        return
      }

      if (data.content) last.content += data.content
      if (data.reasoning) last.reasoning = (last.reasoning || '') + data.reasoning

      if (data.done) {
        set({ messages: [...currentMsgs.slice(0, lastIdx), last], streaming: false })
        unsubscribe()
        // Persist after complete
        const { activeSessionId: sid, messages: finalMsgs, sessions: sArr } = get()
        if (sid) {
          const sess = sArr.find((s) => s.id === sid)
          persistSession(sid, sess?.title || '新对话', finalMsgs)
          set((s) => ({ sessions: s.sessions.map((se) => se.id === sid ? { ...se, updatedAt: Date.now(), messageCount: finalMsgs.length } : se) }))
        }
      } else {
        set({ messages: [...currentMsgs.slice(0, lastIdx), last] })
      }
    })

    const result = await window.api.ai.chat(chatMessages)
    if (!result.success && result.error) {
      set({ error: result.error, streaming: false })
      const { messages: currentMsgs } = get()
      const lastIdx = currentMsgs.length - 1
      if (lastIdx >= 0) {
        const last = { ...currentMsgs[lastIdx], content: currentMsgs[lastIdx].content || '请求失败' }
        set({ messages: [...currentMsgs.slice(0, lastIdx), last] })
      }
      unsubscribe()
    }
  },

  clearMessages: () => {
    const { activeSessionId, sessions } = get()
    set({ messages: [], error: null })
    if (activeSessionId) {
      const sess = sessions.find((s) => s.id === activeSessionId)
      persistSession(activeSessionId, sess?.title || '新对话', [])
      set((s) => ({ sessions: s.sessions.map((se) => se.id === activeSessionId ? { ...se, messageCount: 0 } : se) }))
    }
  },

  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),

  addFiles: async () => {
    const result = await window.api.ai.selectFiles()
    if (!result.success || !result.paths) return

    const newAttachments: FileAttachment[] = []
    for (const path of result.paths) {
      const fr = await window.api.ai.readFileContent(path)
      if (fr.success && fr.type && fr.name) {
        newAttachments.push({
          name: fr.name,
          type: fr.type,
          url: fr.url,
          content: fr.content,
        })
      }
    }
    set((s) => ({ attachments: [...s.attachments, ...newAttachments] }))
  },

  removeAttachment: (idx: number) => {
    set((s) => ({ attachments: s.attachments.filter((_, i) => i !== idx) }))
  },
}))
