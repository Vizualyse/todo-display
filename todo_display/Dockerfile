# Supervisor passes BUILD_FROM, but this add-on needs Debian's Chromium, so it uses
# the official Node image for every arch.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium \
    PORT=8099
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
EXPOSE 8099
CMD ["node", "server/index.js"]
