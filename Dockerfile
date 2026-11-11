# Pdf VERSE - backend + frontend ek hi container me
# LibreOffice (Word/Excel/PPT -> PDF) aur Chromium (HTML -> PDF) included.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive \
    CHROME_PATH=/usr/bin/chromium \
    SOFFICE_PATH=/usr/bin/soffice

# System programs + fonts (Hindi/Devanagari ke liye fonts-noto-core bhi)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-calc \
      libreoffice-impress \
      chromium \
      fontconfig \
      fonts-liberation \
      fonts-noto-core \
      fonts-noto-color-emoji \
      ca-certificates \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies (vite devDependency hai, isliye build tak dev bhi install)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Source + frontend build
COPY . .
RUN npm run build && npm prune --omit=dev

# Render/Railway PORT env khud set karte hain; server process.env.PORT padhta hai
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
