FROM node:20-alpine AS builder
WORKDIR /app
COPY terminal-service/package.json ./terminal-service/package.json
WORKDIR /app/terminal-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY terminal-service/tsconfig.json ./tsconfig.json
COPY terminal-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/terminal-service
COPY --from=builder --chown=appuser:appgroup /app/terminal-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/terminal-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/terminal-service/package.json ./
USER appuser
EXPOSE 4004
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4004/health || exit 1
CMD ["node","dist/terminal-service/src/server.js"]