FROM node:20-alpine AS builder
WORKDIR /app
COPY auth-service/package.json ./auth-service/package.json
WORKDIR /app/auth-service
RUN npm install --ignore-scripts --no-audit --no-fund
COPY auth-service/tsconfig.json ./tsconfig.json
COPY auth-service/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/auth-service
COPY --from=builder --chown=appuser:appgroup /app/auth-service/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/auth-service/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/auth-service/package.json ./
USER appuser
EXPOSE 4003
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4003/health || exit 1
CMD ["node","dist/auth-service/src/server.js"]