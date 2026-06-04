import { FastifyInstance } from 'fastify'
import PDFDocument from 'pdfkit'
import { prisma } from '../db'
import { sendError } from '../utils/errors'
import { requireRole } from '../middleware/authenticate'

export async function scorecardRoutes(server: FastifyInstance) {
  const canView = requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'RECRUITER', 'VIEWER')

  // GET /api/scorecard/:sessionId — generate and stream a PDF scorecard
  server.get('/:sessionId', { preHandler: canView }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, test: { tenantId: request.user.tenantId } },
      include: {
        candidate: true,
        test: {
          include: {
            tenant: true,
            sections: {
              include: {
                testQuestions: { include: { question: true }, orderBy: { order: 'asc' } },
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        score: true,
        answers: { include: { question: true } },
        proctoringEvents: { orderBy: { occurredAt: 'asc' }, take: 100 },
      },
    })

    if (!session) return sendError(reply, 404, 'Session not found')

    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))

    const tenant = session.test.tenant
    const candidate = session.candidate
    const test = session.test
    const score = session.score
    const COLOR = '#6366f1'
    const GRAY = '#6b7280'
    const BLACK = '#111827'

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(48, 48, doc.page.width - 96, 72).fill(COLOR)
    doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold')
       .text(tenant.name, 64, 64)
    doc.fontSize(11).font('Helvetica')
       .text('Assessment Scorecard', 64, 88)
    doc.fillColor(BLACK)

    let y = 140

    // ── Candidate & Test Info ────────────────────────────────────────────────
    const infoLeft = (label: string, value: string, x: number, yPos: number) => {
      doc.fontSize(9).fillColor(GRAY).font('Helvetica').text(label, x, yPos)
      doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold').text(value, x, yPos + 13)
    }

    infoLeft('Candidate', `${candidate.firstName} ${candidate.lastName}`, 48, y)
    infoLeft('Email', candidate.email, 220, y)
    infoLeft('Assessment', test.title, 48, y + 40)
    infoLeft('Date', session.submittedAt
      ? new Date(session.submittedAt).toLocaleDateString('en-US', { dateStyle: 'long' })
      : 'Not submitted', 220, y + 40)

    y += 90

    // ── Score Summary ────────────────────────────────────────────────────────
    doc.rect(48, y, doc.page.width - 96, 60).fill('#f5f3ff')
    if (score) {
      const pct = Math.round(score.percentage)
      const passed = score.passed
      doc.fontSize(28).font('Helvetica-Bold').fillColor(COLOR)
         .text(`${pct}%`, 64, y + 12)
      doc.fontSize(11).font('Helvetica').fillColor(GRAY)
         .text(`${score.earnedPoints.toFixed(1)} / ${score.totalPoints} points`, 64, y + 42)

      if (passed !== null) {
        const badge = passed ? 'PASSED' : 'NOT PASSED'
        const badgeColor = passed ? '#16a34a' : '#dc2626'
        const badgeBg = passed ? '#dcfce7' : '#fee2e2'
        doc.rect(doc.page.width - 160, y + 12, 100, 28).fill(badgeBg)
        doc.fontSize(12).font('Helvetica-Bold').fillColor(badgeColor)
           .text(badge, doc.page.width - 155, y + 20)
      }
    } else {
      doc.fontSize(13).font('Helvetica').fillColor(GRAY)
         .text('Pending grading', 64, y + 20)
    }
    doc.fillColor(BLACK)
    y += 80

    // ── Section Breakdown ────────────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').fillColor(BLACK).text('Section Breakdown', 48, y)
    y += 20

    const answerMap = new Map(session.answers.map(a => [a.questionId, a]))

    for (const section of test.sections) {
      const sectionPoints = section.testQuestions.reduce((s, tq) => s + (tq.points ?? 0), 0)
      const sectionEarned = section.testQuestions.reduce((s, tq) => {
        const ans = answerMap.get(tq.questionId)
        return s + (ans?.pointsEarned ?? 0)
      }, 0)

      if (y > doc.page.height - 100) { doc.addPage(); y = 48 }

      doc.rect(48, y, doc.page.width - 96, 24).fill('#f9fafb')
      doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK)
         .text(section.title, 56, y + 7)
      doc.fontSize(10).font('Helvetica').fillColor(GRAY)
         .text(`${sectionEarned.toFixed(1)} / ${sectionPoints} pts`, doc.page.width - 130, y + 7)
      y += 28

      for (const tq of section.testQuestions) {
        if (y > doc.page.height - 60) { doc.addPage(); y = 48 }
        const ans = answerMap.get(tq.questionId)
        const earned = ans?.pointsEarned ?? 0
        const status = !ans ? 'Unanswered'
          : ans.gradingStatus === 'PENDING' ? 'Pending review'
          : `${earned.toFixed(1)} / ${tq.points} pts`
        const statusColor = !ans ? GRAY : earned > 0 ? '#16a34a' : '#dc2626'

        doc.fontSize(9).font('Helvetica').fillColor(BLACK)
           .text(`${tq.question.type.replace('_', ' ')} — ${tq.question.title.slice(0, 70)}${tq.question.title.length > 70 ? '…' : ''}`, 56, y, { width: doc.page.width - 180 })
        doc.fontSize(9).fillColor(statusColor).text(status, doc.page.width - 130, y)
        doc.fillColor(BLACK)
        y += 16
      }
      y += 6
    }

    // ── Proctoring Summary ───────────────────────────────────────────────────
    if (y > doc.page.height - 120) { doc.addPage(); y = 48 }
    y += 10
    doc.fontSize(13).font('Helvetica-Bold').fillColor(BLACK).text('Proctoring Summary', 48, y)
    y += 20

    const criticalEvents = session.proctoringEvents.filter(e => e.severity === 'CRITICAL')
    const highEvents = session.proctoringEvents.filter(e => e.severity === 'HIGH')
    const riskScore = 0 // computed separately via proctoring events

    doc.fontSize(10).font('Helvetica').fillColor(BLACK)
       .text(`Total violations: ${session.proctoringEvents.length}`, 48, y)
    doc.text(`Risk score: ${riskScore}/100`, 48, y + 14)
    doc.text(`Critical: ${criticalEvents.length}   High: ${highEvents.length}`, 48, y + 28)
    doc.text(`Session status: ${session.status}`, 48, y + 42)
    y += 62

    if (criticalEvents.length > 0) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626').text('Critical Events:', 48, y)
      y += 14
      for (const evt of criticalEvents.slice(0, 10)) {
        if (y > doc.page.height - 40) { doc.addPage(); y = 48 }
        doc.fontSize(9).font('Helvetica').fillColor(BLACK)
           .text(`• ${evt.type} — ${evt.description ?? ''} (${new Date(evt.occurredAt).toLocaleTimeString()})`, 56, y, { width: doc.page.width - 100 })
        y += 14
      }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
       .text(`Generated by ${tenant.name} via NeutaraAssessments`, 48, doc.page.height - 36, { align: 'center', width: doc.page.width - 96 })

    doc.end()

    await new Promise<void>(resolve => doc.on('end', resolve))
    const pdf = Buffer.concat(chunks)

    const safeName = `${candidate.lastName}_${candidate.firstName}_${test.title}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 60)
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeName}_scorecard.pdf"`)
      .header('Content-Length', pdf.length)
    return reply.send(pdf)
  })
}
