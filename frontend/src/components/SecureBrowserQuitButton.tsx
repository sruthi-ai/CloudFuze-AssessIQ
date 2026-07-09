import { LogOut } from 'lucide-react'

/**
 * Small always-visible exit affordance shown ONLY when the app is running inside
 * the AssessIQ Secure Browser. The Electron main process shows a confirmation
 * dialog before actually quitting (and records an early-exit if a test is live),
 * so a candidate is never trapped in the locked-down window.
 */
export function SecureBrowserQuitButton() {
  const inSecureBrowser = !!(window as any).__SECURE_BROWSER__
  if (!inSecureBrowser) return null

  const quit = () => {
    const bridge = (window as any).__secureBrowserBridge__
    if (bridge?.requestQuit) bridge.requestQuit()
  }

  return (
    <button
      onClick={quit}
      title="Exit the secure browser (Ctrl+Shift+Q)"
      className="fixed top-3 right-3 z-[9999] flex items-center gap-1.5 rounded-md border border-gray-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-red-50 hover:border-red-300 hover:text-red-700"
    >
      <LogOut className="h-3.5 w-3.5" />
      Exit
    </button>
  )
}
