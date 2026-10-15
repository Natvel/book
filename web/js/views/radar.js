/* ============================================================
   视图：新书雷达
   数据来自豆瓣的月度接口，不是我们自己按年份猜的：
     chart  —— 「豆瓣 N月热门图书榜」（月度排行：名次/涨跌/连续上榜月数）
     latest —— 「豆瓣新书速递」（按出版时间滚动，带出版年月）
   只负责把数据变成 DOM，筛选/排序都在 metrics 里。
   ============================================================ */
import { RADAR, RADAR_MODE_LABEL } from "../config.js";
import { $, fmtV, escapeHtml } from "../utils.js";
import { radarScore, fmtMonth, describeRadar } from "../metrics.js";

const MODES = ["chart", "latest"];

/** 年份+月份：'2026-09' → '2026 年 9 月'；用作按钮文案 */
function monthLabel(ym) {
  return fmtMonth(ym).replace(" 年 ", "/").replace(" 月", "");
}

/** 名次涨跌徽章：升用朱红、降用灰绿（跟国内看盘习惯一致） */
function trendBadge(rec) {
  if (!rec.dir) return '<span class="tr new">新上榜</span>';
  const up = rec.dir === "up";
  return (
    '<span class="tr ' + (up ? "up" : "down") + '">' +
    (up ? "↑" : "↓") + (rec.n || 0) +
    "</span>"
  );
}

/** 月度榜条目：名次用豆瓣给的，不是我们算的 */
function chartEntryHtml(row, rank) {
  const b = row.book;
  const rec = row.rec;
  const cats = (rec.cat || []).map((t) => '<span class="tg">' + escapeHtml(t) + "</span>");
  const extras = [];
  if (rec.months > 1) extras.push('<span class="tg">连续上榜 ' + rec.months + " 个月</span>");
  if (b.editions > 1) extras.push('<span class="tg">共 ' + b.editions + " 个版本</span>");

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
        '<span class="m">' + escapeHtml(b.ym ? fmtMonth(b.ym) : b.y || "—") + "出版</span><span class=\"gap\"></span>" +
        '<span class="m">' + fmtV(b.v) + "人评价</span>" +
        '<span class="zhi">' + trendBadge(rec) + "</span>" +
      "</div>" +
      '<div class="tags">' + cats.join("") + extras.join("") + "</div>" +
    "</div>"
  );
}

/** 新书速递条目：按雷达分排，标注出版月 */
function latestEntryHtml(b, rank) {
  const cats = (b.cats || []).map((t) => '<span class="tg">' + escapeHtml(t) + "</span>");
  const extras = [];
  if (b.editions > 1) extras.push('<span class="tg">共 ' + b.editions + " 个版本</span>");
  if (b.pub) extras.push('<span class="tg">' + escapeHtml(b.pub) + "</span>");

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
        '<span class="m ry">' + escapeHtml(fmtMonth(b.ym)) + "出版</span><span class=\"gap\"></span>" +
        '<span class="m">' + fmtV(b.v) + "人评价</span>" +
        '<span class="zhi">雷达分 <b>' + radarScore(b).toFixed(2) + "</b></span>" +
      "</div>" +
      '<div class="tags">' + cats.join("") + extras.join("") + "</div>" +
    "</div>"
  );
}

/** 数据源切换按钮（只在模式真的变了时重建，避免点击过程中被替换掉） */
let builtMode = "";
export function buildRadarModes(mode) {
  const box = $("rModes");
  if (!box || builtMode === mode + "|" + box.children.length) return;
  builtMode = mode + "|" + box.children.length;
  box.innerHTML = MODES.map(
    (m) =>
      '<button type="button" class="opt' + (m === mode ? " on" : "") +
      '" data-rm="' + m + '">' + RADAR_MODE_LABEL[m] + "</button>"
  ).join("");
}

/** 月份按钮：chart 模式列出榜单月份，latest 模式列出出版月份；都带「全部」 */
export function buildRadarMonths(months, mode) {
  const box = $("rMonths");
  if (!box) return;
  const all = mode === "chart" ? "历次" : "全部";
  let html =
    '<button type="button" class="opt" data-month="' + RADAR.allMonths + '">' + all + "</button>";
  for (const m of months) {
    html +=
      '<button type="button" class="opt" data-month="' + m + '">' + monthLabel(m) + "</button>";
  }
  box.innerHTML = html;
}

/** 同步按钮高亮与控件显隐 */
export function syncRadarControls(st) {
  document.querySelectorAll("#rModes [data-rm]").forEach((b) =>
    b.classList.toggle("on", b.dataset.rm === st.radarMode)
  );
  document.querySelectorAll("#rMonths [data-month]").forEach((b) =>
    b.classList.toggle("on", b.dataset.month === st.radarMonth)
  );
  const latest = st.radarMode === "latest";
  const votesLab = $("rVotesLab");
  const votesBox = $("rMinVotes");
  if (votesLab) votesLab.hidden = !latest;
  if (votesBox) {
    votesBox.hidden = !latest;
    if (document.activeElement !== votesBox) votesBox.value = st.radarMinVotes || "";
  }
}

/** 底部说明：把「这些数字是怎么来的」讲清楚，不藏公式 */
export function renderRadarNote(st, months) {
  const el = $("radarNote");
  if (!el) return;
  if (st.radarMode === "chart") {
    el.innerHTML =
      "名次、涨跌、连续上榜月数都来自豆瓣的《N月热门图书榜》，不是我们算的。" +
      "豆瓣只发布当月榜，往期取不到接口——所以历史榜单要靠每月抓一次慢慢积累，" +
      "目前库里已有 <b>" + months.length + "</b> 个月的记录。";
  } else {
    el.innerHTML =
      "出版年月来自豆瓣《新书速递》（标签页只给到年份，这里给到月）。" +
      "雷达分＝加权评分，权重人数取 <b>150</b>（主榜是 1000）——" +
      "新书评价人数天然少，沿用主榜权重会把所有新书拉平到 8.05 附近，排不出高低。";
  }
}

/** 渲染雷达榜 */
export function renderRadar(list, st, months) {
  const meta = $("radarMeta");
  if (meta) meta.textContent = describeRadar(st, list.length);

  const box = $("radarList");
  if (!box) return;
  if (!list.length) {
    box.innerHTML =
      '<div class="empty">这个月份还没有数据。<br>' +
      "换个「历次」/「全部」，或者把评价数门槛降下来试试。</div>";
    return;
  }

  const shown = list.slice(0, RADAR.show);
  let html = shown
    .map((row, i) =>
      st.radarMode === "chart"
        ? chartEntryHtml(row, i + 1)
        : latestEntryHtml(row, i + 1)
    )
    .join("");
  if (list.length > shown.length) {
    html +=
      '<div class="radar-more">以上只显示前 ' + shown.length + " 本，共 " + list.length +
      " 本符合条件——收紧筛选条件可以看更细。</div>";
  }
  box.innerHTML = html;
}
