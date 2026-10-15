/* ============================================================
   筛选状态 + URL 同步 + 表单回填
   状态是单例对象，所有模块 import 同一个引用；
   重置用 resetState() 就地改写，绝不用 state = {...} 整个替换，
   否则别的模块拿到的还是旧引用。
   ============================================================ */
import { DEF, RADAR } from "./config.js";
import { $, clamp, splitExclude } from "./utils.js";

function defaults() {
  return {
    view: "list", // list=书目 / radar=新书雷达
    q: "",
    min_score: DEF.min_score,
    min_votes: DEF.min_votes,
    yFrom: "",
    yTo: "",
    exclude: "",
    merge: true,
    comic: false,
    sort: DEF.sort,
    page: 1,
    // 新书雷达自己的参数，和主列表的筛选互不干扰
    radarMode: RADAR.mode, // chart=豆瓣月度榜 / latest=新书速递
    radarMonth: "", // "" 表示用数据里最新的月份
    radarMinVotes: RADAR.minVotes,
  };
}

/** 当前筛选状态（单例） */
export const state = defaults();

/** 就地重置为默认值 */
export function resetState() {
  Object.assign(state, defaults());
}

/* ---------------- URL ---------------- */

/** 从地址栏读初始条件（方便分享 / 收藏某个筛选视图） */
export function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get("view")) state.view = p.get("view") === "radar" ? "radar" : "list";
  if (p.get("min_score")) state.min_score = parseFloat(p.get("min_score")) || 0;
  if (p.get("min_votes")) state.min_votes = parseInt(p.get("min_votes"), 10) || 0;
  if (p.get("sort")) state.sort = p.get("sort");
  if (p.get("page")) state.page = Math.max(1, parseInt(p.get("page"), 10) || 1);
  if (p.get("q")) state.q = p.get("q");
  if (p.get("exclude")) state.exclude = p.get("exclude");
  if (p.get("yFrom")) state.yFrom = p.get("yFrom");
  if (p.get("yTo")) state.yTo = p.get("yTo");
  if (p.get("rm")) state.radarMode = p.get("rm") === "latest" ? "latest" : "chart";
  if (p.get("month")) state.radarMonth = p.get("month");
  if (p.get("rv")) state.radarMinVotes = Math.max(0, parseInt(p.get("rv"), 10) || 0);
}

/** 把状态写回地址栏（只写非默认项，URL 保持干净） */
export function writeUrl() {
  const p = new URLSearchParams();
  if (state.view !== "list") p.set("view", state.view);
  if (state.min_score !== DEF.min_score) p.set("min_score", state.min_score);
  if (state.min_votes !== DEF.min_votes) p.set("min_votes", state.min_votes);
  if (state.q) p.set("q", state.q);
  if (state.exclude) p.set("exclude", state.exclude);
  if (state.yFrom) p.set("yFrom", state.yFrom);
  if (state.yTo) p.set("yTo", state.yTo);
  if (state.sort !== "idx") p.set("sort", state.sort);
  if (state.page > 1) p.set("page", state.page);
  if (state.radarMode !== RADAR.mode) p.set("rm", state.radarMode);
  if (state.radarMonth) p.set("month", state.radarMonth);
  if (state.radarMinVotes !== RADAR.minVotes) p.set("rv", state.radarMinVotes);
  const qs = p.toString();
  try {
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  } catch (e) {
    /* file:// 或沙箱里 replaceState 可能被拒，不影响功能 */
  }
}

/* ---------------- 表单回填 ---------------- */

/** 把 state 写回所有输入控件（重置、导航跳转后用） */
export function syncInputs() {
  const set = (id, v) => {
    const el = $(id);
    if (el) el.value = v;
  };
  set("q", state.q);
  set("minScore", state.min_score || "");
  set("minScoreRange", state.min_score);
  set("minVotes", state.min_votes || "");
  set("exclude", state.exclude);
  set("yFrom", state.yFrom);
  set("yTo", state.yTo);
  set("rMinVotes", state.radarMinVotes || "");
  const cb = (id, v) => {
    const el = $(id);
    if (el) el.checked = v;
  };
  cb("merge", state.merge);
  cb("comic", state.comic);
}

/* ---------------- 派生字段 ---------------- */

/** 排除标签解析成数组（兼容中英文逗号） */
export function excludeList() {
  return splitExclude(state.exclude);
}

/** 设置最低分并做 0–10 的收敛 */
export function setMinScore(v) {
  state.min_score = clamp(Math.round((Number(v) || 0) * 10) / 10, 0, 10);
}
