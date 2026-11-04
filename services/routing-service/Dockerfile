FROM node:20-alpine AS builder
WORKDIR /app
COPY routing-service/package.json ./routing-service/package.json
WORKDIR /app/routing-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY routing-service/tsconfig.json ./tsconfig.json
COPY routing-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/routing-service
COPY --from=builder --chown=appuser:appgroup /app/routing-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/routing-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/routing-service/package.json ./
USER appuser
EXPOSE 4012
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4012/health || exit 1
CMD ["node","dist/routing-service/src/server.js"]