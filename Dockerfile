# Kisi bhi hosting (Railway, Fly.io, VPS, etc.) ke liye container image.
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
