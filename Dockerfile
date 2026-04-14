FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
ARG COMPOSE_VERSION=v2.29.7
RUN apt-get update && apt-get install -y --no-install-recommends \
    git docker.io openssh-client bash curl ca-certificates \
    && mkdir -p /usr/libexec/docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
       -o /usr/libexec/docker/cli-plugins/docker-compose \
    && chmod +x /usr/libexec/docker/cli-plugins/docker-compose \
    && apt-get purge -y curl && apt-get autoremove -y \
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
