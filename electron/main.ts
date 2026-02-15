import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeImage,
  clipboard,
  protocol,
  net,
  dialog
} from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  copyFileSync,
  unlinkSync
} from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// ============================================================
// Custom Protocol — register BEFORE app.ready
// ============================================================
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'quickstart',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

// ============================================================
// State
// ============================================================
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ============================================================
// Single Instance Lock
// ============================================================
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

// ============================================================
// Safe File Operations
// ============================================================
function safeWriteJSON(filePath: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2)
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, json, 'utf-8')
  JSON.parse(readFileSync(tmpPath, 'utf-8')) // verify
  if (existsSync(filePath)) {
    try {
      renameSync(filePath, filePath + '.bak')
    } catch {
      // ignore
    }
  }
  renameSync(tmpPath, filePath)
}

function safeReadJSON<T>(filePath: string, fallback: T): T {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch {
    try {
      if (existsSync(filePath + '.bak')) {
        return JSON.parse(readFileSync(filePath + '.bak', 'utf-8'))
      }
    } catch {
      // ignore
    }
  }
  return fallback
}

// ============================================================
// Simple AES-256 encryption for API keys at rest
// ============================================================
const CRYPTO_ALGO = 'aes-256-gcm'
const CRYPTO_SALT = 'quickstart-salt-2024'

function deriveKey(): Buffer {
  return scryptSync(app.getPath('appData'), CRYPTO_SALT, 32)
}

function encryptString(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(CRYPTO_ALGO, key, iv)
  let enc = cipher.update(plaintext, 'utf8', 'hex')
  enc += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return iv.toString('hex') + ':' + tag + ':' + enc
}

function decryptString(ciphertext: string): string {
  try {
    const [ivHex, tagHex, enc] = ciphertext.split(':')
    const key = deriveKey()
    const decipher = createDecipheriv(CRYPTO_ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    let dec = decipher.update(enc, 'hex', 'utf8')
    dec += decipher.final('utf8')
    return dec
  } catch {
    return ''
  }
}

// ============================================================
// Data Directory
// ============================================================
function getDataDir(): string {
  const dir = join(app.getPath('appData'), 'QuickStart-Data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// ── Workspace config types ──
interface WorkspaceDisk {
  id: string; name: string; color: string; folderName: string
}
interface ConfigV3 {
  schemaVersion: number
  activeWorkspaceId: string
  workspaces: WorkspaceDisk[]
  rootPath?: string // global workspace root (null = default)
  hotkey?: string
  autoStart?: boolean
  ai?: unknown
  [key: string]: unknown
}

// ── Read / write config helpers ──
function getConfigPath(): string { return join(getDataDir(), 'config.json') }
function readConfig(): ConfigV3 {
  return safeReadJSON<ConfigV3>(getConfigPath(), {
    schemaVersion: 3, activeWorkspaceId: 'default', workspaces: []
  })
}
function writeConfig(cfg: ConfigV3): void { safeWriteJSON(getConfigPath(), cfg) }

// ── Workspace folder name sanitisation ──
function sanitizeWsFolder(name: string): string {
  let clean = name.replace(/[\\/:*?"<>|\r\n]/g, '').trim()
  if (clean.length > 60) clean = clean.substring(0, 60).trim()
  return clean || '工作区'
}

function uniqueWsFolder(root: string, baseName: string): string {
  if (!existsSync(join(root, baseName))) return baseName
  let i = 2
  while (existsSync(join(root, `${baseName} (${i})`))) i++
  return `${baseName} (${i})`
}

// ── Workspace path helpers (workspace-name-based folders under a single root) ──
function getWorkspacesRoot(): string {
  const cfg = readConfig()
  const root = cfg.rootPath || join(getDataDir(), 'workspaces')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function getWsDir(wsId: string): string {
  const cfg = readConfig()
  const ws = cfg.workspaces.find((w) => w.id === wsId)
  const folderName = ws?.folderName || '默认'
  const dir = join(getWorkspacesRoot(), folderName)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getWsNotesRoot(wsId: string): string {
  const dir = join(getWsDir(wsId), 'Notes')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
function getWsAttachDir(wsId: string): string {
  const dir = join(getWsDir(wsId), 'Notes', 'attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
// getWsTodosDir removed — todos are global, use getTodosDir()

// Global todos dir (not workspace-scoped, configurable)
function getTodosDir(): string {
  const cfg = readConfig()
  const dir = (cfg as Record<string,unknown>).todosPath as string || join(getDataDir(), 'todos')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// Legacy helpers (delegate to active workspace)
function getAttachmentsDir(): string { return getWsAttachDir(readConfig().activeWorkspaceId || 'default') }

// ── Title sanitisation for file naming ──
function sanitizeTitle(title: string): string {
  let clean = title.replace(/[\\/:*?"<>|\r\n]/g, '').trim()
  if (clean.length > 80) clean = clean.substring(0, 80).trim()
  return clean || '无标题'
}

function uniqueMdName(dir: string, baseName: string): string {
  if (!existsSync(join(dir, `${baseName}.md`))) return `${baseName}.md`
  let i = 2
  while (existsSync(join(dir, `${baseName} (${i}).md`))) i++
  return `${baseName} (${i}).md`
}

// ── Ensure dirs & migrations ──
function ensureDataDirs(): void {
  const dataDir = getDataDir()
  if (!existsSync(join(dataDir, 'backups'))) mkdirSync(join(dataDir, 'backups'), { recursive: true })

  // Default config
  const cfgPath = getConfigPath()
  if (!existsSync(cfgPath)) {
    writeConfig({
      schemaVersion: 3,
      activeWorkspaceId: 'default',
      workspaces: [
        { id: 'default', name: '默认', color: '#6366f1', folderName: '默认' }
      ],
      hotkey: 'Ctrl+Shift+Q',
      alwaysOnTop: true,
    })
  }

  // Run migrations
  migrateToV3()

  // Move any leftover workspace Todos/ to global todos dir
  consolidateGlobalTodos()

  // Ensure default workspace + global todos
  ensureWsStructure('default')
  getTodosDir() // ensure global todos dir exists
}

/** Move todos from workspace Todos/ folders to global todos dir (one-time cleanup) */
function consolidateGlobalTodos(): void {
  const cfg = readConfig()
  const root = cfg.rootPath || join(getDataDir(), 'workspaces')
  const globalTodos = join(getDataDir(), 'todos')
  if (!existsSync(globalTodos)) mkdirSync(globalTodos, { recursive: true })
  for (const ws of cfg.workspaces) {
    const wsTodos = join(root, ws.folderName, 'Todos')
    if (existsSync(wsTodos)) {
      for (const f of readdirSync(wsTodos).filter((f) => f.endsWith('.json'))) {
        const s = join(wsTodos, f); const d = join(globalTodos, f)
        if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
      }
      // Remove the workspace Todos/ folder after migration
      try {
        for (const f of readdirSync(wsTodos)) { try { unlinkSync(join(wsTodos, f)) } catch {} }
        const { rmdirSync } = require('fs')
        rmdirSync(wsTodos)
      } catch {}
    }
  }
}

/** Ensure workspace folder structure: wsDir/Notes/ (workspace only holds notes) */
function ensureWsStructure(wsId: string): void {
  const notesDir = getWsNotesRoot(wsId)
  const attachDir = getWsAttachDir(wsId)
  for (const d of [notesDir, attachDir]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
  const idxPath = join(notesDir, 'index.json')
  if (!existsSync(idxPath)) {
    const cfg = readConfig()
    const ws = cfg.workspaces.find((w) => w.id === wsId)
    safeWriteJSON(idxPath, {
      workspace: { id: wsId, name: ws?.name || '默认', color: ws?.color || '#6366f1', icon: 'inbox', createdAt: new Date().toISOString() },
      notes: []
    })
  }
}

/** Migrate from older schemas to v3 (workspace-name-folder model) */
function migrateToV3(): void {
  const cfg = safeReadJSON<Record<string, unknown>>(getConfigPath(), {})
  const ver = (cfg.schemaVersion as number) || 0
  if (ver >= 3) return
  console.log(`Migrating config from v${ver} to v3 (workspace-name folders)...`)

  const dataDir = getDataDir()
  const oldWsRoot = join(dataDir, 'workspaces')

  // --- Phase 1: handle v1 → v2 data (old flat notes/todos) ---
  if (ver < 2) {
    const oldNotesRoot = (cfg.notesRootPath as string) || join(oldWsRoot, 'default')
    const oldTodosDir = (cfg.todosPath as string) || join(dataDir, 'todos')
    const tmpDir = join(oldWsRoot, 'default')
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    // Copy notes into default workspace
    if (oldNotesRoot !== tmpDir && existsSync(oldNotesRoot)) {
      for (const entry of ['index.json']) {
        const src = join(oldNotesRoot, entry)
        if (existsSync(src) && !existsSync(join(tmpDir, entry))) copyFileSync(src, join(tmpDir, entry))
      }
      try {
        for (const e of readdirSync(oldNotesRoot, { withFileTypes: true })) {
          if (e.isDirectory() && (/^\d{4}-\d{2}$/.test(e.name) || e.name === 'notes' || e.name === 'attachments')) {
            const srcSub = join(oldNotesRoot, e.name)
            const dstSub = join(tmpDir, e.name)
            if (!existsSync(dstSub)) mkdirSync(dstSub, { recursive: true })
            for (const f of readdirSync(srcSub)) {
              const s = join(srcSub, f); const d = join(dstSub, f)
              if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
            }
          }
        }
      } catch {}
    }

    // Copy todos to global todos dir
    const globalTodos = join(dataDir, 'todos')
    if (!existsSync(globalTodos)) mkdirSync(globalTodos, { recursive: true })
    if (oldTodosDir && existsSync(oldTodosDir) && oldTodosDir !== globalTodos) {
      for (const f of readdirSync(oldTodosDir).filter((f) => f.endsWith('.json'))) {
        const s = join(oldTodosDir, f); const d = join(globalTodos, f)
        if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
      }
    }

    // Rename old filenames
    const idxPath = join(tmpDir, 'index.json')
    const idx = safeReadJSON<{ notes?: { id: string; title?: string }[] }>(idxPath, { notes: [] })
    const titleMap = new Map((idx.notes || []).map((n) => [n.id, n.title || '无标题']))
    try {
      for (const e of readdirSync(tmpDir, { withFileTypes: true })) {
        if (!e.isDirectory() || !/^\d{4}-\d{2}$/.test(e.name)) continue
        const monthDir = join(tmpDir, e.name)
        for (const f of readdirSync(monthDir).filter((ff) => ff.endsWith('.md'))) {
          const m = f.match(/^\d{4}-\d{2}-\d{2}_([^.]+)\.md$/)
          if (!m) continue
          const noteId = m[1]; const title = sanitizeTitle(titleMap.get(noteId) || noteId)
          const newName = uniqueMdName(monthDir, title)
          if (f !== newName) { try { renameSync(join(monthDir, f), join(monthDir, newName)) } catch {} }
          const ni = (idx.notes || []).findIndex((n) => n.id === noteId)
          if (ni >= 0) (idx.notes![ni] as Record<string, unknown>).fileName = newName
        }
      }
      safeWriteJSON(idxPath, idx)
    } catch {}
  }

  // --- Phase 2: restructure v2 data into v3 workspace-name folders ---
  // v2 had: workspaces/{id}/ with notes at root, attachments/, todos/
  // v3 has:  workspaces/{name}/ with Notes/ (index+months+attachments), Todos/
  const oldWorkspaces = (cfg.workspaces as { id: string; name: string; color: string; folderPath?: string | null }[]) || []
  if (oldWorkspaces.length === 0) {
    oldWorkspaces.push({ id: 'default', name: '默认', color: '#6366f1' })
  }

  // Global todos dir for all workspace todos migration
  const globalTodosDir = join(dataDir, 'todos')
  if (!existsSync(globalTodosDir)) mkdirSync(globalTodosDir, { recursive: true })

  const newWorkspaces: WorkspaceDisk[] = []
  for (const ows of oldWorkspaces) {
    const folderName = sanitizeWsFolder(ows.name)
    const uniqueName = uniqueWsFolder(oldWsRoot, folderName)
    const newDir = join(oldWsRoot, uniqueName)
    const notesDir = join(newDir, 'Notes')
    for (const d of [notesDir, join(notesDir, 'attachments')]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true })
    }

    // Locate old workspace folder
    const oldDir = (ows.folderPath && existsSync(ows.folderPath))
      ? ows.folderPath
      : join(oldWsRoot, ows.id)

    if (existsSync(oldDir) && oldDir !== newDir) {
      // Move index.json → Notes/index.json
      const oldIdx = join(oldDir, 'index.json')
      if (existsSync(oldIdx) && !existsSync(join(notesDir, 'index.json'))) {
        copyFileSync(oldIdx, join(notesDir, 'index.json'))
      }
      // Move YYYY-MM/ folders → Notes/YYYY-MM/
      try {
        for (const e of readdirSync(oldDir, { withFileTypes: true })) {
          if (e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name)) {
            const srcMonth = join(oldDir, e.name); const dstMonth = join(notesDir, e.name)
            if (!existsSync(dstMonth)) mkdirSync(dstMonth, { recursive: true })
            for (const f of readdirSync(srcMonth)) {
              const s = join(srcMonth, f); const d = join(dstMonth, f)
              if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
            }
          }
        }
      } catch {}
      // Move attachments/ → Notes/attachments/
      const oldAttach = join(oldDir, 'attachments')
      if (existsSync(oldAttach)) {
        const newAttach = join(notesDir, 'attachments')
        for (const f of readdirSync(oldAttach)) {
          const s = join(oldAttach, f); const d = join(newAttach, f)
          if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
        }
      }
      // Move old workspace todos/ → global todos dir
      const oldTodos = join(oldDir, 'todos')
      if (existsSync(oldTodos)) {
        for (const f of readdirSync(oldTodos).filter((f) => f.endsWith('.json'))) {
          const s = join(oldTodos, f); const d = join(globalTodosDir, f)
          if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
        }
      }
      // Also check Todos/ (v3 early format)
      const oldTodos2 = join(oldDir, 'Todos')
      if (existsSync(oldTodos2) && oldTodos2 !== oldTodos) {
        for (const f of readdirSync(oldTodos2).filter((f) => f.endsWith('.json'))) {
          const s = join(oldTodos2, f); const d = join(globalTodosDir, f)
          if (!existsSync(d)) { try { copyFileSync(s, d) } catch {} }
        }
      }
    }

    // Ensure Notes/index.json exists
    if (!existsSync(join(notesDir, 'index.json'))) {
      safeWriteJSON(join(notesDir, 'index.json'), {
        workspace: { id: ows.id, name: ows.name, color: ows.color, createdAt: new Date().toISOString() },
        notes: []
      })
    }

    newWorkspaces.push({ id: ows.id, name: ows.name, color: ows.color, folderName: uniqueName })
  }

  // Write v3 config
  const newCfg: ConfigV3 = {
    schemaVersion: 3,
    activeWorkspaceId: (cfg.activeWorkspaceId as string) || 'default',
    workspaces: newWorkspaces,
    hotkey: (cfg.hotkey as string) || 'Ctrl+Shift+Q',
    autoStart: cfg.autoStart as boolean | undefined,
    ai: cfg.ai,
  }
  for (const k of Object.keys(cfg)) {
    if (['schemaVersion', 'activeWorkspaceId', 'workspaces', 'hotkey', 'autoStart', 'ai', 'notesRootPath', 'todosPath', 'attachmentsPath', 'theme', 'alwaysOnTop', 'hideOnClickOutside', 'folderPath', 'rootPath'].includes(k)) continue
    newCfg[k] = cfg[k]
  }
  writeConfig(newCfg)
  console.log('Migration to v3 complete.')
}

// ============================================================
// Window Management
// ============================================================
function createWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width: sw } = display.workAreaSize
  const { y: wy } = display.workArea
  const maxH = display.workAreaSize.height
  const winW = 400
  const winH = Math.min(700, maxH)

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: sw - winW,
    y: wy + Math.floor((maxH - winH) / 2),
    frame: false,
    resizable: true,
    minWidth: 340,
    maxWidth: 520,
    minHeight: 400,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Prevent external URLs from loading inside the app window — open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const { shell } = require('electron')
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    hideWindow()
  })
}

function showWindow(): void {
  if (!mainWindow) return
  // Re-position to right edge, keep current size
  const display = screen.getPrimaryDisplay()
  const { width: sw } = display.workAreaSize
  const bounds = mainWindow.getBounds()
  mainWindow.setPosition(sw - bounds.width, bounds.y)
  mainWindow.show()
  mainWindow.focus()
}

function doRelaunch(): void {
  if (app.isPackaged) {
    // Production: full relaunch
    app.relaunch()
    app.exit(0)
  } else {
    // Dev mode: destroy and recreate window (Vite dev server stays alive)
    if (mainWindow) {
      mainWindow.removeAllListeners('close')
      mainWindow.destroy()
      mainWindow = null
    }
    createWindow()
    mainWindow?.webContents.once('did-finish-load', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  }
}

function hideWindow(): void {
  mainWindow?.hide()
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) hideWindow()
  else showWindow()
}

// ============================================================
// System Tray
// ============================================================
async function createTray(): Promise<void> {
  let icon: Electron.NativeImage
  const iconPath = join(__dirname, '../../resources/icon.png')
  if (existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    // Fallback: use the app executable icon
    icon = await app.getFileIcon(process.execPath, { size: 'small' })
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('QuickStart')
  rebuildTrayMenu()
  tray.on('double-click', showWindow)
}

function getAutoStartEnabled(): boolean {
  try {
    const cfg = safeReadJSON<Record<string, unknown>>(join(getDataDir(), 'config.json'), {})
    return !!(cfg.autoStart)
  } catch { return false }
}

function setAutoStartEnabled(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
    })
  } catch { /* non-Windows or dev mode */ }

  const cfgPath = join(getDataDir(), 'config.json')
  const cfg = safeReadJSON<Record<string, unknown>>(cfgPath, {})
  cfg.autoStart = enabled
  safeWriteJSON(cfgPath, cfg)
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const autoStart = getAutoStartEnabled()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示窗口', click: showWindow },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: autoStart,
        click: (menuItem) => {
          setAutoStartEnabled(menuItem.checked)
          mainWindow?.webContents.send('config:autoStartChanged', menuItem.checked)
        },
      },
      {
        label: '重启应用',
        click: () => { doRelaunch() },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          mainWindow?.destroy()
          app.quit()
        }
      }
    ])
  )
}

// ============================================================
// IPC Handlers
// ============================================================
function setupIPC(): void {
  const dataDir = getDataDir()

  // ---- Window ----
  ipcMain.on('window:hide', hideWindow)
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:toggle-pin', () => {
    if (!mainWindow) return
    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop())
  })

  // ---- Auto Start & Restart ----
  ipcMain.handle('app:getAutoStart', () => getAutoStartEnabled())

  ipcMain.handle('app:setAutoStart', (_e, enabled: boolean) => {
    try {
      setAutoStartEnabled(enabled)
      rebuildTrayMenu()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.on('app:relaunch', () => { doRelaunch() })

  // Open URL in system default browser
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const { shell } = require('electron')
    shell.openExternal(url)
  })

  // ---- Notes (workspace-aware, title-based filenames) ----

  function findNoteFile(wsId: string, noteId: string): string | null {
    const root = getWsNotesRoot(wsId)
    const idxPath = join(root, 'index.json')
    const idx = safeReadJSON<{ notes?: Record<string, unknown>[] }>(idxPath, { notes: [] })
    const noteMeta = (idx.notes || []).find((n) => n.id === noteId) as Record<string, unknown> | undefined
    if (noteMeta?.fileName) {
      try {
        for (const e of readdirSync(root, { withFileTypes: true })) {
          if (e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name)) {
            const fp = join(root, e.name, noteMeta.fileName as string)
            if (existsSync(fp)) return fp
          }
        }
      } catch {}
    }
    // Fallback scan
    try {
      for (const e of readdirSync(root, { withFileTypes: true })) {
        if (e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name)) {
          const monthDir = join(root, e.name)
          const files = readdirSync(monthDir).filter((f) => f.includes(noteId) && f.endsWith('.md'))
          if (files.length > 0) return join(monthDir, files[0])
        }
      }
    } catch {}
    try {
      const oldDir = join(root, 'notes')
      if (existsSync(oldDir)) {
        const files = readdirSync(oldDir).filter((f) => f.includes(noteId) && f.endsWith('.md'))
        if (files.length > 0) return join(oldDir, files[0])
      }
    } catch {}
    return null
  }

  ipcMain.handle('notes:list', (_e, wsId: string) => {
    const p = join(getWsNotesRoot(wsId), 'index.json')
    return safeReadJSON(p, { workspace: null, notes: [] })
  })

  ipcMain.handle('notes:save', (_e, wsId: string, note: Record<string, unknown>) => {
    try {
      const root = getWsNotesRoot(wsId)
      const idxPath = join(root, 'index.json')
      const index = safeReadJSON<{ workspace: unknown; notes: Record<string, unknown>[] }>(
        idxPath, { workspace: { id: wsId }, notes: [] }
      )
      const id = (note.id as string) || Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      const now = new Date().toISOString()
      const content = (note.content as string) || ''
      const ei = index.notes.findIndex((n) => n.id === id)
      const rawTitle = (note.title as string) || content.split('\n')[0]?.substring(0, 50) || '无标题'

      // Delete old file if updating
      if (ei >= 0) {
        const oldFile = findNoteFile(wsId, id)
        if (oldFile && existsSync(oldFile)) unlinkSync(oldFile)
      }

      // Save to YYYY-MM/ folder with sanitised title
      const dateStr = now.split('T')[0]
      const monthStr = dateStr.substring(0, 7)
      const monthDir = join(root, monthStr)
      if (!existsSync(monthDir)) mkdirSync(monthDir, { recursive: true })
      const fileName = uniqueMdName(monthDir, sanitizeTitle(rawTitle))
      writeFileSync(join(monthDir, fileName), content, 'utf-8')

      const meta = {
        id, title: rawTitle,
        preview: content.replace(/!\[[^\]]*\]\([^)]+\)\n?/g, '').substring(0, 100),
        tags: (note.tags as string[]) || [],
        createdAt: ei >= 0 ? index.notes[ei].createdAt : now,
        updatedAt: now, isDeleted: false, fileName,
        statusIcon: (note.statusIcon as string) || (ei >= 0 ? (index.notes[ei].statusIcon as string || '') : ''),
      }
      if (ei >= 0) index.notes[ei] = meta
      else index.notes.unshift(meta)
      safeWriteJSON(idxPath, index)
      return { success: true, id }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('notes:updateStatusIcon', (_e, wsId: string, noteId: string, statusIcon: string) => {
    try {
      const root = getWsNotesRoot(wsId)
      const idxPath = join(root, 'index.json')
      const index = safeReadJSON<{ workspace: unknown; notes: Record<string, unknown>[] }>(
        idxPath, { workspace: { id: wsId }, notes: [] }
      )
      const ei = index.notes.findIndex((n) => n.id === noteId)
      if (ei < 0) return { success: false, error: 'note not found' }
      index.notes[ei].statusIcon = statusIcon
      safeWriteJSON(idxPath, index)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('notes:saveAttachment', (_e, wsId: string, fileName: string, base64Data: string) => {
    try {
      const attachDir = getWsAttachDir(wsId)
      const filePath = join(attachDir, fileName)
      writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
      return { success: true, path: filePath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('notes:readAttachment', (_e, filePath: string) => {
    try {
      if (!existsSync(filePath)) return null
      const buffer = readFileSync(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
      }
      const mime = mimeMap[ext] || 'image/png'
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle('notes:pasteImage', (_e, wsId: string) => {
    try {
      const img = clipboard.readImage()
      if (img.isEmpty()) return { success: false, error: 'clipboard has no image' }
      const pngBuffer = img.toPNG()
      if (!pngBuffer || pngBuffer.length === 0) return { success: false, error: 'image conversion failed' }

      const attachDir = getWsAttachDir(wsId)
      const fileName = `img_${Date.now()}.png`
      writeFileSync(join(attachDir, fileName), pngBuffer)

      return { success: true, fileName, filePath: join(attachDir, fileName), imageUrl: `quickstart://media/${fileName}`, size: pngBuffer.length }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('notes:load', (_e, wsId: string, noteId: string) => {
    try {
      const file = findNoteFile(wsId, noteId)
      if (file) return readFileSync(file, 'utf-8')
    } catch {}
    return ''
  })

  ipcMain.handle('notes:delete', (_e, wsId: string, noteId: string) => {
    try {
      const root = getWsNotesRoot(wsId)
      const idxPath = join(root, 'index.json')
      const index = safeReadJSON<{ notes: Record<string, unknown>[] }>(idxPath, { notes: [] })
      const ni = index.notes.findIndex((n) => n.id === noteId)
      if (ni >= 0) {
        index.notes[ni].isDeleted = true
        index.notes[ni].deletedAt = new Date().toISOString()
        safeWriteJSON(idxPath, index)
      }
      const file = findNoteFile(wsId, noteId)
      if (file && existsSync(file)) unlinkSync(file)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ---- Notes Export ----

  // Collect notes by updatedAt from index.json
  function collectNotesInRange(wsId: string, startDate: string, endDate: string): { date: string; title: string; content: string; filePath: string }[] {
    const root = getWsNotesRoot(wsId)
    const results: { date: string; title: string; content: string; filePath: string }[] = []
    try {
      // Build a fileName->metadata map from index.json for title-based filenames
      const indexPath = join(root, 'index.json')
      const indexData = safeReadJSON(indexPath, null) as { notes?: Array<{ fileName?: string; title?: string; createdAt?: string; updatedAt?: string }> } | null
      const notesMeta = indexData?.notes || []
      const metaMap = new Map<string, { title: string; date: string }>()
      for (const n of notesMeta) {
        if (n.fileName) {
          const dateStr = (n.updatedAt || n.createdAt || '').slice(0, 10)
          metaMap.set(n.fileName, { title: n.title || n.fileName.replace('.md', ''), date: dateStr })
        }
      }

      const entries = readdirSync(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^\d{4}-\d{2}$/.test(entry.name)) continue
        const monthDir = join(root, entry.name)
        for (const file of readdirSync(monthDir).filter((f) => f.endsWith('.md'))) {
          // Try date from filename first (legacy format: 2026-02-09_xxx.md)
          const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/)
          let fileDate = dateMatch ? dateMatch[1] : ''
          let title = file.replace('.md', '')

          // If no date in filename, look up from index.json metadata
          if (!fileDate) {
            const meta = metaMap.get(file)
            if (meta) {
              fileDate = meta.date
              title = meta.title
            } else {
              // Fallback: use the month folder name + day 01
              fileDate = entry.name + '-01'
            }
          }

          if (fileDate >= startDate && fileDate <= endDate) {
            results.push({ date: fileDate, title, content: readFileSync(join(monthDir, file), 'utf-8'), filePath: join(monthDir, file) })
          }
        }
      }
      // Also check old notes/ folder
      const oldDir = join(root, 'notes')
      if (existsSync(oldDir)) {
        for (const file of readdirSync(oldDir).filter((f) => f.endsWith('.md'))) {
          const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/)
          if (!dateMatch) continue
          const fileDate = dateMatch[1]
          if (fileDate >= startDate && fileDate <= endDate) {
            results.push({ date: fileDate, title: file.replace('.md', ''), content: readFileSync(join(oldDir, file), 'utf-8'), filePath: join(oldDir, file) })
          }
        }
      }
    } catch {}
    return results.sort((a, b) => a.date.localeCompare(b.date))
  }

  ipcMain.handle('notes:export', async (_e, startDate: string, endDate: string, format: 'md' | 'pdf', wsId?: string) => {
    if (!mainWindow) return { success: false, error: 'no window' }
    try {
      const targetWsId = wsId || readConfig().activeWorkspaceId || 'default'
      const notes = collectNotesInRange(targetWsId, startDate, endDate)
      if (notes.length === 0) return { success: false, error: '选定日期范围内没有记录' }

      const defaultName = startDate === endDate
        ? `QuickStart_${startDate}`
        : `QuickStart_${startDate}_${endDate}`

      if (format === 'md') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 Markdown',
          defaultPath: `${defaultName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }

        // Merge all notes into one MD with date headers and titles
        let merged = ''
        let currentDate = ''
        for (const note of notes) {
          if (note.date !== currentDate) {
            if (merged) merged += '\n\n---\n\n'
            merged += `# ${note.date}\n\n`
            currentDate = note.date
          }
          if (note.title) merged += `## ${note.title}\n\n`
          merged += note.content + '\n\n'
        }
        writeFileSync(result.filePath, merged.trim(), 'utf-8')

        return { success: true, filePath: result.filePath, count: notes.length }
      }

      if (format === 'pdf') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 PDF',
          defaultPath: `${defaultName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }

        // Build HTML from Markdown
        const MarkdownIt = require('markdown-it')
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true })

        let merged = ''
        let currentDate = ''
        for (const note of notes) {
          if (note.date !== currentDate) {
            if (merged) merged += '\n\n---\n\n'
            merged += `# ${note.date}\n\n`
            currentDate = note.date
          }
          if (note.title) merged += `## ${note.title}\n\n`
          merged += note.content + '\n\n'
        }

        const htmlBody = md.render(merged.trim())
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.8; font-size: 14px; max-width: 700px; margin: 0 auto; }
          h1 { font-size: 20px; color: #6d28d9; border-bottom: 2px solid #ede9fe; padding-bottom: 8px; margin-top: 32px; }
          h2 { font-size: 17px; color: #374151; }
          h3 { font-size: 15px; color: #4b5563; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          pre { background: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid #e2e8f0; }
          pre code { background: none; padding: 0; }
          blockquote { border-left: 3px solid #8b5cf6; padding-left: 16px; color: #6b7280; margin: 16px 0; }
          img { max-width: 100%; border-radius: 8px; }
          a { color: #7c3aed; }
          ul, ol { padding-left: 24px; }
          li { margin-bottom: 4px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
          th { background: #f9fafb; }
        </style></head><body>${htmlBody}</body></html>`

        // Use a hidden BrowserWindow to render HTML → PDF
        const pdfWin = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { contextIsolation: true } })
        await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
        const pdfData = await pdfWin.webContents.printToPDF({
          printBackground: true,
          marginsType: 0,
          pageSize: 'A4',
        })
        pdfWin.destroy()
        writeFileSync(result.filePath, pdfData)

        return { success: true, filePath: result.filePath, count: notes.length }
      }

      return { success: false, error: '不支持的格式' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ---- Single Note Export ----
  ipcMain.handle('notes:exportSingle', async (_e, wsId: string, noteId: string, format: 'md' | 'pdf') => {
    if (!mainWindow) return { success: false, error: 'no window' }
    try {
      const root = getWsNotesRoot(wsId)
      const idxPath = join(root, 'index.json')
      const indexData = safeReadJSON<{ notes?: Array<{ id?: string; fileName?: string; title?: string }> }>(idxPath, { notes: [] })
      const noteMeta = (indexData.notes || []).find((n) => n.id === noteId)
      if (!noteMeta) return { success: false, error: '找不到该记录' }

      const filePath = findNoteFile(wsId, noteId)
      if (!filePath || !existsSync(filePath)) return { success: false, error: '找不到记录文件' }

      const content = readFileSync(filePath, 'utf-8')
      const title = noteMeta.title || noteMeta.fileName?.replace('.md', '') || '无标题'
      const merged = `# ${title}\n\n${content}`.trim()
      const safeName = sanitizeTitle(title)

      if (format === 'md') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 Markdown',
          defaultPath: `${safeName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }
        writeFileSync(result.filePath, merged, 'utf-8')
        return { success: true, filePath: result.filePath }
      }

      if (format === 'pdf') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 PDF',
          defaultPath: `${safeName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }

        const MarkdownIt = require('markdown-it')
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true })
        const htmlBody = md.render(merged)
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.8; font-size: 14px; max-width: 700px; margin: 0 auto; }
          h1 { font-size: 20px; color: #6d28d9; border-bottom: 2px solid #ede9fe; padding-bottom: 8px; margin-top: 32px; }
          h2 { font-size: 17px; color: #374151; }
          h3 { font-size: 15px; color: #4b5563; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          pre { background: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid #e2e8f0; }
          pre code { background: none; padding: 0; }
          blockquote { border-left: 3px solid #8b5cf6; padding-left: 16px; color: #6b7280; margin: 16px 0; }
          img { max-width: 100%; border-radius: 8px; }
          a { color: #7c3aed; }
          ul, ol { padding-left: 24px; }
          li { margin-bottom: 4px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
          th { background: #f9fafb; }
        </style></head><body>${htmlBody}</body></html>`

        const pdfWin = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { contextIsolation: true } })
        await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
        const pdfData = await pdfWin.webContents.printToPDF({
          printBackground: true,
          marginsType: 0,
          pageSize: 'A4',
        })
        pdfWin.destroy()
        writeFileSync(result.filePath, pdfData)
        return { success: true, filePath: result.filePath }
      }

      return { success: false, error: '不支持的格式' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ---- Todos Export (global, not workspace-scoped) ----
  ipcMain.handle('todos:export', async (_e, startDate: string, endDate: string, format: 'md' | 'pdf') => {
    if (!mainWindow) return { success: false, error: 'no window' }
    try {
      const todosDir = getTodosDir()
      if (!existsSync(todosDir)) return { success: false, error: '选定日期范围内没有清单' }

      // Collect todo files in range
      const files = readdirSync(todosDir).filter((f) => f.endsWith('.json'))
      const todos: { date: string; items: { text: string; done: boolean; color?: string }[] }[] = []
      for (const file of files) {
        const date = file.replace('.json', '')
        if (date >= startDate && date <= endDate) {
          const data = safeReadJSON<{ items?: { text?: string; done?: boolean; color?: string }[] }>(join(todosDir, file), { items: [] })
          const items = (data.items || []).filter((i) => i.text)
          if (items.length > 0) {
            todos.push({ date, items: items.map((i) => ({ text: i.text || '', done: !!i.done, color: i.color })) })
          }
        }
      }
      if (todos.length === 0) return { success: false, error: '选定日期范围内没有清单' }
      todos.sort((a, b) => a.date.localeCompare(b.date))

      const defaultName = startDate === endDate
        ? `QuickStart_Todos_${startDate}`
        : `QuickStart_Todos_${startDate}_${endDate}`

      // Build markdown
      let mdContent = ''
      let totalItems = 0
      for (const day of todos) {
        if (mdContent) mdContent += '\n\n---\n\n'
        mdContent += `# ${day.date}\n\n`
        for (const item of day.items) {
          mdContent += `- [${item.done ? 'x' : ' '}] ${item.text}\n`
          totalItems++
        }
      }

      if (format === 'md') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出清单 Markdown',
          defaultPath: `${defaultName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }
        writeFileSync(result.filePath, mdContent.trim(), 'utf-8')
        return { success: true, filePath: result.filePath, count: totalItems }
      }

      if (format === 'pdf') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出清单 PDF',
          defaultPath: `${defaultName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }

        const MarkdownIt = require('markdown-it')
        const md = new MarkdownIt({ html: true, breaks: true })
        const htmlBody = md.render(mdContent.trim())
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.8; font-size: 14px; max-width: 700px; margin: 0 auto; }
          h1 { font-size: 20px; color: #6d28d9; border-bottom: 2px solid #ede9fe; padding-bottom: 8px; margin-top: 32px; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
          ul { padding-left: 24px; list-style: none; }
          li { margin-bottom: 6px; position: relative; padding-left: 8px; }
          li input[type="checkbox"] { margin-right: 8px; }
        </style></head><body>${htmlBody}</body></html>`

        const pdfWin = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { contextIsolation: true } })
        await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
        const pdfData = await pdfWin.webContents.printToPDF({ printBackground: true, marginsType: 0, pageSize: 'A4' })
        pdfWin.destroy()
        writeFileSync(result.filePath, pdfData)
        return { success: true, filePath: result.filePath, count: totalItems }
      }

      return { success: false, error: '不支持的格式' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ---- Todos (global, not workspace-scoped) ----
  ipcMain.handle('todos:load', (_e, date: string) => {
    const todosDir = getTodosDir()
    const p = join(todosDir, `${date}.json`)
    return safeReadJSON(p, { date, archived: false, items: [] })
  })

  ipcMain.handle('todos:save', (_e, date: string, data: unknown) => {
    try {
      const todosDir = getTodosDir()
      const p = join(todosDir, `${date}.json`)
      safeWriteJSON(p, data)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Return summary for a month: { [date]: { total, done } }
  ipcMain.handle('todos:monthSummary', (_e, yearMonth: string) => {
    try {
      const todosDir = getTodosDir()
      if (!existsSync(todosDir)) return {}
      const files = readdirSync(todosDir).filter(
        (f) => f.startsWith(yearMonth) && f.endsWith('.json')
      )
      const summary: Record<string, { total: number; done: number }> = {}
      for (const file of files) {
        const date = file.replace('.json', '')
        const data = safeReadJSON<{ items?: { done?: boolean }[] }>(
          join(todosDir, file),
          { items: [] }
        )
        const items = data.items || []
        if (items.length > 0) {
          summary[date] = {
            total: items.length,
            done: items.filter((i) => i.done).length
          }
        }
      }
      return summary
    } catch {
      return {}
    }
  })

  // ---- Config ----
  ipcMain.handle('config:get', () => {
    return safeReadJSON(join(dataDir, 'config.json'), {})
  })

  ipcMain.handle('config:set', (_e, partial: Record<string, unknown>) => {
    try {
      const p = join(dataDir, 'config.json')
      const existing = safeReadJSON<Record<string, unknown>>(p, {})
      safeWriteJSON(p, { ...existing, ...partial })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('config:getDataDir', () => dataDir)

  ipcMain.handle('config:setHotkey', (_e, newHotkey: string) => {
    try {
      // Unregister all first
      globalShortcut.unregisterAll()
      // Try registering new hotkey
      const ok = globalShortcut.register(newHotkey, toggleWindow)
      if (!ok) {
        // Revert to old hotkey
        const cfgP = join(dataDir, 'config.json')
        const cfg = safeReadJSON<Record<string, unknown>>(cfgP, {})
        const oldHotkey = (cfg.hotkey as string) || 'Ctrl+Shift+Q'
        globalShortcut.register(oldHotkey, toggleWindow)
        return { success: false, error: `快捷键 ${newHotkey} 注册失败，可能已被其他程序占用` }
      }
      // Persist to config
      const cfgP = join(dataDir, 'config.json')
      const cfg = safeReadJSON<Record<string, unknown>>(cfgP, {})
      cfg.hotkey = newHotkey
      safeWriteJSON(cfgP, cfg)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ---- Storage / Workspace management ----

  ipcMain.handle('storage:selectDir', async (_e, title: string) => {
    if (!mainWindow) return { success: false, error: 'no window' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title, properties: ['openDirectory', 'createDirectory'], buttonLabel: '选择此文件夹'
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    return { success: true, path: result.filePaths[0] }
  })

  // --- Workspace CRUD ---
  ipcMain.handle('workspace:list', () => {
    return readConfig().workspaces || []
  })

  ipcMain.handle('workspace:getActive', () => {
    return readConfig().activeWorkspaceId || 'default'
  })

  ipcMain.handle('workspace:setActive', (_e, wsId: string) => {
    try {
      const cfg = readConfig()
      cfg.activeWorkspaceId = wsId
      writeConfig(cfg)
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('workspace:create', (_e, name: string, color: string) => {
    try {
      const cfg = readConfig()
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
      const folderName = uniqueWsFolder(getWorkspacesRoot(), sanitizeWsFolder(name))
      const ws: WorkspaceDisk = { id, name, color, folderName }
      cfg.workspaces.push(ws)
      writeConfig(cfg)
      // Create folder structure: wsDir/Notes/ + wsDir/Todos/
      ensureWsStructure(id)
      return { success: true, id }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('workspace:rename', (_e, wsId: string, name: string, color?: string) => {
    try {
      const cfg = readConfig()
      const ws = cfg.workspaces.find((w) => w.id === wsId)
      if (!ws) return { success: false, error: '工作区不存在' }
      const oldFolderName = ws.folderName
      ws.name = name
      if (color) ws.color = color
      // Rename physical folder if name changed
      const root = getWorkspacesRoot()
      const newFolderBase = sanitizeWsFolder(name)
      if (newFolderBase !== oldFolderName) {
        const newFolder = uniqueWsFolder(root, newFolderBase)
        const oldPath = join(root, oldFolderName)
        const newPath = join(root, newFolder)
        if (existsSync(oldPath)) {
          try { renameSync(oldPath, newPath) } catch {}
        }
        ws.folderName = newFolder
      }
      writeConfig(cfg)
      // Update index.json inside Notes/
      const idxPath = join(getWsNotesRoot(wsId), 'index.json')
      const idx = safeReadJSON<Record<string, unknown>>(idxPath, {})
      const wsObj = (idx.workspace || {}) as Record<string, unknown>
      wsObj.name = name
      if (color) wsObj.color = color
      idx.workspace = wsObj
      safeWriteJSON(idxPath, idx)
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('workspace:delete', (_e, wsId: string) => {
    try {
      if (wsId === 'default') return { success: false, error: '不能删除默认工作区' }
      const cfg = readConfig()
      const ws = cfg.workspaces.find((w) => w.id === wsId)
      cfg.workspaces = cfg.workspaces.filter((w) => w.id !== wsId)
      if (cfg.activeWorkspaceId === wsId) cfg.activeWorkspaceId = 'default'
      writeConfig(cfg)
      // Backup workspace folder to temp
      if (ws) {
        const wsDir = join(getWorkspacesRoot(), ws.folderName)
        if (existsSync(wsDir)) {
          const backupDir = join(tmpdir(), `quickstart-ws-${ws.folderName}-${Date.now()}`)
          mkdirSync(backupDir, { recursive: true })
          try {
            for (const f of readdirSync(wsDir)) {
              copyFileSync(join(wsDir, f), join(backupDir, f))
            }
          } catch {}
        }
      }
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // --- Global root path management ---
  ipcMain.handle('storage:getRootPath', () => {
    return getWorkspacesRoot()
  })

  ipcMain.handle('storage:setRootPath', async (_e, newPath: string | null) => {
    try {
      const cfg = readConfig()
      const oldRoot = getWorkspacesRoot()
      if (newPath) {
        cfg.rootPath = newPath
      } else {
        delete cfg.rootPath // reset to default
      }
      writeConfig(cfg)
      const newRoot = getWorkspacesRoot()
      // Ensure all workspace folders exist in new root
      for (const ws of cfg.workspaces) {
        const dir = join(newRoot, ws.folderName)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        ensureWsStructure(ws.id)
      }
      return { success: true, oldRoot, newRoot }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // --- Global todos path management ---
  ipcMain.handle('storage:getTodosPath', () => {
    return getTodosDir()
  })

  ipcMain.handle('storage:setTodosPath', async (_e, newPath: string | null) => {
    try {
      const cfg = readConfig() as Record<string,unknown>
      const oldDir = getTodosDir()
      if (newPath) {
        cfg.todosPath = newPath
      } else {
        delete cfg.todosPath // reset to default
      }
      writeConfig(cfg as ConfigV3)
      const newDir = getTodosDir()
      if (!existsSync(newDir)) mkdirSync(newDir, { recursive: true })
      return { success: true, oldPath: oldDir, newPath: newDir }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // ---- Clear Data (workspace-scoped) ----
  ipcMain.handle('storage:clearNotes', async () => {
    try {
      const wsId = readConfig().activeWorkspaceId || 'default'
      const root = getWsNotesRoot(wsId)
      const backupDir = join(tmpdir(), `quickstart-backup-notes-${Date.now()}`)
      mkdirSync(backupDir, { recursive: true })

      const idxPath = join(root, 'index.json')
      if (existsSync(idxPath)) {
        copyFileSync(idxPath, join(backupDir, 'index.json'))
        const cfg = readConfig()
        const ws = cfg.workspaces.find((w) => w.id === wsId)
        safeWriteJSON(idxPath, { workspace: { id: wsId, name: ws?.name || '默认', color: ws?.color || '#6366f1', icon: 'inbox', createdAt: new Date().toISOString() }, notes: [] })
      }

      let cleared = 0
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name)) {
          const monthDir = join(root, entry.name)
          const mb = join(backupDir, entry.name)
          mkdirSync(mb, { recursive: true })
          for (const f of readdirSync(monthDir).filter((f) => f.endsWith('.md'))) {
            try { copyFileSync(join(monthDir, f), join(mb, f)); unlinkSync(join(monthDir, f)); cleared++ } catch {}
          }
        }
      }
      const attDir = getWsAttachDir(wsId)
      if (existsSync(attDir)) {
        const ab = join(backupDir, 'attachments')
        mkdirSync(ab, { recursive: true })
        for (const f of readdirSync(attDir)) {
          try { copyFileSync(join(attDir, f), join(ab, f)); unlinkSync(join(attDir, f)); cleared++ } catch {}
        }
      }
      return { success: true, cleared, backupDir }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('storage:clearTodos', async () => {
    try {
      const todosDir = getTodosDir()
      const backupDir = join(tmpdir(), `quickstart-backup-todos-${Date.now()}`)
      mkdirSync(backupDir, { recursive: true })

      let cleared = 0
      if (existsSync(todosDir)) {
        for (const f of readdirSync(todosDir).filter((f) => f.endsWith('.json'))) {
          try { copyFileSync(join(todosDir, f), join(backupDir, f)); unlinkSync(join(todosDir, f)); cleared++ } catch {}
        }
      }
      return { success: true, cleared, backupDir }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // Legacy compat – attachments path proxies
  ipcMain.handle('attachments:getPath', () => getAttachmentsDir())
  ipcMain.handle('attachments:getDefaultPath', () => getAttachmentsDir())

  // ---- AI (multi-node) ----

  // Helper: get the base URL for a given provider
  function aiBaseUrl(provider: string): string {
    if (provider === 'openai') return 'https://api.openai.com'
    return 'https://api.deepseek.com' // default for deepseek
  }

  interface AINodeDisk {
    id: string; name: string; provider: string; apiKeyEnc: string;
    model: string; enabled: boolean; order: number; purpose: 'chat' | 'translate' | 'both'
  }

  // Helper: read nodes array from config (with migration from old flat format)
  function readAINodes(): AINodeDisk[] {
    const p = join(dataDir, 'config.json')
    const existing = safeReadJSON<Record<string, unknown>>(p, {})
    const ai = existing.ai as Record<string, unknown> | undefined

    // Already migrated
    if (ai && Array.isArray(ai.nodes)) return ai.nodes as AINodeDisk[]

    // Migrate from old flat format { provider, apiKeyEnc, model }
    if (ai && ai.apiKeyEnc) {
      const node: AINodeDisk = {
        id: Date.now().toString(36),
        name: (ai.provider as string) === 'openai' ? 'OpenAI' : 'DeepSeek',
        provider: (ai.provider as string) || 'deepseek',
        apiKeyEnc: ai.apiKeyEnc as string,
        model: (ai.model as string) || 'deepseek-chat',
        enabled: true,
        order: 0,
        purpose: 'both',
      }
      existing.ai = { nodes: [node] }
      safeWriteJSON(p, existing)
      return [node]
    }

    return []
  }

  function writeAINodes(nodes: AINodeDisk[]) {
    const p = join(dataDir, 'config.json')
    const existing = safeReadJSON<Record<string, unknown>>(p, {})
    existing.ai = { nodes }
    safeWriteJSON(p, existing)
  }

  /** Get all AI nodes (decrypted keys) */
  ipcMain.handle('ai:getNodes', () => {
    const nodes = readAINodes()
    return nodes.map((n) => ({
      id: n.id, name: n.name, provider: n.provider,
      apiKey: n.apiKeyEnc ? decryptString(n.apiKeyEnc) : '',
      model: n.model, enabled: n.enabled, order: n.order,
      purpose: n.purpose || 'both',
    }))
  })

  /** Save (create / update) a single node */
  ipcMain.handle('ai:saveNode', (_e, node: {
    id?: string; name: string; provider: string; apiKey: string; model: string; enabled: boolean; purpose?: 'chat' | 'translate' | 'both'
  }) => {
    try {
      const nodes = readAINodes()
      const purpose = node.purpose || 'both'
      const existing = nodes.find((n) => n.id === node.id)
      if (existing) {
        existing.name = node.name
        existing.provider = node.provider
        existing.apiKeyEnc = node.apiKey ? encryptString(node.apiKey) : ''
        existing.model = node.model
        existing.enabled = node.enabled
        existing.purpose = purpose
      } else {
        nodes.push({
          id: node.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
          name: node.name, provider: node.provider,
          apiKeyEnc: node.apiKey ? encryptString(node.apiKey) : '',
          model: node.model, enabled: node.enabled,
          order: nodes.length,
          purpose,
        })
      }
      writeAINodes(nodes)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  /** Delete a node */
  ipcMain.handle('ai:deleteNode', (_e, nodeId: string) => {
    try {
      let nodes = readAINodes()
      nodes = nodes.filter((n) => n.id !== nodeId)
      writeAINodes(nodes)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  /** Toggle node enabled */
  ipcMain.handle('ai:toggleNode', (_e, nodeId: string) => {
    try {
      const nodes = readAINodes()
      const node = nodes.find((n) => n.id === nodeId)
      if (node) node.enabled = !node.enabled
      writeAINodes(nodes)
      return { success: true, enabled: node?.enabled }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  /** Reorder nodes */
  ipcMain.handle('ai:reorderNodes', (_e, orderedIds: string[]) => {
    try {
      const nodes = readAINodes()
      const map = new Map(nodes.map((n) => [n.id, n]))
      const reordered: AINodeDisk[] = []
      for (let i = 0; i < orderedIds.length; i++) {
        const n = map.get(orderedIds[i])
        if (n) { n.order = i; reordered.push(n) }
      }
      writeAINodes(reordered)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  /** Validate node config */
  ipcMain.handle('ai:validate', async (_e, cfg: { provider: string; apiKey: string; model: string }) => {
    try {
      if (!cfg.apiKey) return { success: false, error: 'API Key 不能为空' }
      const response = await fetch(`${aiBaseUrl(cfg.provider)}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5, stream: false }),
      })
      if (!response.ok) {
        const body = await response.text()
        let msg = `HTTP ${response.status}`
        try { const j = JSON.parse(body); if (j.error?.message) msg = j.error.message } catch { /* noop */ }
        return { success: false, error: msg }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  /** Stream chat — uses the first enabled node */
  ipcMain.handle('ai:chat', async (_e, messages: { role: string; content: string }[]) => {
    try {
      const nodes = readAINodes()
      const active = nodes.filter((n) => n.enabled && (n.purpose === 'chat' || n.purpose === 'both' || !n.purpose)).sort((a, b) => a.order - b.order)[0]
      if (!active) return { success: false, error: '没有已启用的 AI 对话节点' }

      const apiKey = active.apiKeyEnc ? decryptString(active.apiKeyEnc) : ''
      if (!apiKey) return { success: false, error: 'API Key 未配置' }

      const response = await fetch(`${aiBaseUrl(active.provider)}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: active.model, messages, stream: true }),
      })

      if (!response.ok) {
        const errText = await response.text()
        return { success: false, error: `API ${response.status}: ${errText.substring(0, 200)}` }
      }
      if (!response.body) return { success: false, error: 'No response body' }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') { mainWindow?.webContents.send('ai:token', { done: true }); continue }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) mainWindow?.webContents.send('ai:token', { content: delta.content, done: false })
            if (delta?.reasoning_content) mainWindow?.webContents.send('ai:token', { reasoning: delta.reasoning_content, done: false })
          } catch { /* skip */ }
        }
      }

      mainWindow?.webContents.send('ai:token', { done: true })
      return { success: true }
    } catch (err) {
      mainWindow?.webContents.send('ai:token', { done: true, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  // ---- AI Sessions ----

  const sessionsDir = join(dataDir, 'ai-sessions')

  ipcMain.handle('ai:listSessions', () => {
    if (!existsSync(sessionsDir)) return []
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.json'))
    const sessions: { id: string; title: string; updatedAt: number; messageCount: number }[] = []
    for (const file of files) {
      const data = safeReadJSON<{ id: string; title: string; updatedAt: number; messages: unknown[] }>(join(sessionsDir, file), { id: '', title: '', updatedAt: 0, messages: [] })
      if (data.id) sessions.push({ id: data.id, title: data.title, updatedAt: data.updatedAt, messageCount: (data.messages || []).length })
    }
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  })

  ipcMain.handle('ai:loadSession', (_e, sessionId: string) => {
    const p = join(sessionsDir, `${sessionId}.json`)
    return safeReadJSON(p, { id: sessionId, title: '新对话', messages: [], updatedAt: Date.now() })
  })

  ipcMain.handle('ai:saveSession', (_e, session: { id: string; title: string; messages: unknown[]; updatedAt: number }) => {
    try {
      if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true })
      safeWriteJSON(join(sessionsDir, `${session.id}.json`), session)
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('ai:deleteSession', (_e, sessionId: string) => {
    try {
      const p = join(sessionsDir, `${sessionId}.json`)
      if (existsSync(p)) unlinkSync(p)
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // ---- AI Translate ----

  ipcMain.handle('ai:hasTranslateNode', () => {
    const nodes = readAINodes()
    return nodes.some((n) => n.enabled && (n.purpose === 'translate' || n.purpose === 'both' || !n.purpose) && n.apiKeyEnc)
  })

  ipcMain.handle('ai:translate', async (_e, text: string, from: string, to: string) => {
    try {
      const nodes = readAINodes()
      const active = nodes.filter((n) => n.enabled && (n.purpose === 'translate' || n.purpose === 'both' || !n.purpose)).sort((a, b) => a.order - b.order)[0]
      if (!active) return { success: false, error: '没有已启用的翻译节点' }

      const apiKey = active.apiKeyEnc ? decryptString(active.apiKeyEnc) : ''
      if (!apiKey) return { success: false, error: 'API Key 未配置' }

      const fromLabel = from === 'auto' ? '自动检测语言' : from
      const systemPrompt = `你是一个专业翻译引擎。将用户输入的文本从${fromLabel}翻译成${to}。只输出翻译结果，不要添加任何解释、注释或额外文字。保持原文的格式和段落结构。`

      const response = await fetch(`${aiBaseUrl(active.provider)}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: active.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          stream: true,
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        return { success: false, error: `API ${response.status}: ${errText.substring(0, 200)}` }
      }
      if (!response.body) return { success: false, error: 'No response body' }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') { mainWindow?.webContents.send('ai:token', { done: true }); continue }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) mainWindow?.webContents.send('ai:token', { content: delta.content, done: false })
          } catch { /* skip */ }
        }
      }

      mainWindow?.webContents.send('ai:token', { done: true })
      return { success: true }
    } catch (err) {
      mainWindow?.webContents.send('ai:token', { done: true, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  // ---- File Upload for AI ----

  ipcMain.handle('ai:selectFiles', async () => {
    if (!mainWindow) return { success: false, error: 'no window' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '所有支持格式', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'md', 'json', 'csv', 'log', 'pdf'] },
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: '文本', extensions: ['txt', 'md', 'json', 'csv', 'log'] },
        { name: 'PDF', extensions: ['pdf'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    return { success: true, paths: result.filePaths }
  })

  ipcMain.handle('ai:readFileContent', async (_e, filePath: string) => {
    try {
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const name = filePath.replace(/\\/g, '/').split('/').pop() || 'file'

      // Image: return as quickstart:// URL
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        const wsId = readConfig().activeWorkspaceId || 'default'
        const attachDir = getWsAttachDir(wsId)
        const destName = `ai_${Date.now()}_${name}`
        const dest = join(attachDir, destName)
        copyFileSync(filePath, dest)
        return { success: true, type: 'image' as const, name, url: `quickstart://media/${destName}` }
      }

      // Text files: read directly
      if (['txt', 'md', 'json', 'csv', 'log'].includes(ext)) {
        const content = readFileSync(filePath, 'utf-8')
        return { success: true, type: 'text' as const, name, content: content.substring(0, 50000) }
      }

      // PDF: try basic text extraction
      if (ext === 'pdf') {
        const buf = readFileSync(filePath)
        // Simple PDF text extraction (no external deps)
        const text = buf.toString('utf-8').replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n\r\t]/g, '')
        const cleaned = text.replace(/\s+/g, ' ').trim().substring(0, 30000)
        return { success: true, type: 'document' as const, name, content: cleaned || '(无法提取PDF文本内容)' }
      }

      return { success: false, error: '不支持的文件格式' }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // Legacy compat - no-op for old resetPath
  ipcMain.handle('attachments:resetPath', async () => ({ success: true, migratedCount: 0 }))
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async () => {
  // ── Register quickstart:// protocol to serve local files ──
  // quickstart://media/img_xxx.png  →  dynamic attachments dir / img_xxx.png
  protocol.handle('quickstart', (request) => {
    const url = new URL(request.url)
    const host = url.hostname            // "media"
    const fileName = decodeURIComponent(url.pathname.replace(/^\//, ''))

    let filePath: string
    if (host === 'media') {
      // Search active workspace first, then all workspaces
      const cfg = readConfig()
      filePath = join(getWsAttachDir(cfg.activeWorkspaceId || 'default'), fileName)
      if (!existsSync(filePath)) {
        // Search all workspaces
        for (const ws of cfg.workspaces) {
          const alt = join(getWsAttachDir(ws.id), fileName)
          if (existsSync(alt)) { filePath = alt; break }
        }
      }
      // Final fallback: legacy default location
      if (!existsSync(filePath)) {
        const legacyDir = join(getDataDir(), 'workspaces', 'default', 'attachments')
        const fallback = join(legacyDir, fileName)
        if (existsSync(fallback)) filePath = fallback
      }
    } else {
      filePath = join(getDataDir(), host, fileName)
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })

  ensureDataDirs()
  createWindow()
  await createTray()
  setupIPC()

  // Sync auto-start with system on launch
  try {
    const autoStart = getAutoStartEnabled()
    app.setLoginItemSettings({ openAtLogin: autoStart, path: process.execPath })
  } catch { /* dev mode or unsupported platform */ }

  // Read hotkey from config, fallback to default
  const cfgPath = join(getDataDir(), 'config.json')
  const appConfig = safeReadJSON<Record<string, unknown>>(cfgPath, {})
  const hotkey = (appConfig.hotkey as string) || 'Ctrl+Shift+Q'

  const registered = globalShortcut.register(hotkey, toggleWindow)
  if (!registered) {
    console.error(`Failed to register ${hotkey} global shortcut`)
    // Fallback to default
    if (hotkey !== 'Ctrl+Shift+Q') {
      globalShortcut.register('Ctrl+Shift+Q', toggleWindow)
    }
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Keep running as tray app
app.on('window-all-closed', () => {
  // do nothing
})
