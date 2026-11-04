FROM node:20-alpine AS builder
WORKDIR /app
COPY audit-service/package.json ./audit-service/package.json
WORKDIR /app/audit-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY audit-service/tsconfig.json ./tsconfig.json
COPY audit-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/audit-service
COPY --from=builder --chown=appuser:appgroup /app/audit-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/audit-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/audit-service/package.json ./
USER appuser
EXPOSE 4007
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4007/health || exit 1
CMD ["node","dist/audit-service/src/server.js"]