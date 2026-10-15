/* ============================================================
   视图：榜单 + 分页 + 统计行 + 排序栏
   只负责把数据变成 DOM，不做筛选/排序判断。
   ============================================================ */
import { PER, SORT_LABEL } from "../config.js";
import { $, fmtV, escapeHtml } from "../utils.js";
import { bayes } from "../metrics.js";

/* ---------------- 榜单 ---------------- */

/** 单条书目 → HTML */
function entryHtml(b, rank) {
  const tags = (b.tags || []).map((t) => '<span class="tg">' + escapeHtml(t) + "</span>");
  let extra = "";
  if (b.editions > 1) extra += '<span class="tg">共 ' + b.editions + " 个版本</span>";
  if (b.alt) extra += '<span class="tg tg-alt">另一版本，代表作「' + escapeHtml(b.alt) + '」</span>';
  if (b.best_s && b.best_s > b.s + 0.05)
    extra += '<span class="tg">版本最高 ' + b.best_s.toFixed(1) + "</span>";

  return (
    '<div class="entry" data-k="' + b._k + '">' +
      '<div class="row1">' +
        '<span class="rk' + (rank <= 3 ? " top" : "") + '">' + rank + "</span>" +
        '<span class="bt serif">' + escapeHtml(b.t) + "</span>" +
        '<span class="leader"></span>' +
        '<span class="sc">' + (Number(b.s) || 0).toFixed(1) + "</span>" +
      "</div>" +
      '<div class="row2">' +
        '<span class="m"><b>' + escapeHtml(b.a || "佚名") + "</b></span><span class=\"gap\"></span>" +
        '<span class="m">' + escapeHtml(b.y || "—") + "</span><span class=\"gap\"></span>" +
        '<span class="m">' + fmtV(b.v) + "人评价</span>" +
        '<span class="zhi">好书指数 <b>' + bayes(b).toFixed(2) + "</b></span>" +
      "</div>" +
      '<div class="tags">' + tags.join("") + extra + "</div>" +
    "</div>"
  );
}

/** 渲染当前页条目 */
export function renderEntries(items, page) {
  const box = $("list");
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<div class="empty">没有符合条件的书。放宽一两条筛选试试。</div>';
    return;
  }
  const base = (page - 1) * PER;
  box.innerHTML = items.map((b, i) => entryHtml(b, base + i + 1)).join("");
}

/* ---------------- 分页 ---------------- */

function pagerBtn(label, page, active, disabled) {
  return (
    '<button type="button"' +
    (disabled ? " disabled" : "") +
    ' class="' + (active ? "on" : "") + '"' +
    ' data-p="' + page + '">' + label + "</button>"
  );
}

/** 渲染分页条（只有一页时不显示） */
export function renderPager(pages, page) {
  const box = $("pager");
  if (!box) return;
  if (pages <= 1) {
    box.innerHTML = "";
    return;
  }
  let html = pagerBtn("前页", page - 1, false, page === 1);
  for (let i = 1; i <= pages; i++) {
    // 页数多时折叠中间段：1 2 3 … 48 49 50
    if (pages > 9 && i > 3 && i < pages - 2 && Math.abs(i - page) > 1) {
      if (i === 4) html += '<span style="color:#a8a89e">…</span>';
      continue;
    }
    html += pagerBtn(String(i), i, i === page, false);
  }
  html += pagerBtn("后页", page + 1, false, page === pages);
  box.innerHTML = html;
}

/* ---------------- 统计行 / 结果行 ---------------- */

/** 「在库 X 本（豆瓣数据），筛选后 Y 本」；what 用来说明筛的是哪一批（雷达视图用） */
export function renderStatsLine(total, shown, source, what) {
  const el = $("statsLine");
  if (!el) return;
  el.textContent =
    "在库 " + total + " 本（" + source + "），" + (what ? what + "里筛得 " : "筛得 ") + shown + " 本";
}

/** 右侧结果提示：筛选条件 + 总数 + 当前排序 */
export function renderResultMeta(conds, total, sortKey) {
  const el = $("resultMeta");
  if (!el) return;
  el.textContent =
    (conds.length ? conds.join("；") + "　→　" : "") +
    "共 " + total + " 本　·　按「" + (SORT_LABEL[sortKey] || sortKey) + "」排";
  el.classList.add("on");
}

/** 排序切换时闪一下结果行，让点击有可见反馈 */
export function flashResultMeta() {
  const el = $("resultMeta");
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth; // 强制重排，让动画能连续触发
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 460);
}

/* ---------------- 排序栏 ---------------- */

/** 把当前排序项同步到按钮高亮 */
export function syncSortBar(sortKey) {
  document.querySelectorAll("#sortbar button").forEach((b) => {
    const active = b.dataset.sort === sortKey;
    b.classList.toggle("on", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

/**
 * 给排序按钮绑直接事件（不走事件委托）。
 * 预览面板/编辑器有时会在 document 层拦截点击，委托会失效。
 */
export function bindSortButtons(handler) {
  const bar = $("sortbar");
  if (!bar) return;
  bar.querySelectorAll("button[data-sort]").forEach((b) => {
    b.type = "button";
    if (b._sortBound) return;
    b._sortBound = true;
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      handler(b.dataset.sort);
    });
  });
}
