// 文件版 KV —— 兼容 Cloudflare Workers KV 的 get/put/delete/list 接口
// 数据以 JSON 文件形式保存在本地磁盘（DATA_DIR/kv/<namespace>.json）
import fs from 'node:fs';
import path from 'node:path';

export class FileKV {
  constructor(dataDir, namespace) {
    this.file = path.join(dataDir, 'kv', `${namespace}.json`);
    this.cache = null;
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.cache = JSON.parse(raw);
      if (typeof this.cache !== 'object' || this.cache === null || Array.isArray(this.cache)) {
        this.cache = {};
      }
    } catch {
      this.cache = {};
    }
  }

  _save() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    // 原子写：先写临时文件再 rename，避免断电/崩溃损坏数据
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  async get(key) {
    const v = this.cache[key];
    return v === undefined ? null : v;
  }

  // 兼容 KV 的 { type: 'json' | 'text' } 选项（本项目中数据均为字符串）
  async getWithMetadata(key) {
    return { value: await this.get(key), metadata: null };
  }

  async put(key, value) {
    if (typeof value !== 'string') value = String(value);
    this.cache[key] = value;
    this._save();
  }

  async delete(key) {
    delete this.cache[key];
    this._save();
  }

  async list({ prefix = '' } = {}) {
    return {
      keys: Object.keys(this.cache)
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }))
    };
  }
}
