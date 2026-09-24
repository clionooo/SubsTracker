// 极简 5 段式 cron 解析与调度（分钟 小时 日 月 周）
// 支持：* 、数字 、列表(1,2) 、区间(1-5) 、步进(*/5 , 1-10/2)
export function cronMatches(expr, date) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  for (let i = 0; i < 5; i++) {
    if (!matchField(fields[i], values[i], ranges[i])) return false;
  }
  return true;
}

function matchField(field, value, [min, max]) {
  return field.split(',').some((part) => {
    let step = 1;
    const stepSplit = part.split('/');
    if (stepSplit.length === 2) {
      step = parseInt(stepSplit[1], 10);
      if (!Number.isFinite(step) || step <= 0) return false;
      part = stepSplit[0];
    }
    let lo = min, hi = max;
    if (part !== '*') {
      const rangeSplit = part.split('-');
      if (rangeSplit.length === 2) {
        lo = parseInt(rangeSplit[0], 10);
        hi = parseInt(rangeSplit[1], 10);
      } else {
        const n = parseInt(part, 10);
        if (!Number.isFinite(n)) return false;
        if (stepSplit.length === 2) { lo = n; hi = max; } // "5/10" 表示从 5 开始每 10
        else { lo = n; hi = n; }
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
    }
    for (let v = lo; v <= hi; v += step) {
      // 周字段：0 和 7 都表示周日
      if (v === value || (max === 6 && v % 7 === value % 7 && value === 0 && (v === 0 || v === 7))) return true;
      if (v === value) return true;
    }
    return false;
  });
}

export function startCron(expressions, onFire, { timezoneNote = '' } = {}) {
  let lastMinute = -1;
  const tick = () => {
    const now = new Date();
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (minuteKey === lastMinute) return;
    lastMinute = minuteKey;
    for (const expr of expressions) {
      if (cronMatches(expr, now)) {
        console.log(`[cron] 触发定时任务: "${expr}" 本地时间 ${now.toLocaleString('zh-CN')}${timezoneNote}`);
        Promise.resolve()
          .then(() => onFire(expr))
          .catch((err) => console.error('[cron] 定时任务执行失败:', err));
      }
    }
  };
  const timer = setInterval(tick, 1000 * 15);
  tick();
  return () => clearInterval(timer);
}
