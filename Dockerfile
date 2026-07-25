# Kisi bhi hosting (Railway, Fly.io, VPS, etc.) ke liye container image.
# Zero dependencies — koi npm install nahi chahiye.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NO_OPEN=1
EXPOSE 3000
CMD ["node", "server.js"]
