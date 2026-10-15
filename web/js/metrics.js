/* ============================================================
   计算层：全部是不依赖 DOM 的纯函数，方便单独验证
   ============================================================ */
import { BAYES, RADAR, COMIC_TAGS, PER } from "./config.js";
import { hashStr, rng, splitExclude, fmtV } from "./utils.js";

/**
 * 好书指数：贝叶斯加权评分，压制「3 个人打 10 分」的虚高。
 *   bayes = v/(v+m) × s + m/(v+m) × C
 * 评价人数 v 越大，越接近真实评分 s；v 很小时被拉到全局均值 C。
 */
export function bayes(b) {
  const { m, C } = BAYES;
  const v = Number(b.v) || 0;
  const s = Number(b.s) || 0;
  return (v / (v + m)) * s + (m / (v + m)) * C;
}

/**
 * 评分分布（1 星→5 星，百分比）。
 * 真实数据带 dist（豆瓣是 5 星→1 星，这里翻正）；没有就用评分推一条可复现的近似曲线。
 */
export function dist(b) {
  if (Array.isArray(b.dist) && b.dist.length === 5) return b.dist.slice().reverse();
  const r = rng(hashStr(b.t));
  const s = Number(b.s) || 8;
  let p5 = Math.round(Math.min(90, Math.max(12, (s - 7) * 28 + 15)) + r() * 4 - 2);
  const p1 = Math.round(Math.min(12, Math.max(1, (8.9 - s) * 4 + 1)) + r() * 2);
  const p2 = Math.round(Math.min(8, Math.max(1, (8.5 - s) * 2.5 + 1)) + r() * 2);
  const p3 = Math.round(Math.min(10, Math.max(2, (8.1 - s) * 2.5 + 2)) + r() * 2);
  p5 = Math.max(p5, 15);
  let p4 = 100 - p5 - p1 - p2 - p3;
  if (p4 < 3) {
    p4 = 3;
    p5 = 100 - p1 - p2 - p3 - p4;
  }
  return [p1, p2, p3, p4, p5];
}

/** 单本书是否符合当前筛选条件 */
function matches(b, st) {
  if (b.alt && st.merge) return false;

  if (!st.comic) {
    if (b.comic) return false; // 数据端已识别的漫画/绘本/杂志
    const tags = b.tags || [];
    if (tags.some((t) => COMIC_TAGS.includes(t))) return false;
  }

  const ex = splitExclude(st.exclude);
  if (ex.length) {
    const tags = b.tags || [];
    if (tags.some((t) => ex.some((e) => t.includes(e)))) return false;
  }

  if (st.min_score && (Number(b.s) || 0) < st.min_score) return false;
  if (st.min_votes && (Number(b.v) || 0) < st.min_votes) return false;
  if (st.yFrom && (Number(b.y) || 0) < parseInt(st.yFrom, 10)) return false;
  if (st.yTo && (Number(b.y) || 0) > parseInt(st.yTo, 10)) return false;

  if (st.q) {
    const hay = (b.t + " " + (b.a || "") + " " + (b.tags || []).join(" ")).toLowerCase();
    if (!hay.includes(st.q.toLowerCase())) return false;
  }
  return true;
}

/** 按当前状态过滤书目 */
export function filterBooks(books, st) {
  return books.filter((b) => matches(b, st));
}

/**
 * 按出版年排序。没有年份的书（列表页抓不到出版年、又没补详情）一律排到最后，
 * 「最新」和「最早」两个方向都是——否则 `y=null` 会被当成公元 0 年，
 * 点「最早出版」时满屏都是没有年份的书。
 */
function byYear(dir) {
  const y = (b) => Number(b.y) || 0;
  return (a, b) => {
    const ya = y(a), yb = y(b);
    if (!ya || !yb) return !ya && !yb ? 0 : !ya ? 1 : -1;
    return dir * (ya - yb);
  };
}

/** 五种排序的比较器 */
export const SORTERS = {
  idx: (a, b) => bayes(b) - bayes(a),
  score: (a, b) => (b.s || 0) - (a.s || 0) || (b.v || 0) - (a.v || 0),
  votes: (a, b) => (b.v || 0) - (a.v || 0),
  new: byYear(-1),
  old: byYear(1),
};

/** 排序（不改原数组） */
export function sortBooks(list, sortKey) {
  const cmp = SORTERS[sortKey] || SORTERS.idx;
  return list.slice().sort(cmp);
}

export const pageCount = (total, per = PER) => Math.max(1, Math.ceil(total / per));

/** 取第 page 页（page 从 1 开始），顺带把越界的 page 收敛回去 */
export function paginate(list, page, per = PER) {
  const pages = pageCount(list.length, per);
  const p = Math.min(Math.max(1, page), pages);
  return { pages, page: p, items: list.slice((p - 1) * per, p * per) };
}

/** 标签共现推荐：同标签越多越靠前，同分时按好书指数 */
export function relatedBooks(books, book, n = 4) {
  const mine = book.tags || [];
  return books
    .filter((x) => x !== book && !x.alt)
    .map((x) => {
      const tags = x.tags || [];
      return { book: x, overlap: tags.filter((t) => mine.includes(t)).length };
    })
    .filter((x) => x.overlap > 0)
    .sort((p, q) => q.overlap - p.overlap || bayes(q.book) - bayes(p.book))
    .slice(0, n)
    .map((x) => x.book);
}

/** 把筛选状态翻译成人话，用于结果行提示 */
export function describeConditions(st) {
  const conds = [];
  if (st.q) conds.push("关键词「" + st.q + "」");
  if (st.min_score) conds.push("评分 ≥ " + st.min_score);
  if (st.min_votes) conds.push("评价人数 ≥ " + fmtV(st.min_votes));
  if (st.yFrom || st.yTo)
    conds.push("年份 " + (st.yFrom || "不限") + "–" + (st.yTo || "不限"));
  if (st.exclude) conds.push("排除 " + st.exclude);
  if (st.comic) conds.push("含漫画绘本");
  if (!st.merge) conds.push("显示所有版本");
  return conds;
}

/* ============================================================
   新书雷达（数据来自豆瓣的月度接口：chart=月度热门榜 / latest=新书速递）
   ============================================================ */

/** 雷达分：m 更小的贝叶斯加权，让只有几十上百人评价的新书也能分出高下 */
export function radarScore(b) {
  const { m, C } = RADAR;
  const v = Number(b.v) || 0;
  const s = Number(b.s) || 0;
  return (v / (v + m)) * s + (m / (v + m)) * C;
}

/** 「2026-09」→「2026 年 9 月」 */
export function fmtMonth(ym) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(ym || "");
  return m ? m[1] + " 年 " + parseInt(m[2], 10) + " 月" : ym || "";
}

/** 一本书是否被当前筛选条件排除（合并版本 / 漫画开关，两个模式共用） */
function radarExcluded(b, st) {
  if (b.alt && st.merge) return true;
  if (!st.comic && b.comic) return true;
  return false;
}

function matchKeyword(b, kw) {
  if (!kw) return true;
  // 栏目分类（cats，如「社会纪实」）也算——它们不进 tags，但用户会拿来搜
  const hay = (b.t + " " + (b.a || "") + " " + (b.pub || "") + " " +
    (b.tags || []).join(" ") + " " + (b.cats || []).join(" ")).toLowerCase();
  return hay.includes(kw);
}

/* ---------- 豆瓣月度热门榜 ---------- */

/** 有榜单记录的所有月份，倒序（新的在前） */
export function chartMonths(books) {
  const set = new Set();
  for (const b of books) {
    if (!b.charts) continue;
    for (const m of Object.keys(b.charts)) set.add(m);
  }
  return [...set].sort().reverse();
}

/**
 * 某个月的豆瓣热门榜：按豆瓣给的名次排（不是我们自己算分）。
 * month 传 RADAR.allMonths 时取「每本书最新的那次上榜」，用来跨月看累计上榜的书。
 */
export function chartPool(books, st) {
  const kw = st.q ? st.q.toLowerCase() : "";
  const all = st.radarMonth === RADAR.allMonths;
  const rows = [];
  for (const b of books) {
    if (radarExcluded(b, st) || !b.charts) continue;
    if (!matchKeyword(b, kw)) continue;
    const months = Object.keys(b.charts).sort();
    const pick = all ? months[months.length - 1] : st.radarMonth;
    const rec = b.charts[pick];
    if (!rec || !rec.rank) continue;
    rows.push({ book: b, month: pick, rec });
  }
  rows.sort((a, b) => a.rec.rank - b.rec.rank || (b.month > a.month ? 1 : -1));
  return rows;
}

/* ---------- 豆瓣新书速递（带出版年月） ---------- */

/** 有出版年月的所有月份，倒序 */
export function latestMonths(books) {
  const set = new Set();
  for (const b of books) if (b.ym) set.add(b.ym);
  return [...set].sort().reverse();
}

/** 某个月（或全部月份）出版的新书，按雷达分排 */
export function latestPool(books, st) {
  const kw = st.q ? st.q.toLowerCase() : "";
  const all = st.radarMonth === RADAR.allMonths;
  return books
    .filter((b) => {
      if (radarExcluded(b, st) || !b.ym) return false;
      if (!all && b.ym !== st.radarMonth) return false;
      if ((Number(b.v) || 0) < st.radarMinVotes) return false;
      return matchKeyword(b, kw);
    })
    .sort((a, b) => radarScore(b) - radarScore(a));
}

/** 雷达结果行的条件摘要 */
export function describeRadar(st, total) {
  const parts = [];
  if (st.radarMode === "chart") {
    parts.push(st.radarMonth === RADAR.allMonths ? "历次上榜记录" : fmtMonth(st.radarMonth) + "热门图书榜");
  } else {
    parts.push(st.radarMonth === RADAR.allMonths ? "全部出版月份" : fmtMonth(st.radarMonth) + "出版");
    parts.push("评价 ≥ " + fmtV(st.radarMinVotes));
  }
  if (st.q) parts.push("关键词「" + st.q + "」");
  return parts.join("；") + "　→　共 " + total + " 本";
}
