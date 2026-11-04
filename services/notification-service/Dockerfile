FROM node:20-alpine AS builder
WORKDIR /app
COPY notification-service/package.json ./notification-service/package.json
WORKDIR /app/notification-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY notification-service/tsconfig.json ./tsconfig.json
COPY notification-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/notification-service
COPY --from=builder --chown=appuser:appgroup /app/notification-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/notification-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/notification-service/package.json ./
USER appuser
EXPOSE 4009
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4009/health || exit 1
CMD ["node","dist/notification-service/src/server.js"]