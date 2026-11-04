FROM node:20-alpine AS builder
WORKDIR /app
COPY risk-service/package.json ./risk-service/package.json
WORKDIR /app/risk-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY risk-service/tsconfig.json ./tsconfig.json
COPY risk-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/risk-service
COPY --from=builder --chown=appuser:appgroup /app/risk-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/risk-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/risk-service/package.json ./
USER appuser
EXPOSE 4006
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4006/health || exit 1
CMD ["node","dist/risk-service/src/server.js"]