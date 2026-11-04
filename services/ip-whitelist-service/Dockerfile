FROM node:20-alpine AS builder
WORKDIR /app
COPY ip-whitelist-service/package.json ./ip-whitelist-service/package.json
WORKDIR /app/ip-whitelist-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY ip-whitelist-service/tsconfig.json ./tsconfig.json
COPY ip-whitelist-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/ip-whitelist-service
COPY --from=builder --chown=appuser:appgroup /app/ip-whitelist-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/ip-whitelist-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/ip-whitelist-service/package.json ./
USER appuser
EXPOSE 4002
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4002/health || exit 1
CMD ["node","dist/ip-whitelist-service/src/server.js"]