# Backend image (Render / Railway / Fly.io). Includes LibreOffice + Chromium
# so Office -> PDF and HTML -> PDF work.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      chromium fonts-liberation fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server

EXPOSE 5000
CMD ["node", "server/index.js"]
