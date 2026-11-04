# ============================================================
# Ledger Service — Production Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder): compile TypeScript
#   Stage 2 (runtime): minimal Node.js image with only dist/
#
# Security notes:
#   - Non-root user (node uid 1000)
#   - No dev dependencies in final image
#   - Read-only filesystem (add :ro volumes in compose)
#   - Distroless-style: node:20-alpine has minimal attack surface
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Stage 2: Runtime ────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy only what's needed
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

USER appuser

EXPOSE 4001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4001/health || exit 1

CMD ["node", "dist/server.js"]
