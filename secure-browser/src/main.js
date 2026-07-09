'use strict'

const { app, BrowserWindow, globalShortcut, screen, ipcMain, Menu, dialog } = require('electron')
const path = require('path')
const { execSync } = require('child_process')

// Exit cleanly during Squirrel Windows install/uninstall
if (require('electron-squirrel-startup')) { app.quit(); process.exit(0) }

const APP_URL = 'https://neutaraassessment.cftools.live'
const SECURE_BROWSER_UA_TAG = 'AssessIQ-Secure-Browser/1.1.0'

// Processes that indicate remote access or screen recording
const BLOCKED_PROCESSES = [
  'teamviewer', 'anydesk', 'vnc', 'rdpclip', 'mstsc',
  'obs', 'obs64', 'obs-studio', 'camtasia', 'bandicam',
  'screenpresso', 'snagit32', 'snagit64',
]

let mainWindow = null
let canClose = false
let quitting = false
let activeSessionId = null
let activeToken = null
const violationDebounce = new Map()

// ── Single instance ──────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

app.on('second-instance', (_, argv) => {
  const link = argv.find(a => a.startsWith('assessiq://'))
  if (link) handleDeepLink(link)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ── Deep link: assessiq://test/INVITE_TOKEN ──────────────────────────────────

app.setAsDefaultProtocolClient('assessiq')

function parseDeepLink(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'assessiq:') return null
    if (u.hostname === 'test') {
      const tok = u.pathname.replace(/^\//, '')
      return tok ? `${APP_URL}/take/${tok}` : APP_URL
    }
  } catch {}
  return null
}

function handleDeepLink(raw) {
  const url = parseDeepLink(raw)
  if (url && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(url)
}

app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url) })

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow(startUrl) {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: true,
    frame: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: false,
    alwaysOnTop: true,
    fullscreen: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: false,
    },
  })

  // Append secure browser tag to the UA so backend can verify
  mainWindow.webContents.setUserAgent(
    `${mainWindow.webContents.getUserAgent()} ${SECURE_BROWSER_UA_TAG}`
  )

  // Block screenshots and screen recording at OS level (macOS + Windows)
  mainWindow.setContentProtection(true)

  // Keep the window pinned above everything (taskbar, other apps) so a candidate
  // who Alt+Tabs away — which globalShortcut cannot fully block on Windows — is
  // snapped back and can't view other windows behind it.
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Block navigation to any domain outside AssessIQ
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost')) {
      event.preventDefault()
      reportViolation('NAVIGATION_BLOCKED', 'Blocked navigation to external URL')
    }
  })

  // Block new tabs and popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Auto-close devtools if somehow triggered
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools()
    reportViolation('DEVTOOLS_OPEN', 'DevTools opened in secure browser')
  })

  // Block right-click context menu
  mainWindow.webContents.on('context-menu', e => e.preventDefault())

  // Prevent focus loss — re-assert top-most and grab focus back if the candidate
  // manages to switch away (e.g. via Alt+Tab, which the OS may not let us block).
  mainWindow.on('blur', () => {
    // Skip while our own quit-confirmation dialog is open (it legitimately blurs the window).
    if (!mainWindow || mainWindow.isDestroyed() || canClose || quitting) return
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.moveTop()
    mainWindow.focus()
    // WINDOW_BLUR is the backend's whitelisted type for "left the test window".
    reportViolation('WINDOW_BLUR', 'Candidate attempted to leave the secure browser')
  })

  mainWindow.loadURL(startUrl)
}

// ── Shortcuts ────────────────────────────────────────────────────────────────

function registerShortcuts() {
  const blocked = [
    'F12', 'F11', 'F5',
    'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+R', 'Ctrl+F5',
    'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Ctrl+Shift+N', 'Ctrl+Shift+T',
    'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Alt+Tab', 'Alt+Shift+Tab', 'Alt+F4',
    'Super+D', 'Super+L', 'Super+Tab', 'Super+E', 'Super+R',
    'Command+Q', 'Command+W', 'Command+H', 'Command+M', 'Command+Tab',
    'Command+Shift+3', 'Command+Shift+4', 'Command+Shift+5',
    'Command+Option+Escape',
  ]
  blocked.forEach(sc => {
    try {
      globalShortcut.register(sc, () =>
        reportViolation('SHORTCUT_BLOCKED', `Blocked shortcut: ${sc}`)
      )
    } catch {}
  })
}

// ── Violation monitoring ─────────────────────────────────────────────────────

async function reportViolation(type, description) {
  const now = Date.now()
  const last = violationDebounce.get(type) ?? 0
  if (now - last < 10_000) return
  violationDebounce.set(type, now)
  await reportViolationImmediate(type, description)
}

// Non-debounced, awaited reporter — use when the event must be delivered before
// the app exits (e.g. an early quit).
async function reportViolationImmediate(type, description) {
  if (!activeSessionId || !activeToken) return
  try {
    await fetch(`${APP_URL}/api/proctoring/${activeSessionId}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, description, token: activeToken }),
    })
  } catch {}
}

function checkMultipleMonitors() {
  if (screen.getAllDisplays().length > 1) {
    reportViolation('MULTIPLE_MONITORS', `${screen.getAllDisplays().length} monitors detected`)
  }
}

function checkSuspiciousProcesses() {
  try {
    let list = ''
    if (process.platform === 'win32') {
      list = execSync('tasklist /FO CSV /NH', { timeout: 3000, windowsHide: true }).toString().toLowerCase()
    } else {
      list = execSync('ps -A -o comm=', { timeout: 3000 }).toString().toLowerCase()
    }
    BLOCKED_PROCESSES.forEach(proc => {
      if (list.includes(proc)) reportViolation('SUSPICIOUS_PROCESS', `Detected process: ${proc}`)
    })
  } catch {}
}

// ── Quit ───────────────────────────────────────────────────────────────────--

// Confirmed exit. If a test is in progress this is recorded as an early exit so
// the recruiter can see the attempt was abandoned. Always available so a
// candidate is never trapped in the locked-down window.
async function quitSecure() {
  if (quitting || !mainWindow || mainWindow.isDestroyed()) return
  quitting = true

  const inTest = !!activeSessionId
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: inTest ? ['Keep taking the test', 'Quit and exit'] : ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Quit Secure Browser',
    message: 'Exit the AssessIQ Secure Browser?',
    detail: inTest
      ? 'Your assessment is still in progress. Quitting now will leave the test unfinished, and the attempt will be recorded as exited early.'
      : 'You can reopen the secure browser and your test link at any time.',
    noLink: true,
  })

  if (response !== 1) { quitting = false; return } // chose Cancel/Keep

  if (inTest) await reportViolationImmediate('SECURE_BROWSER_QUIT', 'Candidate quit the secure browser before submitting (exited early)')

  canClose = true
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setClosable(true)
  app.exit(0)
}

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.on('set-session', (_, { sessionId, token }) => {
  activeSessionId = sessionId
  activeToken = token
})

ipcMain.on('request-quit', () => { quitSecure() })

ipcMain.on('allow-close', () => {
  canClose = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setClosable(true)
    mainWindow.setKiosk(false)
    mainWindow.setFullScreen(false)
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const deepLinkArg = process.argv.find(a => a.startsWith('assessiq://'))
  const startUrl = (deepLinkArg && parseDeepLink(deepLinkArg)) ?? `${APP_URL}/secure-browser/start`

  createWindow(startUrl)
  registerShortcuts()

  // Escape hatch: confirmed quit via keyboard, always available.
  try { globalShortcut.register('CommandOrControl+Shift+Q', () => quitSecure()) } catch {}

  setInterval(checkMultipleMonitors, 10_000)
  setInterval(checkSuspiciousProcesses, 15_000)
})

app.on('before-quit', e => {
  if (!canClose) e.preventDefault()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
