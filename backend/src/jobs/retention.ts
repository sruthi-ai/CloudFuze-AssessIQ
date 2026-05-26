import cron from 'node-cron'
import { unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '../db'
import { UPLOADS_DIR } from '../uploads'

const PROCTORING_RETENTION_DAYS = parseInt(process.env.PROCTORING_RETENTION_DAYS || '90')
const ROOM_SCAN_RETENTION_DAYS = parseInt(process.env.ROOM_SCAN_RETENTION_DAYS || '90')
const SNAPSHOT_RETENTION_DAYS = parseInt(process.env.SNAPSHOT_RETENTION_DAYS || '90')

// Runs daily at 02:00. Deletes old proctoring events and room scan files.
export function startRetentionJob() {
  cron.schedule('0 2 * * *', async () => {
    try {
      await runRetention()
    } catch (err) {
      console.error('[retention] job error:', err)
    }
  })
  console.log(`[retention] daily cleanup job started (proctoring=${PROCTORING_RETENTION_DAYS}d, snapshots=${SNAPSHOT_RETENTION_DAYS}d, room-scans=${ROOM_SCAN_RETENTION_DAYS}d)`)
}

async function runRetention() {
  const now = Date.now()

  // ── Proctoring events ──────────────────────────────────────────────────────
  const proctoringCutoff = new Date(now - PROCTORING_RETENTION_DAYS * 86_400_000)
  const { count: deletedEvents } = await prisma.proctoringEvent.deleteMany({
    where: { occurredAt: { lt: proctoringCutoff } },
  })
  if (deletedEvents > 0) {
    console.log(`[retention] deleted ${deletedEvents} proctoring event(s) older than ${PROCTORING_RETENTION_DAYS} days`)
  }

  // ── Webcam snapshots ──────────────────────────────────────────────────────
  const snapshotCutoff = new Date(now - SNAPSHOT_RETENTION_DAYS * 86_400_000)
  const oldSnapshots = await prisma.webcamSnapshot.findMany({
    where: { occurredAt: { lt: snapshotCutoff } },
    select: { id: true, url: true },
  })

  let deletedSnapshotFiles = 0
  for (const snap of oldSnapshots) {
    const relativePath = snap.url.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); deletedSnapshotFiles++ } catch { /* already gone */ }
    }
  }

  if (oldSnapshots.length > 0) {
    await prisma.webcamSnapshot.deleteMany({ where: { occurredAt: { lt: snapshotCutoff } } })
    console.log(`[retention] deleted ${oldSnapshots.length} snapshot record(s), ${deletedSnapshotFiles} file(s) older than ${SNAPSHOT_RETENTION_DAYS} days`)
  }

  // ── Room scan files + DB records ───────────────────────────────────────────
  const roomScanCutoff = new Date(now - ROOM_SCAN_RETENTION_DAYS * 86_400_000)
  const oldScans = await prisma.roomScan.findMany({
    where: { createdAt: { lt: roomScanCutoff } },
    select: { id: true, url: true },
  })

  let deletedFiles = 0
  for (const scan of oldScans) {
    // url format: /uploads/room-scans/file.webm — strip /uploads/ prefix
    const relativePath = scan.url.replace(/^\/uploads\//, '')
    const filePath = join(UPLOADS_DIR, relativePath)
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); deletedFiles++ } catch { /* file already gone */ }
    }
  }

  if (oldScans.length > 0) {
    await prisma.roomScan.deleteMany({ where: { createdAt: { lt: roomScanCutoff } } })
    console.log(`[retention] deleted ${oldScans.length} room scan record(s), ${deletedFiles} file(s) older than ${ROOM_SCAN_RETENTION_DAYS} days`)
  }
}
