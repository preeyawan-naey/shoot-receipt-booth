# Build from repository root (Render / Railway):
#   docker build -f Dockerfile .
FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
