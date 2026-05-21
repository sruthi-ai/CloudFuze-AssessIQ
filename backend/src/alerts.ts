// In-memory SSE registry for real-time proctor alerts.
// Single-process only — sufficient for this deployment model.

export interface AlertPayload {
  type: 'VIOLATION' | 'CONNECTED' | 'HEARTBEAT'
  sessionId?: string
  severity?: string
  eventType?: string
  description?: string | null
  occurredAt?: string
  candidate?: { firstName: string; lastName: string; email: string }
  test?: { id: string; title: string }
  riskScore?: number
}

type AlertSender = (data: AlertPayload) => void

const clients = new Map<string, Set<AlertSender>>()

export function addAlertClient(tenantId: string, send: AlertSender): void {
  if (!clients.has(tenantId)) clients.set(tenantId, new Set())
  clients.get(tenantId)!.add(send)
}

export function removeAlertClient(tenantId: string, send: AlertSender): void {
  const set = clients.get(tenantId)
  if (!set) return
  set.delete(send)
  if (set.size === 0) clients.delete(tenantId)
}

export function broadcastAlert(tenantId: string, payload: AlertPayload): void {
  const set = clients.get(tenantId)
  if (!set || set.size === 0) return
  set.forEach(send => {
    try { send(payload) } catch { /* client disconnected mid-send */ }
  })
}

export function connectedClientCount(tenantId: string): number {
  return clients.get(tenantId)?.size ?? 0
}
