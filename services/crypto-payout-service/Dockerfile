# ============================================================
# Crypto Payout Service — Production Dockerfile
#
# Signs and broadcasts on-chain TRC-20 transfers, then posts
# the matching double-entry ledger record (external-first).
#
# Fail-closed: with no TRON credentials configured the service
# starts but every /withdraw call is rejected (501 NOT_CONFIGURED).
# It never falls back to a simulated broadcast.
#
# Security notes:
#   - Non-root user (uid 1001)
#   - No dev dependencies in the final image
#   - The hot-wallet private key is injected at runtime via the
#     environment only; it is never baked into the image.
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --production

# ── Stage 2: Runtime ────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

USER appuser

EXPOSE 4014

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4014/health || exit 1

CMD ["node", "dist/server.js"]
