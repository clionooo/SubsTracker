// 原创图标生成器：纯 Node（zlib PNG 编码）+ SDF 几何渲染
// 图案：靛蓝渐变圆角方块 + 白色铃铛（提醒主题）
// 用法: node scripts/gen-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- SDF 工具 ----------
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const opUnion = (...ds) => Math.min(...ds);

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function sdTrapezoid(px, py, cx, cy, r1, r2, he) {
  // iq's sdTrapezoid：r1 = 顶部半宽（y=-he），r2 = 底部半宽（y=+he）
  const x = Math.abs(px - cx), y = py - cy;
  const k1x = r2, k1y = he;
  const k2x = r2 - r1, k2y = 2 * he;
  const ax = x - Math.min(x, y < 0 ? r1 : r2);
  const ay = Math.abs(y) - he;
  const dx = x - k1x, dy = y - k1y;
  const t = clamp((-dx * k2x - dy * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
  const cbx = dx + k2x * t;
  const cby = dy + k2y * t;
  const s = cbx < 0 && ay < 0 ? -1 : 1;
  return s * Math.min(Math.hypot(ax, ay), Math.hypot(cbx, cby));
}

// 铃铛 SDF（512 逻辑坐标）
function sdBell(px, py) {
  return opUnion(
    sdCircle(px, py, 256, 186, 14),                    // 顶部提环
    sdCircle(px, py, 256, 272, 78),                    // 钟顶圆拱
    sdTrapezoid(px, py, 256, 320, 78, 108, 55),        // 钟身
    sdRoundRect(px, py, 256, 379, 80, 11, 8),          // 底部横条
    sdCircle(px, py, 256, 402, 15)                     // 铃锤
  );
}

// 背景色：靛蓝渐变
function bgColor(t) {
  const top = [99, 102, 241];    // #6366f1
  const bottom = [67, 56, 202];  // #4338ca
  return [mix(top[0], bottom[0], t), mix(top[1], bottom[1], t), mix(top[2], bottom[2], t)];
}

function render(size, { rounded = true, bellScale = 1.0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 512; // 逻辑坐标缩放
  const corner = rounded ? 90 * s : 0;
  const bellAALimit = 1.5 * s;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5), py = (y + 0.5);
      let r, g, b, a = 255;

      // 铃铛（按比例缩放，以画布中心为基准）
      const lx = 256 + (px - size / 2) / s / bellScale;
      const ly = 256 + (py - size / 2) / s / bellScale;
      const dBell = sdBell(lx, ly) * bellScale * s;

      if (rounded) {
        const dRect = sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, corner);
        const alphaBg = 1 - smoothstep(-1.0, 1.0, dRect);
        if (alphaBg <= 0) { rgba[(y * size + x) * 4 + 3] = 0; continue; }
        const [br, bg2, bb] = bgColor(py / size);
        r = br; g = bg2; b = bb;
        a = Math.round(alphaBg * 255);
      } else {
        const [br, bg2, bb] = bgColor(py / size);
        r = br; g = bg2; b = bb;
      }

      // 白色铃铛 + 抗锯齿
      const bellAlpha = 1 - smoothstep(-bellAALimit, bellAALimit, dBell);
      if (bellAlpha > 0) {
        r = mix(r, 255, bellAlpha);
        g = mix(g, 255, bellAlpha);
        b = mix(b, 255, bellAlpha);
      }

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = a;
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const fpkIcons = path.join(ROOT, 'fpk-template');
fs.mkdirSync(fpkIcons, { recursive: true });
fs.mkdirSync(path.join(fpkIcons, 'app', 'ui', 'images'), { recursive: true });

const outputs = [
  ['icon-512.png', render(512, { rounded: true }), outDir],
  ['icon-192.png', render(192, { rounded: true }), outDir],
  ['icon-maskable-512.png', render(512, { rounded: false, bellScale: 0.68 }), outDir],
  ['apple-touch-icon.png', render(180, { rounded: false, bellScale: 0.82 }), outDir],
  ['ICON.PNG', render(64, { rounded: true }), fpkIcons],
  ['ICON_256.PNG', render(256, { rounded: true }), fpkIcons],
  ['icon-64.png', render(64, { rounded: true }), path.join(fpkIcons, 'app', 'ui', 'images')],
  ['icon-256.png', render(256, { rounded: true }), path.join(fpkIcons, 'app', 'ui', 'images')],
];

for (const [name, buf, dir] of outputs) {
  fs.writeFileSync(path.join(dir, name), buf);
  console.log('生成:', path.relative(ROOT, path.join(dir, name)), `${buf.length} bytes`);
}
console.log('图标生成完成');
