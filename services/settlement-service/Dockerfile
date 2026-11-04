FROM node:20-alpine AS builder
WORKDIR /app
COPY settlement-service/package.json ./settlement-service/package.json
WORKDIR /app/settlement-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY settlement-service/tsconfig.json ./tsconfig.json
COPY settlement-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/settlement-service
COPY --from=builder --chown=appuser:appgroup /app/settlement-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/settlement-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/settlement-service/package.json ./
USER appuser
EXPOSE 4008
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4008/health || exit 1
CMD ["node","dist/settlement-service/src/server.js"]