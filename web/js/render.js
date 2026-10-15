/* ============================================================
   渲染协调器：把「状态 → 数据 → 各视图」串起来
   所有改状态的入口最后都调 render()，视图不互相调用。
   两个视图二选一：list=书目（主榜单） / radar=新书雷达。
   ============================================================ */
import { RADAR, SORT_LABEL } from "./config.js";
import { BOOKS, sourceLabel } from "./data.js";
import { state, writeUrl } from "./state.js";
import {
  filterBooks,
  sortBooks,
  paginate,
  describeConditions,
  chartMonths,
  chartPool,
  latestMonths,
  latestPool,
} from "./metrics.js";
import {
  renderEntries,
  renderPager,
  renderStatsLine,
  renderResultMeta,
  syncSortBar,
  flashResultMeta,
} from "./views/list.js";
import { markActiveChips } from "./views/chips.js";
import {
  buildRadarModes,
  buildRadarMonths,
  syncRadarControls,
  renderRadarNote,
  renderRadar,
} from "./views/radar.js";

/** 主榜单当前筛选 + 排序后的完整列表 */
export function currentList() {
  return sortBooks(filterBooks(BOOKS, state), state.sort);
}

/** 切换视图（顶部导航） */
export function setView(v) {
  state.view = v === "radar" ? "radar" : "list";
  state.page = 1;
  render();
}

/** 按当前视图显隐对应区块，并同步顶部导航高亮 */
function applyView() {
  const radar = state.view === "radar";
  const lv = document.getElementById("listView");
  const rd = document.getElementById("radar");
  if (lv) lv.hidden = radar;
  if (rd) rd.hidden = !radar;
  document.querySelectorAll(".topnav [data-nav]").forEach((b) => {
    const on = b.dataset.nav === (radar ? "radar" : "list");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.body.classList.toggle("radar-mode", radar);
}

/** 雷达视图：算出当前模式的月份列表、把未指定的月份收敛到最新那个，然后交给各视图 */
function renderRadarView() {
  const isChart = state.radarMode === "chart";
  const months = isChart ? chartMonths(BOOKS) : latestMonths(BOOKS);

  // radarMonth 为空（首次进入）或指向一个已经不存在的月份时，回落到最新月份
  const valid =
    state.radarMonth === RADAR.allMonths ||
    (state.radarMonth && months.includes(state.radarMonth));
  if (!valid) state.radarMonth = months[0] || RADAR.allMonths;

  const pool = isChart ? chartPool(BOOKS, state) : latestPool(BOOKS, state);

  buildRadarModes(state.radarMode);
  buildRadarMonths(months, state.radarMode);
  syncRadarControls(state);
  renderRadarNote(state, months);
  renderRadar(pool, state, months);

  const what = isChart ? "豆瓣月度榜" : "新书速递";
  renderStatsLine(BOOKS.length, pool.length, sourceLabel(), what);
  return pool.length;
}

/** 全量重绘，并同步地址栏 */
export function render() {
  applyView();

  if (state.view === "radar") {
    const n = renderRadarView();
    writeUrl();
    return n;
  }

  const list = currentList();
  const { pages, page, items } = paginate(list, state.page);
  state.page = page;

  renderStatsLine(BOOKS.length, list.length, sourceLabel());
  renderResultMeta(describeConditions(state), list.length, state.sort);
  renderEntries(items, page);
  renderPager(pages, page);
  syncSortBar(state.sort);
  markActiveChips(state.exclude);
  writeUrl();

  return list.length;
}

/** 切换排序：回到第 1 页，重画，并闪一下结果行作为反馈 */
export function setSort(key) {
  if (!SORT_LABEL[key]) return;
  if (state.sort === key && state.page === 1) {
    flashResultMeta();
    return;
  }
  state.sort = key;
  state.page = 1;
  render();
  flashResultMeta();
}

/** 雷达榜也复用 flashResultMeta 的反馈动画（闪一下结果行） */
export function flashRadarMeta() {
  const el = document.getElementById("radarMeta");
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 460);
}
