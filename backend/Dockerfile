# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install all deps (including dev) so prisma generate and tsx are available
RUN npm install --include=dev

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Prisma migration engine requires OpenSSL
RUN apk add --no-cache openssl

# Copy built output, prisma schema/migrations, and full node_modules
# (full node_modules needed so `tsx` is available for the seed script)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
