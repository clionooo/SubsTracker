# SubsTracker — 订阅管理与提醒系统（本地自部署版）

> 订阅管理与提醒系统。跟踪各类订阅服务的到期时间，通过 Telegram、Bark、企业微信、Webhook、邮件等多渠道发送及时提醒。数据 100% 保存在本机。

本项目是 [mangguo02/sub](https://github.com/mangguo02/sub)（Cloudflare Workers 版，MIT License）的**本地化移植版**：将 Cloudflare KV 替换为本地文件存储、Workers Cron 替换为内置定时器，功能与原版保持一致，可自由部署在自己的服务器 / NAS 上。

## ✨ 功能特色（与原版一致）

- **订阅管理**：添加、编辑、删除各类订阅服务，支持自动续订计算
- **智能提醒**：自定义提前提醒天数，每日定时检查即将到期的订阅
- **日常提醒**（本版新增）：一次性 / 每周循环通知，支持星期几勾选与区间快选（工作日 / 周末 / 自定义区间），分钟级准点推送、按日期去重、一次性提醒推送后自动停用
- **仪表盘**（本版新增）：订阅与提醒概览、定时任务运行状态、今日提醒清单
- **多渠道通知**：Telegram / NotifyX / Webhook / 企业微信机器人 / Bark / Resend 邮件 / 自定义 Webhook 模板
- **农历显示**：1900-2100 年农历转换，列表与通知中可显示农历
- **第三方 API**：`POST /api/notify/{token}` 可从外部触发通知
- **移动端适配**：响应式设计，支持 iOS Safari「添加到主屏幕」当作 App 使用
- **数据本地化**：全部数据以 JSON 文件保存在本机，随时备份迁移

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
git clone https://github.com/clionooo/SubsTracker.git
cd SubsTracker
docker compose up -d
```

或修改 `docker-compose.yml` 中的端口后直接启动。访问 `http://IP:3000`。

### 方式二：直接运行（Node.js ≥ 18，零依赖）

```bash
node src/server.js
# 或
npm start
```

环境变量：`PORT`（默认 3000）、`DATA_DIR`（默认 ./data）、`CRON`（默认 `0 8 * * *`）、`TZ`。

### 方式三：飞牛 fnOS NAS

**直接安装预编译包（最简单）**：下载仓库 `release/` 目录下的 `substracker-v1.1.2.fpk`，在 fnOS 应用中心 → 手动安装 → 选择该文件即可。安装后桌面生成图标，访问端口 `36789`，默认账号 `admin` / `password`。运行时自动探测 Node 或 Bun（fnOS 应用中心的 bunjs 即可，无需另装 Node）。

自行打包见 [fpk/README-FPK.md](fpk/README-FPK.md)：执行 `bash fpk/build-fpk.sh` 生成 fpk（需 fnpack CLI），安装后在 fnOS 桌面生成图标。

## 📱 iOS 添加到主屏幕

用 Safari 打开系统地址 → 分享 → 「添加到主屏幕」，即可像 App 一样全屏使用（服务端会自动注入 PWA manifest 与图标，可通过环境变量 `PWA_INJECT=0` 关闭）。

## 🔑 默认账号

`admin` / `password` —— 登录后请立即在「系统配置」中修改账号密码，并配置通知渠道。

## ⏰ 定时提醒说明

- 默认每天 **8:00**（服务器本地时区）自动检查并推送即将到期的订阅
- 通过环境变量 `CRON` 自定义（5 段式 cron，多个任务用 `;` 分隔），例如每小时：`CRON=0 * * * *`
- Docker 部署时请同时设置 `TZ=Asia/Shanghai` 等时区，确保提醒时间符合预期

## 📂 数据与备份

所有数据保存在 `DATA_DIR`（Docker 卷挂载至 `/app/data`）：

```
data/
└── kv/
    └── SUBSCRIPTIONS_KV.json   # 订阅 + 系统配置（含账号密码，单文件，直接复制即备份）
```

## 🧱 架构说明

```
index.js          # 应用核心（移植自原版 Cloudflare Worker，含日常提醒与仪表盘扩展）
src/server.js     # Node 适配层：HTTP ↔ Worker fetch、静态资源、PWA 注入、分钟级提醒调度
src/kv.js         # 文件版 KV（兼容 Workers KV get/put/delete/list，原子写入）
src/cron.js       # 5 段式 cron 解析与调度（替代 Workers Cron Triggers）
public/           # PWA manifest 与图标
fpk-template/     # 飞牛 fnOS fpk 打包模板
release/          # 预编译 fpk 安装包（可直接在 fnOS 手动安装）
scripts/          # 图标生成脚本
```

Node.js ≥ 18 原生提供 `Request`/`Response`/`crypto.subtle`，因此核心代码零改动直接运行；项目**零 npm 依赖**。

## 📜 许可证

MIT License。核心代码基于 [mangguo02/sub](https://github.com/mangguo02/sub)（MIT, Copyright (c) 2025 一只会飞的旺旺）移植，原许可证与版权声明保留于 [LICENSE](LICENSE)。
