/* ============================================================
   通用工具：DOM 兜底、数值格式化、确定性随机
   ============================================================ */

/** 取元素，找不到返回 null */
export const $ = (id) => document.getElementById(id);

/**
 * 安全绑定事件：元素不存在时静默跳过。
 *
 * 这不是可有可无的防御——页面元素可能被外部编辑工具改动或删掉，
 * 一个 getElementById(...).addEventListener(...) 抛错就会中断整段脚本，
 * 导致后面的 render() 永远不执行，页面上看起来就是「点哪儿都没反应」。
 */
export function on(id, evt, fn, opts) {
  const el = typeof id === "string" ? $(id) : id;
  if (el) el.addEventListener(evt, fn, opts);
  return el;
}

/** 给一组元素逐个绑定（用 querySelectorAll 的结果） */
export function onAll(selector, evt, fn) {
  const list = document.querySelectorAll(selector);
  list.forEach((el) => el.addEventListener(evt, fn));
  return list;
}

/** 数字 → 带单位的可读文本：12000 → 1.2万 */
export function fmtV(v) {
  const n = Number(v) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  return n.toLocaleString("zh-CN");
}

/** 转义，避免书名/作者里的尖括号撑破 innerHTML */
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 字符串 → 32 位整数哈希，用作确定性随机的种子 */
export function hashStr(s) {
  let h = 1779033703;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** 由种子生成确定性随机序列：同一本书每次算出来的分布都一样 */
export function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 排除标签字符串拆成数组（兼容中英文逗号） */
export function splitExclude(s) {
  return String(s || "")
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 防抖 */
export function debounce(fn, wait) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
