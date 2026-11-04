FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node","dist/gateway.js"]