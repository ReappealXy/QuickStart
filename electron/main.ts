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
import { join, basename, dirname, extname } from 'path'
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
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto'
import koffi from 'koffi'

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
let floatingWindow: BrowserWindow | null = null

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
// Floating Window
// ============================================================

// 桌面便签是否固定到桌面底层
let floatingPinned = true

/**
 * 从配置读取便签自动显示设置
 * @return 是否自动显示
 */
function getFloatingAutoShow(): boolean {
  var cfg = readConfig() as Record<string, unknown>
  return cfg.floatingAutoShow === true
}

/**
 * 保存便签自动显示设置到配置
 * @param enabled 是否开启
 */
function setFloatingAutoShow(enabled: boolean): void {
  var c = readConfig() as Record<string, unknown>
  c.floatingAutoShow = enabled
  writeConfig(c as ConfigV3)
}

/**
 * 应用固定模式到浮动窗口
 * 固定=桌面小组件效果：不置顶（不遮挡其他窗口），但 Win+D 不消失
 */
function applyPinMode(): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return
  floatingWindow.setAlwaysOnTop(false)
  floatingWindow.setSkipTaskbar(true)
}

/**
 * 将窗口挂载为桌面 SHELLDLL_DefView 的子窗口
 * 挂载后窗口属于桌面层，Win+D 不会影响
 * @param win 要挂载的 BrowserWindow
 */
function attachToDesktop(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  try {
    var user32 = koffi.load('user32.dll')
    // koffi 文档：Numbers / BigInt / null 均可作为 void* 参数传递
    var FindWindowExA = user32.func('void* __stdcall FindWindowExA(void*, void*, const char*, const char*)')
    var GetDesktopWindow = user32.func('void* __stdcall GetDesktopWindow()')
    var SetWindowLongPtrA = user32.func('long long __stdcall SetWindowLongPtrA(void*, int, void*)')

    // 先在 Progman 下查找 SHELLDLL_DefView
    var progman = FindWindowExA(null, null, 'Progman', null)
    var defView = FindWindowExA(progman, null, 'SHELLDLL_DefView', null)

    // 若不在 Progman 下，遍历 WorkerW 窗口查找
    if (!defView) {
      var desktop = GetDesktopWindow()
      var workerW = FindWindowExA(desktop, null, 'WorkerW', null)
      while (workerW && !defView) {
        defView = FindWindowExA(workerW, null, 'SHELLDLL_DefView', null)
        if (!defView) workerW = FindWindowExA(desktop, workerW, 'WorkerW', null)
      }
    }

    if (defView) {
      var GWLP_HWNDPARENT = -8
      var hwndBuf = win.getNativeWindowHandle()
      // getNativeWindowHandle() 返回 Buffer（x64: 8 字节），读取为 BigInt 传入 void*
      var hwndVal = hwndBuf.length >= 8 ? hwndBuf.readBigUInt64LE() : BigInt(hwndBuf.readUInt32LE())
      SetWindowLongPtrA(hwndVal, GWLP_HWNDPARENT, defView)
      console.log('[FloatingWindow] attachToDesktop: success')
    } else {
      console.warn('[FloatingWindow] attachToDesktop: SHELLDLL_DefView not found')
    }
  } catch (err) {
    console.error('[FloatingWindow] attachToDesktop failed:', err)
  }
}

/**
 * 创建或显示桌面浮动窗口
 * 固定模式下：始终可见，Win+D / 失焦不隐藏
 */
function createFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show()
    floatingWindow.focus()
    return
  }

  var cfg = readConfig() as Record<string, unknown>
  var savedBounds = cfg.floatingBounds as { x: number; y: number; width: number; height: number } | undefined
  var display = screen.getPrimaryDisplay()
  var { width: sw, height: sh } = display.workAreaSize

  var winW = savedBounds?.width || 340
  var winH = savedBounds?.height || 480
  var winX = savedBounds?.x ?? Math.round(sw - winW - 40)
  var winY = savedBounds?.y ?? Math.round((sh - winH) / 2)

  floatingWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: true,
    minWidth: 260,
    minHeight: 280,
    show: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    var devUrl = process.env['ELECTRON_RENDERER_URL']
    floatingWindow.loadURL(devUrl.replace(/\/index\.html$/, '/floating.html').replace(/\/$/, '') + '/floating.html')
  } else {
    floatingWindow.loadFile(join(__dirname, '../renderer/floating.html'))
  }

  floatingWindow.once('ready-to-show', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.show()
      applyPinMode()
      attachToDesktop(floatingWindow)
    }
  })

  floatingWindow.on('close', (e) => {
    e.preventDefault()
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      var bounds = floatingWindow.getBounds()
      var c = readConfig() as Record<string, unknown>
      c.floatingBounds = bounds
      writeConfig(c as ConfigV3)
      floatingWindow.hide()
    }
  })

  floatingWindow.on('closed', () => { floatingWindow = null })
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
      { label: '桌面便签', click: () => createFloatingWindow() },
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
// Clipboard History Engine
// ============================================================
interface ClipboardItem {
  id: string
  type: 'text' | 'image'
  content: string
  preview: string
  timestamp: number
  imagePath?: string
}

let clipboardHistory: ClipboardItem[] = []
let lastClipText = ''
let lastClipImgHash = ''
let clipMonitorTimer: ReturnType<typeof setInterval> | null = null
let clipSaveTimer: ReturnType<typeof setTimeout> | null = null
let isWritingBack = false

const MAX_CLIP_ITEMS = 500
const MAX_TEXT_STORE = 10000

function getClipboardStorageDir(): string {
  const cfg = readConfig() as Record<string, unknown>
  const custom = cfg.clipboardStoragePath as string | undefined
  const dir = custom || join(app.getPath('userData'), 'clipboard_storage')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getClipHistoryPath(): string {
  return join(getClipboardStorageDir(), 'clipboard_history.json')
}

function loadClipHistory(): void {
  clipboardHistory = safeReadJSON<ClipboardItem[]>(getClipHistoryPath(), [])
}

function saveClipHistoryToDisk(): void {
  safeWriteJSON(getClipHistoryPath(), clipboardHistory)
}

function scheduleClipSave(): void {
  if (clipSaveTimer) return
  clipSaveTimer = setTimeout(() => {
    clipSaveTimer = null
    saveClipHistoryToDisk()
  }, 2000)
}

function addClipItem(item: ClipboardItem): void {
  // Deduplicate: remove identical text entries
  if (item.type === 'text') {
    clipboardHistory = clipboardHistory.filter(
      i => !(i.type === 'text' && i.content === item.content)
    )
  }
  clipboardHistory.unshift(item)
  // Trim excess and delete orphan image files
  if (clipboardHistory.length > MAX_CLIP_ITEMS) {
    const removed = clipboardHistory.splice(MAX_CLIP_ITEMS)
    const storageDir = getClipboardStorageDir()
    for (const r of removed) {
      if (r.imagePath) {
        try { unlinkSync(join(storageDir, r.imagePath)) } catch {}
      }
    }
  }
  scheduleClipSave()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('clipboard:newItem', item)
  }
}

function startClipboardMonitor(): void {
  loadClipHistory()
  // Seed trackers with current clipboard state so we don't re-capture existing content
  try {
    lastClipText = clipboard.readText() || ''
    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      lastClipImgHash = createHash('md5').update(img.toPNG()).digest('hex')
    }
  } catch {}

  clipMonitorTimer = setInterval(() => {
    if (isWritingBack) return
    try {
      // 1. Check for image content
      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const buf = img.toPNG()
        const hash = createHash('md5').update(buf).digest('hex')
        if (hash !== lastClipImgHash) {
          lastClipImgHash = hash
          lastClipText = ''
          const fileName = `clip_${Date.now()}.png`
          writeFileSync(join(getClipboardStorageDir(), fileName), buf)
          // Higher-res fallback thumbnail (400px wide) for list preview
          const sz = img.getSize()
          const tw = Math.min(400, sz.width)
          const th = Math.max(1, Math.round(sz.height * (tw / Math.max(sz.width, 1))))
          const thumb = sz.width > 400 ? img.resize({ width: tw, height: th }) : img
          addClipItem({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            type: 'image',
            content: '',
            preview: thumb.toDataURL(),
            timestamp: Date.now(),
            imagePath: fileName
          })
        }
        return
      }

      // 2. Check for text content
      let text = clipboard.readText() || ''
      // iconv-lite fallback for garbled text (Windows GBK edge case)
      if (text && /\ufffd/.test(text)) {
        try {
          const iconv = require('iconv-lite')
          for (const enc of ['gbk', 'gb2312', 'big5']) {
            try {
              const raw = clipboard.readBuffer('text/plain')
              if (raw && raw.length > 0) {
                const decoded = iconv.decode(raw, enc)
                if (decoded && !/\ufffd/.test(decoded)) { text = decoded; break }
              }
            } catch {}
          }
        } catch {}
      }

      if (text && text.trim() && text !== lastClipText) {
        lastClipText = text
        lastClipImgHash = ''
        const content = text.length > MAX_TEXT_STORE
          ? text.substring(0, MAX_TEXT_STORE) + '…'
          : text
        addClipItem({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          type: 'text',
          content,
          preview: text.substring(0, 200),
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      console.error('[ClipboardMonitor]', err)
    }
  }, 1000)
}

function stopClipboardMonitor(): void {
  if (clipMonitorTimer) { clearInterval(clipMonitorTimer); clipMonitorTimer = null }
  if (clipSaveTimer) {
    clearTimeout(clipSaveTimer); clipSaveTimer = null
    saveClipHistoryToDisk()
  }
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

  // ---- Floating Window ----
  ipcMain.handle('floating:create', () => {
    createFloatingWindow()
    return { success: true }
  })

  ipcMain.handle('floating:close', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) floatingWindow.hide()
    return { success: true }
  })

  ipcMain.handle('floating:setOpacity', (_e, value: number) => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setOpacity(Math.max(0.2, Math.min(1, value)))
    }
    return { success: true }
  })

  ipcMain.handle('floating:isOpen', () => {
    return floatingWindow !== null && !floatingWindow.isDestroyed() && floatingWindow.isVisible()
  })

  ipcMain.handle('floating:setPinned', (_e, pinned: boolean) => {
    floatingPinned = pinned
    // 固定=桌面小组件，不置顶；关闭固定=普通窗口
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setAlwaysOnTop(false)
    }
    return { success: true, pinned }
  })

  ipcMain.handle('floating:isPinned', () => {
    return floatingPinned
  })

  ipcMain.handle('floating:setAutoShow', (_e, enabled: boolean) => {
    setFloatingAutoShow(enabled)
    return { success: true, enabled }
  })

  ipcMain.handle('floating:getAutoShow', () => {
    return getFloatingAutoShow()
  })

  ipcMain.handle('floating:getBounds', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      return floatingWindow.getBounds()
    }
    return { x: 0, y: 0, width: 340, height: 480 }
  })

  ipcMain.handle('floating:setBounds', (_e, bounds: { x: number; y: number; width: number; height: number }) => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.setBounds(bounds)
    }
    return { success: true }
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

  function resolveQuickstartMediaPath(fileName: string, preferredWsId: string): string | null {
    const decodedName = decodeURIComponent(fileName)
    const cfg = readConfig()
    const candidates: string[] = []

    candidates.push(join(getWsAttachDir(preferredWsId), decodedName))

    const activeWsId = cfg.activeWorkspaceId || 'default'
    if (activeWsId !== preferredWsId) {
      candidates.push(join(getWsAttachDir(activeWsId), decodedName))
    }

    for (const ws of cfg.workspaces) {
      if (ws.id === preferredWsId || ws.id === activeWsId) continue
      candidates.push(join(getWsAttachDir(ws.id), decodedName))
    }

    candidates.push(join(getDataDir(), 'workspaces', 'default', 'attachments', decodedName))

    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return null
  }

  function rewriteQuickstartImagesForMdExport(markdown: string, exportMdPath: string, wsId: string): string {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    const mediaPrefix = 'quickstart://media/'
    const exportDir = dirname(exportMdPath)
    const mdBaseName = basename(exportMdPath, extname(exportMdPath))
    const assetsDirName = `${mdBaseName}_attachments`
    const copiedBySource = new Map<string, string>()
    let assetsDirPath: string | null = null

    const ensureAssetsDir = () => {
      if (!assetsDirPath) {
        assetsDirPath = join(exportDir, assetsDirName)
        if (!existsSync(assetsDirPath)) mkdirSync(assetsDirPath, { recursive: true })
      }
      return assetsDirPath
    }

    const extractTargetUrl = (rawTarget: string): string => {
      const target = rawTarget.trim()
      if (target.startsWith('<')) {
        const end = target.indexOf('>')
        if (end > 1) return target.slice(1, end).trim()
      }
      const spaceIndex = target.search(/\s/)
      return spaceIndex >= 0 ? target.slice(0, spaceIndex).trim() : target
    }

    return markdown.replace(imageRegex, (full, altText: string, rawTarget: string) => {
      const url = extractTargetUrl(rawTarget)
      if (!url.startsWith(mediaPrefix)) return full

      const rawName = url.slice(mediaPrefix.length).split(/[?#]/)[0]
      if (!rawName) return full

      const sourcePath = resolveQuickstartMediaPath(rawName, wsId)
      if (!sourcePath) return full

      let relPath = copiedBySource.get(sourcePath)
      if (!relPath) {
        const assetsPath = ensureAssetsDir()
        let targetName = basename(sourcePath)
        const fileExt = extname(targetName)
        const fileBase = basename(targetName, fileExt)
        let destPath = join(assetsPath, targetName)
        let index = 2

        while (existsSync(destPath)) {
          targetName = `${fileBase}_${index}${fileExt}`
          destPath = join(assetsPath, targetName)
          index++
        }

        copyFileSync(sourcePath, destPath)
        relPath = `./${assetsDirName}/${targetName}`.replace(/\\/g, '/')
        copiedBySource.set(sourcePath, relPath)
      }

      return `![${altText}](${relPath})`
    })
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
        const exportedMarkdown = rewriteQuickstartImagesForMdExport(merged.trim(), result.filePath, targetWsId)
        writeFileSync(result.filePath, exportedMarkdown, 'utf-8')

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
        const exportedMarkdown = rewriteQuickstartImagesForMdExport(merged, result.filePath, wsId)
        writeFileSync(result.filePath, exportedMarkdown, 'utf-8')
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

  // ---- Todos v2 (single-file storage with date ranges) ----

  /**
   * 获取 todos.json 文件路径
   * @return 完整路径
   */
  function getTodosFilePath(): string {
    var dir = getTodosDir()
    return join(dir, 'todos.json')
  }

  /**
   * 读取全部任务列表
   * @return TodoItem[]
   */
  function readAllTodos(): { id: string; title: string; description: string; done: boolean; color: string | null; quadrant: string | null; startDate: string; endDate: string | null; order: number; createdAt: string; doneAt?: string; timerLimit?: number; timerSpent?: number; completedDuration?: number }[] {
    var filePath = getTodosFilePath()
    if (!existsSync(filePath)) return []
    var store = safeReadJSON<{ version?: number; items?: unknown[] }>(filePath, { items: [] })
    return (Array.isArray(store.items) ? store.items : []) as any[]
  }

  /**
   * 写入全部任务列表
   * @param items 任务数组
   */
  function writeAllTodos(items: unknown[]): void {
    safeWriteJSON(getTodosFilePath(), { version: 2, items })
  }

  ipcMain.handle('todos:list', () => readAllTodos())

  /**
   * 新增任务
   * @param item 不含 id/createdAt/order 的任务数据
   * @return { success, id }
   */
  ipcMain.handle('todos:add', (_e, item: { title: string; description?: string; done?: boolean; color?: string | null; quadrant?: string | null; startDate?: string; endDate?: string | null }) => {
    try {
      var list = readAllTodos()
      var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      var today = new Date().toISOString().slice(0, 10)
      var newItem = {
        id,
        title: item.title || '',
        description: item.description || '',
        done: item.done || false,
        color: item.color || null,
        quadrant: item.quadrant || null,
        startDate: item.startDate || today,
        endDate: item.endDate || null,
        order: list.length,
        createdAt: new Date().toISOString(),
      }
      list.push(newItem)
      writeAllTodos(list)
      return { success: true, id }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /**
   * 更新单条任务
   * @param id 任务 ID
   * @param partial 要更新的字段
   */
  ipcMain.handle('todos:update', (_e, id: string, partial: Record<string, unknown>) => {
    try {
      var list = readAllTodos()
      var idx = list.findIndex(t => t.id === id)
      if (idx < 0) return { success: false, error: 'not found' }
      list[idx] = { ...list[idx], ...partial }
      writeAllTodos(list)
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /** @param id 要删除的任务 ID */
  ipcMain.handle('todos:delete', (_e, id: string) => {
    try {
      var list = readAllTodos()
      writeAllTodos(list.filter(t => t.id !== id))
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /**
   * 批量重排序
   * @param ids 有序 ID 数组
   */
  ipcMain.handle('todos:reorder', (_e, ids: string[]) => {
    try {
      var list = readAllTodos()
      var map = new Map(list.map(t => [t.id, t]))
      var ordered = ids.map((id, i) => {
        var item = map.get(id)
        if (item) { item.order = i; map.delete(id) }
        return item
      }).filter(Boolean)
      // 追加不在 ids 中的项
      var remaining = [...map.values()]
      remaining.forEach((t, i) => { t!.order = ordered.length + i })
      writeAllTodos([...ordered, ...remaining])
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /**
   * 按月汇总任务数据（基于 startDate 维度）
   * @param yearMonth YYYY-MM 格式
   * @return { [date]: { total, done } }
   */
  ipcMain.handle('todos:monthSummary', (_e, yearMonth: string) => {
    try {
      var list = readAllTodos()
      var summary: Record<string, { total: number; done: number }> = {}
      list.forEach(item => {
        var start = item.startDate || ''
        var end = item.endDate || start
        if (!start) return
        // 遍历任务覆盖的每一天
        var cur = start
        while (cur <= end && cur.slice(0, 7) <= yearMonth) {
          if (cur.startsWith(yearMonth)) {
            if (!summary[cur]) summary[cur] = { total: 0, done: 0 }
            summary[cur].total++
            if (item.done) summary[cur].done++
          }
          // 下一天
          var d = new Date(cur + 'T00:00:00')
          d.setDate(d.getDate() + 1)
          cur = d.toISOString().slice(0, 10)
        }
      })
      return summary
    } catch { return {} }
  })

  /**
   * 导出任务为 Markdown 或 PDF
   * @param startDate 起始日期
   * @param endDate 结束日期
   * @param format md | pdf
   */
  ipcMain.handle('todos:export', async (_e, startDate: string, endDate: string, format: 'md' | 'pdf') => {
    if (!mainWindow) return { success: false, error: 'no window' }
    try {
      var list = readAllTodos()
      // 筛选日期范围内有交集的任务
      var filtered = list.filter(item => {
        var s = item.startDate || ''
        var e = item.endDate || s
        return s <= endDate && e >= startDate
      })
      if (filtered.length === 0) return { success: false, error: '选定日期范围内没有清单' }

      // 按 startDate 分组
      var groups = new Map<string, typeof filtered>()
      filtered.forEach(item => {
        var key = item.startDate || 'unknown'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      })
      var sortedDates = [...groups.keys()].sort()

      var defaultName = startDate === endDate
        ? `QuickStart_Todos_${startDate}`
        : `QuickStart_Todos_${startDate}_${endDate}`

      var mdContent = ''
      var totalItems = 0
      sortedDates.forEach(date => {
        if (mdContent) mdContent += '\n\n---\n\n'
        mdContent += `# ${date}\n\n`
        groups.get(date)!.forEach(item => {
          mdContent += `- [${item.done ? 'x' : ' '}] ${item.title}${item.endDate ? ` (→${item.endDate})` : ''}\n`
          totalItems++
        })
      })

      if (format === 'md') {
        var result = await dialog.showSaveDialog(mainWindow, {
          title: '导出清单 Markdown',
          defaultPath: `${defaultName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }
        writeFileSync(result.filePath, mdContent.trim(), 'utf-8')
        return { success: true, filePath: result.filePath, count: totalItems }
      }

      if (format === 'pdf') {
        var result2 = await dialog.showSaveDialog(mainWindow, {
          title: '导出清单 PDF',
          defaultPath: `${defaultName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result2.canceled || !result2.filePath) return { success: false, canceled: true }
        var MarkdownIt = require('markdown-it')
        var md = new MarkdownIt({ html: true, breaks: true })
        var htmlBody = md.render(mdContent.trim())
        var fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.8; font-size: 14px; max-width: 700px; margin: 0 auto; }
          h1 { font-size: 20px; color: #6d28d9; border-bottom: 2px solid #ede9fe; padding-bottom: 8px; margin-top: 32px; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
          ul { padding-left: 24px; list-style: none; }
          li { margin-bottom: 6px; position: relative; padding-left: 8px; }
          li input[type="checkbox"] { margin-right: 8px; }
        </style></head><body>${htmlBody}</body></html>`
        var pdfWin = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { contextIsolation: true } })
        await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`)
        var pdfData = await pdfWin.webContents.printToPDF({ printBackground: true, marginsType: 0, pageSize: 'A4' })
        pdfWin.destroy()
        writeFileSync(result2.filePath, pdfData)
        return { success: true, filePath: result2.filePath, count: totalItems }
      }

      return { success: false, error: '不支持的格式' }
    } catch (err) { return { success: false, error: String(err) } }
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
      // Protect: cannot delete if only one workspace left
      if (cfg.workspaces.length <= 1) return { success: false, error: '至少需要保留一个工作区' }

      const ws = cfg.workspaces.find((w) => w.id === wsId)
      cfg.workspaces = cfg.workspaces.filter((w) => w.id !== wsId)
      if (cfg.activeWorkspaceId === wsId) cfg.activeWorkspaceId = 'default'
      writeConfig(cfg)

      // Backup workspace folder and then delete
      if (ws) {
        const wsDir = join(getWorkspacesRoot(), ws.folderName)
        if (existsSync(wsDir)) {
          // Backup recursively using cpSync
          const backupDir = join(tmpdir(), `quickstart-ws-${ws.folderName}-${Date.now()}`)
          try {
            const { cpSync, rmSync } = require('fs')
            cpSync(wsDir, backupDir, { recursive: true, force: true })
            // Now delete the original folder
            rmSync(wsDir, { recursive: true, force: true })
          } catch (backupErr) {
            console.error('Workspace backup/delete error:', backupErr)
          }
        }
      }
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // --- Global root path management ---
  ipcMain.handle('storage:getRootPath', () => {
    return getWorkspacesRoot()
  })

  ipcMain.handle('storage:setRootPath', async (_e, newPath: string | null, migrate: boolean = true) => {
    try {
      const cfg = readConfig()
      const oldRoot = getWorkspacesRoot()
      const targetRoot = newPath || join(app.getPath('documents'), 'QuickStart')

      // Normalize paths for comparison
      const normOld = oldRoot.replace(/[\\/]+$/, '').toLowerCase()
      const normTarget = targetRoot.replace(/[\\/]+$/, '').toLowerCase()

      // Skip if same path
      if (normOld === normTarget) {
        return { success: true, oldRoot, newRoot: targetRoot, migrated: false }
      }

      // Check for subdirectory relationship
      const isSubdir = normTarget.startsWith(normOld + '\\') || normTarget.startsWith(normOld + '/')
      const isParent = normOld.startsWith(normTarget + '\\') || normOld.startsWith(normTarget + '/')

      // Validate target path is writable
      if (!existsSync(targetRoot)) {
        mkdirSync(targetRoot, { recursive: true })
      }
      // Test write permission
      const testFile = join(targetRoot, '.write-test')
      writeFileSync(testFile, 'test')
      unlinkSync(testFile)

      const { cpSync, rmSync } = require('fs')
      let didMigrate = false

      if (migrate && existsSync(oldRoot)) {
        if (isSubdir) {
          // Target is subdirectory of source: move workspace folders
          const targetBasename = basename(targetRoot)
          for (const ws of cfg.workspaces) {
            const srcDir = join(oldRoot, ws.folderName)
            if (existsSync(srcDir) && ws.folderName.toLowerCase() !== targetBasename.toLowerCase()) {
              const destDir = join(targetRoot, ws.folderName)
              cpSync(srcDir, destDir, { recursive: true, force: true })
              rmSync(srcDir, { recursive: true, force: true })
            }
          }
          didMigrate = true
        } else if (isParent) {
          // Source is subdirectory of target: move workspace folders up
          for (const ws of cfg.workspaces) {
            const srcDir = join(oldRoot, ws.folderName)
            const destDir = join(targetRoot, ws.folderName)
            if (existsSync(srcDir) && !existsSync(destDir)) {
              cpSync(srcDir, destDir, { recursive: true, force: true })
            }
          }
          rmSync(oldRoot, { recursive: true, force: true })
          didMigrate = true
        } else {
          // Normal case: different paths
          for (const ws of cfg.workspaces) {
            const srcDir = join(oldRoot, ws.folderName)
            const destDir = join(targetRoot, ws.folderName)
            if (existsSync(srcDir)) {
              cpSync(srcDir, destDir, { recursive: true, force: true })
            }
          }
          rmSync(oldRoot, { recursive: true, force: true })
          didMigrate = true
        }
      }

      // Update config
      if (newPath) {
        cfg.rootPath = newPath
      } else {
        delete cfg.rootPath // reset to default
      }
      writeConfig(cfg)

      // Ensure all workspace folders exist in new root
      for (const ws of cfg.workspaces) {
        const dir = join(targetRoot, ws.folderName)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        ensureWsStructure(ws.id)
      }

      return { success: true, oldRoot, newRoot: targetRoot, migrated: didMigrate }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // --- Global todos path management ---
  ipcMain.handle('storage:getTodosPath', () => {
    return getTodosDir()
  })

  ipcMain.handle('storage:setTodosPath', async (_e, newPath: string | null, migrate: boolean = true) => {
    try {
      const cfg = readConfig() as Record<string,unknown>
      const oldDir = getTodosDir()
      const targetDir = newPath || join(app.getPath('documents'), 'QuickStart', 'Todos')

      // Normalize paths for comparison
      const normOld = oldDir.replace(/[\\/]+$/, '').toLowerCase()
      const normTarget = targetDir.replace(/[\\/]+$/, '').toLowerCase()

      // Skip if same path
      if (normOld === normTarget) {
        return { success: true, oldPath: oldDir, newPath: targetDir, migrated: false }
      }

      // Check for subdirectory relationship
      const isSubdir = normTarget.startsWith(normOld + '\\') || normTarget.startsWith(normOld + '/')
      const isParent = normOld.startsWith(normTarget + '\\') || normOld.startsWith(normTarget + '/')

      // Validate target path is writable
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
      }

      const { cpSync, rmSync } = require('fs')
      let didMigrate = false

      if (migrate && existsSync(oldDir)) {
        if (isSubdir) {
          // Target is subdirectory of source
          const targetBasename = basename(targetDir)
          for (const item of readdirSync(oldDir)) {
            if (item.toLowerCase() === targetBasename.toLowerCase()) continue
            const src = join(oldDir, item)
            const dest = join(targetDir, item)
            cpSync(src, dest, { recursive: true, force: true })
            rmSync(src, { recursive: true, force: true })
          }
          didMigrate = true
        } else if (isParent) {
          // Source is subdirectory of target
          for (const item of readdirSync(oldDir)) {
            const src = join(oldDir, item)
            const dest = join(targetDir, item)
            if (!existsSync(dest)) {
              cpSync(src, dest, { recursive: true, force: true })
            }
          }
          rmSync(oldDir, { recursive: true, force: true })
          didMigrate = true
        } else {
          // Normal case
          cpSync(oldDir, targetDir, { recursive: true, force: true })
          rmSync(oldDir, { recursive: true, force: true })
          didMigrate = true
        }
      }

      // Update config
      if (newPath) {
        cfg.todosPath = newPath
      } else {
        delete cfg.todosPath // reset to default
      }
      writeConfig(cfg as ConfigV3)

      return { success: true, oldPath: oldDir, newPath: targetDir, migrated: didMigrate }
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

  // ---- AI Export Session ----
  ipcMain.handle('ai:exportSession', async (_e, sessionId: string, format: 'md' | 'pdf') => {
    if (!mainWindow) return { success: false, error: 'no window' }
    try {
      const sessionPath = join(sessionsDir, `${sessionId}.json`)
      if (!existsSync(sessionPath)) return { success: false, error: '找不到该对话' }

      const session = safeReadJSON<{ id: string; title: string; messages: Array<{ role: string; content: string; timestamp?: number }> }>(sessionPath, { id: '', title: '', messages: [] })
      if (!session.messages || session.messages.length === 0) return { success: false, error: '对话内容为空' }

      const defaultName = `QuickStart_AI_${session.title || sessionId}`.replace(/[\\/:*?"<>|]/g, '_')

      if (format === 'md') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 Markdown',
          defaultPath: `${defaultName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }

        let mdContent = `# ${session.title || '新对话'}\n\n`
        for (const msg of session.messages) {
          const roleLabel = msg.role === 'user' ? '**用户**' : '**AI**'
          mdContent += `${roleLabel}:\n\n${msg.content}\n\n---\n\n`
        }
        writeFileSync(result.filePath, mdContent.trim(), 'utf-8')
        return { success: true, filePath: result.filePath }
      }

      if (format === 'pdf') {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出 PDF',
          defaultPath: `${defaultName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result.canceled || !result.filePath) return { success: false, canceled: true }

        const MarkdownIt = require('markdown-it')
        const md = new MarkdownIt({ html: true, breaks: true, linkify: true })

        let mdContent = `# ${session.title || '新对话'}\n\n`
        for (const msg of session.messages) {
          const roleLabel = msg.role === 'user' ? '**用户**' : '**AI**'
          mdContent += `${roleLabel}:\n\n${msg.content}\n\n---\n\n`
        }

        const htmlBody = md.render(mdContent.trim())
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.8; font-size: 14px; max-width: 700px; margin: 0 auto; }
          h1 { font-size: 22px; color: #6d28d9; border-bottom: 3px solid #8b5cf6; padding-bottom: 12px; margin-bottom: 24px; }
          strong { color: #7c3aed; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; }
          pre code { background: none; padding: 0; color: inherit; }
          blockquote { border-left: 3px solid #8b5cf6; padding-left: 16px; color: #6b7280; margin: 16px 0; }
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

  // ---- Prompts ----
  var PROMPTS_DEFAULT: { id: string; name: string; tag: string; content: string; isPinned: boolean; createdAt: number }[] = [
    {
      id: 'default_1',
      name: '文章润色专家',
      tag: '写作',
      content: '请将下面的文本润色为更通顺、更专业的中文，同时保留原意并给出三种不同风格（正式、亲切、技术性）的改写版本。',
      isPinned: false,
      createdAt: Date.now(),
    },
    {
      id: 'default_2',
      name: 'Tailwind 助手',
      tag: '编程',
      content: '根据下面的 UI 描述，生成对应的 Tailwind CSS 类名与简短示例 HTML，包含响应式样式和可访问性建议。',
      isPinned: false,
      createdAt: Date.now(),
    },
    {
      id: 'default_3',
      name: '市场文案生成器',
      tag: '营销',
      content: '为一款目标用户为职场人士的时间管理工具，生成三条不同角度的产品宣传文案（简洁、情感、功能导向），并包含一句 30 字以内的广告语。',
      isPinned: false,
      createdAt: Date.now(),
    },
  ]

  /**
   * 获取提示词存储文件路径（支持自定义）
   * @return 完整的 prompts.json 路径
   */
  function getPromptsFilePath(): string {
    var cfg = readConfig() as Record<string, unknown>
    var custom = cfg.promptsStoragePath as string | undefined
    var dir = custom || dataDir
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'prompts.json')
  }

  /**
   * 读取提示词列表，首次加载写入默认数据
   * @return PromptItem[]
   */
  ipcMain.handle('prompts:list', () => {
    var filePath = getPromptsFilePath()
    // 仅文件不存在时写入默认数据；已存在的空列表视为用户已清空
    if (!existsSync(filePath)) {
      safeWriteJSON(filePath, PROMPTS_DEFAULT)
      return PROMPTS_DEFAULT
    }
    var list = safeReadJSON<unknown[]>(filePath, [])
    return Array.isArray(list) ? list : []
  })

  /**
   * 新增或更新单条提示词
   * @param prompt 提示词对象，无 id 时新增
   * @return { success, id }
   */
  ipcMain.handle('prompts:save', (_e, prompt: { id?: string; name: string; tag: string; content: string; isPinned?: boolean }) => {
    try {
      var list = safeReadJSON<{ id: string; name: string; tag: string; content: string; isPinned: boolean; createdAt: number }[]>(getPromptsFilePath(), [])
      if (prompt.id) {
        var idx = list.findIndex(p => p.id === prompt.id)
        if (idx >= 0) {
          list[idx] = { ...list[idx], name: prompt.name, tag: prompt.tag, content: prompt.content, isPinned: prompt.isPinned ?? list[idx].isPinned }
        } else {
          // id 存在但列表中找不到（撤销删除等场景），追加回去
          list.push({ id: prompt.id, name: prompt.name, tag: prompt.tag, content: prompt.content, isPinned: prompt.isPinned ?? false, createdAt: Date.now() })
        }
      } else {
        var newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
        list.push({ id: newId, name: prompt.name, tag: prompt.tag, content: prompt.content, isPinned: prompt.isPinned ?? false, createdAt: Date.now() })
        prompt.id = newId
      }
      safeWriteJSON(getPromptsFilePath(), list)
      return { success: true, id: prompt.id }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /** @param id 要删除的提示词 ID */
  ipcMain.handle('prompts:delete', (_e, id: string) => {
    try {
      var list = safeReadJSON<{ id: string }[]>(getPromptsFilePath(), [])
      var filtered = list.filter(p => p.id !== id)
      safeWriteJSON(getPromptsFilePath(), filtered)
      return { success: true }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /** @param items 要导入的 JSON 数组，替换现有数据 */
  ipcMain.handle('prompts:import', (_e, items: unknown[]) => {
    try {
      if (!Array.isArray(items)) return { success: false, error: '格式无效' }
      var normalized = items.map((item: any) => ({
        id: item.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: item.name || '',
        tag: item.tag || '',
        content: item.content || '',
        isPinned: !!item.isPinned,
        createdAt: item.createdAt || Date.now(),
      }))
      safeWriteJSON(getPromptsFilePath(), normalized)
      return { success: true, count: normalized.length }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('prompts:export', async () => {
    try {
      var list = safeReadJSON<unknown[]>(getPromptsFilePath(), [])
      var result = await dialog.showSaveDialog({
        title: '导出提示词',
        defaultPath: `prompts_backup_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }
      writeFileSync(result.filePath, JSON.stringify(list, null, 2), 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (err) { return { success: false, error: String(err) } }
  })

  /** @return 当前提示词存储目录 */
  ipcMain.handle('prompts:getStoragePath', () => {
    var cfg = readConfig() as Record<string, unknown>
    return (cfg.promptsStoragePath as string) || dataDir
  })

  /**
   * 设置提示词自定义存储路径并迁移数据
   * @param newPath 新路径，null 表示恢复默认
   * @param migrate 是否将旧数据迁移到新路径
   */
  ipcMain.handle('prompts:setStoragePath', (_e, newPath: string | null, migrate: boolean = true) => {
    try {
      var cfg = readConfig() as Record<string, unknown>
      var oldFile = getPromptsFilePath()
      var targetDir = newPath || dataDir

      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
      var newFile = join(targetDir, 'prompts.json')

      // 迁移旧文件到新位置
      var didMigrate = false
      if (migrate && existsSync(oldFile) && oldFile !== newFile) {
        var oldData = safeReadJSON<unknown[]>(oldFile, [])
        if (oldData.length > 0) {
          safeWriteJSON(newFile, oldData)
          didMigrate = true
        }
      }

      if (newPath) {
        cfg.promptsStoragePath = newPath
      } else {
        delete cfg.promptsStoragePath
      }
      writeConfig(cfg as ConfigV3)
      return { success: true, path: getPromptsFilePath(), migrated: didMigrate }
    } catch (err) { return { success: false, error: String(err) } }
  })

  // ---- Clipboard History ----
  ipcMain.handle('clipboard:getHistory', (_e, limit: number = 100, offset: number = 0) => {
    return { items: clipboardHistory.slice(offset, offset + limit), total: clipboardHistory.length }
  })

  ipcMain.handle('clipboard:writeBack', async (_e, itemId: string) => {
    const item = clipboardHistory.find(i => i.id === itemId)
    if (!item) return { success: false, error: 'not found' }
    isWritingBack = true
    try {
      if (item.type === 'text') {
        clipboard.writeText(item.content)
        lastClipText = item.content
      } else if (item.type === 'image' && item.imagePath) {
        const imgPath = join(getClipboardStorageDir(), item.imagePath)
        if (existsSync(imgPath)) {
          const img = nativeImage.createFromPath(imgPath)
          clipboard.writeImage(img)
          lastClipImgHash = createHash('md5').update(img.toPNG()).digest('hex')
        }
      }
      return { success: true }
    } finally {
      setTimeout(() => { isWritingBack = false }, 1500)
    }
  })

  ipcMain.handle('clipboard:deleteItem', (_e, itemId: string) => {
    const idx = clipboardHistory.findIndex(i => i.id === itemId)
    if (idx < 0) return { success: false }
    const [removed] = clipboardHistory.splice(idx, 1)
    if (removed.imagePath) {
      try { unlinkSync(join(getClipboardStorageDir(), removed.imagePath)) } catch {}
    }
    scheduleClipSave()
    return { success: true }
  })

  ipcMain.handle('clipboard:updateItem', (_e, itemId: string, content: string) => {
    const item = clipboardHistory.find(i => i.id === itemId)
    if (!item || item.type !== 'text') return { success: false }
    item.content = content
    item.preview = content.substring(0, 200)
    scheduleClipSave()
    return { success: true }
  })

  ipcMain.handle('clipboard:clearHistory', () => {
    const storageDir = getClipboardStorageDir()
    for (const item of clipboardHistory) {
      if (item.imagePath) {
        try { unlinkSync(join(storageDir, item.imagePath)) } catch {}
      }
    }
    clipboardHistory = []
    saveClipHistoryToDisk()
    return { success: true }
  })

  ipcMain.handle('clipboard:getStoragePath', () => getClipboardStorageDir())

  ipcMain.handle('clipboard:setStoragePath', (_e, newPath: string | null, migrate: boolean = true) => {
    try {
      const cfg = readConfig() as Record<string, unknown>
      const oldDir = getClipboardStorageDir()
      const targetDir = newPath || join(app.getPath('documents'), 'QuickStart', 'Clipboard')

      // Normalize paths for comparison
      const normOld = oldDir.replace(/[\\/]+$/, '').toLowerCase()
      const normTarget = targetDir.replace(/[\\/]+$/, '').toLowerCase()

      // Skip if same path
      if (normOld === normTarget) {
        return { success: true, path: targetDir, migrated: false }
      }

      // Check for subdirectory relationship
      const isSubdir = normTarget.startsWith(normOld + '\\') || normTarget.startsWith(normOld + '/')
      const isParent = normOld.startsWith(normTarget + '\\') || normOld.startsWith(normTarget + '/')

      // Ensure target exists
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

      const { cpSync, rmSync } = require('fs')
      let didMigrate = false

      if (migrate && existsSync(oldDir)) {
        if (isSubdir) {
          // Target is subdirectory of source: move files from old to new (excluding the target folder itself)
          const targetBasename = basename(targetDir)
          for (const item of readdirSync(oldDir)) {
            if (item.toLowerCase() === targetBasename.toLowerCase()) continue // skip the target folder
            const src = join(oldDir, item)
            const dest = join(targetDir, item)
            cpSync(src, dest, { recursive: true, force: true })
            rmSync(src, { recursive: true, force: true })
          }
          didMigrate = true
        } else if (isParent) {
          // Source is subdirectory of target: just move files up, then delete old folder
          for (const item of readdirSync(oldDir)) {
            const src = join(oldDir, item)
            const dest = join(targetDir, item)
            if (!existsSync(dest)) {
              cpSync(src, dest, { recursive: true, force: true })
            }
          }
          rmSync(oldDir, { recursive: true, force: true })
          didMigrate = true
        } else {
          // Normal case: different paths
          cpSync(oldDir, targetDir, { recursive: true, force: true })
          rmSync(oldDir, { recursive: true, force: true })
          didMigrate = true
        }
      }

      // Update config
      if (newPath) {
        cfg.clipboardStoragePath = newPath
      } else {
        delete cfg.clipboardStoragePath
      }
      writeConfig(cfg as ConfigV3)
      loadClipHistory()
      return { success: true, path: getClipboardStorageDir(), migrated: didMigrate }
    } catch (err) { return { success: false, error: String(err) } }
  })

  ipcMain.handle('clipboard:openStorageDir', () => {
    const { shell } = require('electron')
    shell.openPath(getClipboardStorageDir())
    return { success: true }
  })

  ipcMain.handle('clipboard:openInFolder', (_e, imagePath: string) => {
    const { shell } = require('electron')
    const fullPath = join(getClipboardStorageDir(), imagePath)
    if (existsSync(fullPath)) {
      shell.showItemInFolder(fullPath)
      return { success: true }
    }
    return { success: false, error: 'File not found' }
  })
}

// ============================================================
// App Lifecycle
// ============================================================
app.whenReady().then(async () => {
  // ── Register quickstart:// protocol to serve local files ──
  // quickstart://media/img_xxx.png  →  dynamic attachments dir / img_xxx.png
  protocol.handle('quickstart', (request) => {
    try {
      const url = new URL(request.url)
      const host = url.hostname
      const fileName = decodeURIComponent(url.pathname.replace(/^\//, ''))

      let filePath: string
      if (host === 'media') {
        const cfg = readConfig()
        filePath = join(getWsAttachDir(cfg.activeWorkspaceId || 'default'), fileName)
        if (!existsSync(filePath)) {
          for (const ws of cfg.workspaces) {
            const alt = join(getWsAttachDir(ws.id), fileName)
            if (existsSync(alt)) { filePath = alt; break }
          }
        }
        if (!existsSync(filePath)) {
          const legacyDir = join(getDataDir(), 'workspaces', 'default', 'attachments')
          const fallback = join(legacyDir, fileName)
          if (existsSync(fallback)) filePath = fallback
        }
      } else if (host === 'clipboard') {
        filePath = join(getClipboardStorageDir(), fileName)
      } else {
        filePath = join(getDataDir(), host, fileName)
      }

      if (!existsSync(filePath)) {
        return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Internal error', { status: 500, headers: { 'Content-Type': 'text/plain' } })
    }
  })

  ensureDataDirs()
  createWindow()
  await createTray()
  setupIPC()
  startClipboardMonitor()

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

  // 自动显示桌面便签（如果用户开启了持久化）
  if (getFloatingAutoShow()) {
    setTimeout(() => createFloatingWindow(), 1500)
  }
})

app.on('will-quit', () => {
  stopClipboardMonitor()
  globalShortcut.unregisterAll()
})

// Keep running as tray app
app.on('window-all-closed', () => {
  // do nothing
})
