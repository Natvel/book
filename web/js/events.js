/* ============================================================
   事件绑定：所有交互入口集中在这里，绑定完成后界面随时可点
   ============================================================ */
import { $, on, onAll, splitExclude, debounce } from "./utils.js";
import { RADAR } from "./config.js";
import { state, syncInputs, resetState, setMinScore } from "./state.js";
import { render, setSort, setView, flashRadarMeta } from "./render.js";
import { bindSortButtons } from "./views/list.js";
import { openModal, closeModal, isModalOpen } from "./views/modal.js";

/** 改动筛选条件后统一走这里：回到第 1 页 + 重绘 */
function applyChange() {
  state.page = 1;
  render();
}

/* ---------------- 排序 ---------------- */

export function bindSort() {
  // 直接绑在按钮上，不走事件委托：预览面板有时会在 document 层拦截点击
  bindSortButtons(setSort);
}

/* ---------------- 顶部导航 ---------------- */

export function bindNav() {
  // 同样直连，避免委托被拦
  onAll(".topnav [data-nav]", "click", (e) => {
    e.preventDefault();
    setView(e.currentTarget.dataset.nav);
  });
}

/* ---------------- 新书雷达 ---------------- */

export function bindRadar() {
  // 数据源切换：按钮会被重建，所以在容器上做委托（容器本身是稳定的）
  on("rModes", "click", (e) => {
    const btn = e.target.closest?.("[data-rm]");
    if (!btn) return;
    state.radarMode = btn.dataset.rm === "latest" ? "latest" : "chart";
    state.radarMonth = ""; // 换源后回到该源的最新月份
    render();
    flashRadarMeta();
  });

  // 月份切换：同样走容器委托，避免按钮重建后丢绑定
  on("rMonths", "click", (e) => {
    const btn = e.target.closest?.("[data-month]");
    if (!btn) return;
    state.radarMonth = btn.dataset.month;
    render();
    flashRadarMeta();
  });

  on("rMinVotes", "input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    state.radarMinVotes = isNaN(v) ? 0 : v;
    render();
  });

  on("rMinVotes", "blur", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    state.radarMinVotes = isNaN(v) ? 0 : v;
    e.target.value = state.radarMinVotes || "";
    render();
  });

  on("rMinVotes", "keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
  });

  // 恢复默认（雷达自己的默认值，不动书目视图的筛选）
  on("rReset", "click", () => {
    state.radarMode = RADAR.mode;
    state.radarMonth = "";
    state.radarMinVotes = RADAR.minVotes;
    state.q = "";
    syncInputs();
    render();
    flashRadarMeta();
  });
}

/* ---------------- 全局点击 ---------------- */

export function bindGlobalClicks() {
  document.addEventListener("click", (e) => {
    const el = e.target;

    // 排序（委托兜底，正常走的是 bindSortButtons 的直连）
    const sortBtn = el.closest?.("#sortbar [data-sort]");
    if (sortBtn) {
      e.preventDefault();
      setSort(sortBtn.dataset.sort);
      return;
    }

    // 分页
    if (el.dataset && el.dataset.p !== undefined && el.dataset.p !== "") {
      state.page = parseInt(el.dataset.p, 10) || 1;
      render();
      window.scrollTo(0, 0);
      return;
    }

    // 书条目 → 详情（书目与雷达两个视图共用同一套 .entry）
    const card = el.closest?.(".entry");
    if (card && card.dataset.k) openModal(card.dataset.k);
  });
}

/* ---------------- 标签条 ---------------- */

export function bindTagChips() {
  on("tagChips", "click", (e) => {
    const tag = e.target.dataset && e.target.dataset.tt;
    if (!tag) return;
    const arr = splitExclude(state.exclude);
    const i = arr.indexOf(tag);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(tag);
    state.exclude = arr.join(",");
    const box = $("exclude");
    if (box) box.value = state.exclude;
    applyChange();
  });
}

/* ---------------- 搜索 ---------------- */

export function bindSearch() {
  const runSearch = (scroll = true) => {
    const box = $("q");
    state.q = box ? box.value.trim() : "";
    state.page = 1;
    render();
    // 滚到当前视图的列表头（书目在 #list，雷达在 #radarList）
    if (scroll) {
      const target = state.view === "radar" ? $("radarList") : $("list");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const delayed = debounce(() => {
    const box = $("q");
    state.q = box ? box.value.trim() : "";
    state.page = 1;
    render();
  }, 300);

  on("q", "input", delayed);
  on("q", "keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });
  on("searchBtn", "click", () => runSearch());
}

/* ---------------- 筛选控件 ---------------- */

export function bindFilters() {
  // 最低分：滑块与数字框双向同步
  on("minScoreRange", "input", (e) => {
    setMinScore(e.target.value);
    syncInputs();
    applyChange();
  });

  on("minScore", "input", (e) => {
    setMinScore(e.target.value);
    const r = $("minScoreRange");
    if (r) r.value = state.min_score;
    applyChange();
  });

  on("minScore", "blur", (e) => {
    setMinScore(e.target.value);
    syncInputs();
    applyChange();
  });

  on("minVotes", "input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    state.min_votes = isNaN(v) ? 0 : v;
    applyChange();
  });

  on("minVotes", "blur", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    state.min_votes = isNaN(v) ? 0 : v;
    e.target.value = state.min_votes || "";
    applyChange();
  });

  on("exclude", "input", (e) => {
    state.exclude = e.target.value;
    applyChange();
  });

  on("yFrom", "input", (e) => {
    state.yFrom = e.target.value.replace(/\D/g, "");
    applyChange();
  });

  on("yTo", "input", (e) => {
    state.yTo = e.target.value.replace(/\D/g, "");
    applyChange();
  });

  on("merge", "change", (e) => {
    state.merge = e.target.checked;
    applyChange();
  });

  on("comic", "change", (e) => {
    state.comic = e.target.checked;
    applyChange();
  });

  // 回车确认并收起键盘
  ["minScore", "minVotes", "yFrom", "yTo", "exclude"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        el.blur();
        applyChange();
      }
    });
  });

  // 恢复默认
  on("clearBtn", "click", () => {
    resetState();
    syncInputs();
    render();
  });
}

/* ---------------- 弹窗 ---------------- */

export function bindModal() {
  const mask = $("mask");
  if (mask) {
    mask.addEventListener("click", (e) => {
      if (e.target === mask) {
        closeModal();
        return;
      }
      const rel = e.target.closest?.(".rel-item");
      if (rel && rel.dataset.k) openModal(rel.dataset.k);
    });
  }

  on("modalClose", "click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isModalOpen()) closeModal();
  });
}

/* ---------------- 统一入口 ---------------- */

export function bindEvents() {
  bindSort();
  bindNav();
  bindRadar();
  bindGlobalClicks();
  bindTagChips();
  bindSearch();
  bindFilters();
  bindModal();
}
