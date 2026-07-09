'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Expose secure browser flag — detected by TestPage.tsx via window.__SECURE_BROWSER__
contextBridge.exposeInMainWorld('__SECURE_BROWSER__', true)

// Expose IPC helpers for session tracking and lifecycle
contextBridge.exposeInMainWorld('__secureBrowserBridge__', {
  setSession: (sessionId, token) =>
    ipcRenderer.send('set-session', { sessionId, token }),
  notifySubmitted: () =>
    ipcRenderer.send('allow-close'),
  // Ask the main process to quit (it shows a confirmation dialog first).
  requestQuit: () =>
    ipcRenderer.send('request-quit'),
})
