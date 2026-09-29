// SubsTracker 本地版服务入口
// 将 Cloudflare Worker（index.js）适配到 Node.js：
//   - SUBSCRIPTIONS_KV  -> 本地 JSON 文件存储（DATA_DIR/kv/）
//   - Workers Cron 触发 -> 内置 cron 调度器（CRON 环境变量，默认 0 8 * * *）
//   - HTTP fetch        -> Node http server（Node 18+ 原生 Request/Response）
//   - PWA 注入          -> 为 iOS「添加到主屏幕」注入 meta/manifest（PWA_INJECT=1 时）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileKV } from './kv.js';
import { startCron } from './cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const CRON = (process.env.CRON || '0 8 * * *').split(';').map((s) => s.trim()).filter(Boolean);
const PWA_INJECT = process.env.PWA_INJECT !== '0';
const PUBLIC_DIR = path.join(ROOT, 'public');

// ---------- 构造 Worker 环境 ----------
const env = {
  SUBSCRIPTIONS_KV: new FileKV(DATA_DIR, 'SUBSCRIPTIONS_KV'),
};

const worker = (await import('../index.js')).default;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

// ---------- 时区自动校准 ----------
// 原版默认时区为 UTC，本地/NAS 部署时会与系统时间相差一个时区（如 +8 小时），
// 导致日常提醒的推送时间与用户设置不符。这里在启动时把系统时区写入配置。
const ENV_TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
async function syncTimezone() {
  if (!ENV_TIMEZONE || ENV_TIMEZONE === 'UTC') return null;
  try {
    const raw = await env.SUBSCRIPTIONS_KV.get('config');
    const config = raw ? JSON.parse(raw) : {};
    const current = config.TIMEZONE;
    if (current && current !== 'UTC') return current; // 已显式设置，尊重用户选择
    config.TIMEZONE = ENV_TIMEZONE;
    await env.SUBSCRIPTIONS_KV.put('config', JSON.stringify(config));
    console.log(`[时区] 配置时区已自动校准：${current || '(未设置)'} -> ${ENV_TIMEZONE}`);
    return ENV_TIMEZONE;
  } catch (err) {
    console.error('[时区] 自动校准失败:', err);
    return null;
  }
}
const ACTIVE_TIMEZONE = (await syncTimezone()) || ENV_TIMEZONE || 'UTC';

// ---------- Worker Request 适配 ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function nodeReqToWorkerRequest(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `http://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) headers.append(k, item);
  }
  const method = req.method.toUpperCase();
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await readBody(req);
    if (body.length > 0) {
      init.body = body;
      init.duplex = 'half';
    }
  }
  return new Request(url, init);
}

async function sendWorkerResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return; // 单独处理
    headers[key] = value;
  });
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  if (response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } else {
    res.end();
  }
}

// ---------- PWA 注入（iOS 添加到主屏幕适配） ----------
const PWA_META = [
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="SubsTracker">',
  '<meta name="theme-color" content="#4f46e5">',
  '<link rel="manifest" href="/manifest.json">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  '<link rel="icon" type="image/png" href="/icons/icon-192.png">',
].join('\n  ');

function injectPWA(html) {
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${PWA_META}\n</head>`);
  }
  return html;
}

// ---------- 静态资源（图标 / manifest） ----------
const MIME = { '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(pathname, res) {
  const rel = pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return false;
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

// ---------- 健康检查 ----------
function serveHealth(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', name: 'SubsTracker', time: new Date().toISOString() }));
}

// ---------- 服务器 ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/_health') return serveHealth(res);
    if (pathname === '/manifest.json' || pathname.startsWith('/icons/')) {
      if (serveStatic(pathname, res)) return;
    }

    const request = await nodeReqToWorkerRequest(req);
    const response = await worker.fetch(request, env, ctx);

    // HTML 响应注入 PWA meta
    const ctype = response.headers.get('content-type') || '';
    if (PWA_INJECT && ctype.includes('text/html')) {
      const html = await response.text();
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      const patched = new Response(injectPWA(html), { status: response.status, headers });
      return await sendWorkerResponse(res, patched);
    }
    return await sendWorkerResponse(res, response);
  } catch (err) {
    console.error('[server] 请求处理异常:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal Server Error', message: String(err?.message || err) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log('=========================================');
  console.log('  SubsTracker 订阅管理与提醒系统（本地版）');
  console.log('=========================================');
  console.log(`  监听地址 : http://${HOST}:${PORT}`);
  console.log(`  数据目录 : ${DATA_DIR}`);
  console.log(`  定时任务 : ${CRON.join(' ; ')}（服务器本地时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}）`);
  console.log(`  默认账号 : admin / password（登录后请在系统配置中修改）`);
  console.log('=========================================');
});

// ---------- 定时任务：与 Workers Cron 行为一致，调用 scheduled 处理器 ----------
startCron(CRON, async () => {
  const event = { cron: CRON[0], scheduledTime: Date.now(), type: 'scheduled', noRetry: () => {} };
  await worker.scheduled(event, env, ctx);
});

// ---------- 日常提醒：分钟级检查（按日期去重，不会重复推送） ----------
// 订阅到期检查跟随 CRON 触发；日常提醒需要按用户设置的具体时间点推送，
// 因此每分钟单独调用 reminderTick（index.js 提供，Cloudflare 部署时无此导出则跳过）。
if (typeof worker.reminderTick === 'function') {
  const reminderTimer = setInterval(() => {
    Promise.resolve()
      .then(() => worker.reminderTick({ scheduledTime: Date.now() }, env, ctx))
      .catch((err) => console.error('[日常提醒] 检查失败:', err));
  }, 1000 * 60);
  const unref = reminderTimer.unref && reminderTimer.unref();
  void unref;
}

// ---------- 优雅退出（确保数据落盘） ----------
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[cron] 收到 ${sig}，正在退出...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
