FROM node:20-alpine AS builder
WORKDIR /app
COPY iso8583-gateway/package.json ./iso8583-gateway/package.json
WORKDIR /app/iso8583-gateway
RUN npm install --ignore-scripts --no-audit --no-fund
COPY iso8583-gateway/tsconfig.json ./tsconfig.json
COPY iso8583-gateway/src ./src
COPY shared ../shared
RUN npm run build
RUN npm prune --production
FROM node:20-alpine AS runtime
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
WORKDIR /app/iso8583-gateway
COPY --from=builder --chown=appuser:appgroup /app/iso8583-gateway/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/iso8583-gateway/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/iso8583-gateway/package.json ./
USER appuser
EXPOSE 4013
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4013/health || exit 1
CMD ["node","dist/iso8583-gateway/src/server.js"]