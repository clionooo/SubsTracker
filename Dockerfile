# SubsTracker 本地版 —— 零 npm 依赖，无需 install
FROM node:22-alpine

LABEL org.opencontainers.image.title="SubsTracker" \
      org.opencontainers.image.description="订阅管理与提醒系统（本地自部署版）" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package.json index.js ./
COPY src ./src
COPY public ./public

# 数据持久化目录（挂载卷）
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    TZ=Asia/Shanghai

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/_health >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.js"]
