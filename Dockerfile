FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/
COPY index.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY img/ ./img/

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
