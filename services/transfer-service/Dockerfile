FROM node:20-alpine AS builder
WORKDIR /app
COPY transfer-service/package.json ./transfer-service/package.json
WORKDIR /app/transfer-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY transfer-service/tsconfig.json ./tsconfig.json
COPY transfer-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/transfer-service
COPY --from=builder --chown=appuser:appgroup /app/transfer-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/transfer-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/transfer-service/package.json ./
USER appuser
EXPOSE 4005
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4005/health || exit 1
CMD ["node","dist/transfer-service/src/server.js"]