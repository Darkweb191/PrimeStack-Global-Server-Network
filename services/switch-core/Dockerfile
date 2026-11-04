FROM node:20-alpine AS builder
WORKDIR /app
COPY switch-core/package.json ./switch-core/package.json
WORKDIR /app/switch-core
RUN npm install --ignore-scripts --no-audit --no-fund
COPY switch-core/tsconfig.json ./tsconfig.json
COPY switch-core/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/switch-core
COPY --from=builder --chown=appuser:appgroup /app/switch-core/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/switch-core/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/switch-core/package.json ./
USER appuser
EXPOSE 4010
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4010/health || exit 1
CMD ["node","dist/switch-core/src/server.js"]