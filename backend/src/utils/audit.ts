import { Prisma } from '@prisma/client'
import { prisma } from '../db'

export async function logAudit(params: {
  tenantId: string
  userId: string
  action: string
  entityType: string
  entityId?: string
  metadata?: Record<string, unknown>
}) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch {
    // Audit logging is best-effort — never block the main operation
  }
}
