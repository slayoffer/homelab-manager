FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git docker.io docker-compose-v2 openssh-client bash \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global --add safe.directory '*'
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY package.json ./
RUN mkdir -p /data

EXPOSE 3456
CMD ["node", "server/index.js"]
