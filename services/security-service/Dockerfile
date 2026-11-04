FROM node:20-alpine AS builder
WORKDIR /app
COPY security-service/package.json ./security-service/package.json
WORKDIR /app/security-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY security-service/tsconfig.json ./tsconfig.json
COPY security-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/security-service
COPY --from=builder --chown=appuser:appgroup /app/security-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/security-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/security-service/package.json ./
USER appuser
EXPOSE 4011
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4011/health || exit 1
CMD ["node","dist/security-service/src/server.js"]