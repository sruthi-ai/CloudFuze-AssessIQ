# AssessIQ — Phase 1

AI-powered universal assessment platform. Phase 1 covers the complete foundation.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui |
| Backend | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh tokens) |
| Email | Resend |
| Cache/Queue | Redis (Phase 2+) |

## Quick Start

### 1. Prerequisites
- Node.js 20+
- Docker Desktop (for PostgreSQL)

### 2. Start the database
```bash
docker-compose up -d
```

### 3. Configure environment
```bash
cp .env.example backend/.env
# Edit backend/.env as needed
```

### 4. Install dependencies
```bash
npm install
```

### 5. Run database migrations and seed
```bash
cd backend
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

### 6. Start both servers
```bash
cd ..
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **Prisma Studio:** `cd backend && npx prisma studio`

## Demo credentials

| Field | Value |
|-------|-------|
| Workspace | `demo-company` |
| Email | `admin@demo.com` |
| Password | `Password123!` |

## API Overview

```
POST   /api/auth/register       Create company + admin user
POST   /api/auth/login          Login
POST   /api/auth/refresh        Refresh access token
POST   /api/auth/logout         Logout
GET    /api/auth/me             Current user

GET    /api/tests               List tests
POST   /api/tests               Create test
GET    /api/tests/:id           Get test with sections/questions
PATCH  /api/tests/:id           Update test
PATCH  /api/tests/:id/status    Publish / archive
POST   /api/tests/:id/sections  Add section
POST   /api/tests/:id/questions Add question to test
DELETE /api/tests/:id/questions/:tqId Remove question

GET    /api/questions           List questions (with filters)
POST   /api/questions           Create question
PATCH  /api/questions/:id       Update question
GET    /api/questions/banks     List question banks
POST   /api/questions/banks     Create bank

POST   /api/candidates/invite   Bulk invite candidates
GET    /api/candidates          List candidates

GET    /api/sessions/invite/:token  Validate invite link
POST   /api/sessions/start          Start session
GET    /api/sessions/:id/questions  Get test questions
POST   /api/sessions/:id/answers    Save answer
POST   /api/sessions/:id/submit     Submit assessment

GET    /api/results             List all results (admin)
GET    /api/results/:id         Result detail + answers
PATCH  /api/results/:id/answers/:answerId  Human grade override
GET    /api/results/dashboard/stats  Dashboard stats
```

## Phase Roadmap

| Phase | Status | Features |
|-------|--------|---------|
| 1 — Foundation | ✅ **Done** | Auth, test builder, question bank, invite flow, test-taking, scoring |
| 2 — Proctoring | Next | Webcam recording, screen capture, tab detection, flag events, reports |
| 3 — Code Domain | Planned | Monaco editor, Judge0 execution, test cases, code plagiarism |
| 4 — AI Layer | Planned | Face detection, gaze estimation, GPT-4 essay scoring |
| 5 — Psychometric | Planned | Adaptive testing, personality/cognitive assessments |
| 6 — Scale | Planned | White-label, ATS integrations, analytics, SOC 2 |
