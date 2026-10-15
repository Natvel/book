/* ============================================================
   视图：书目详情弹窗
   ============================================================ */
import { $, fmtV, escapeHtml } from "../utils.js";
import { BOOKS, bookByKey } from "../data.js";
import { bayes, dist, relatedBooks } from "../metrics.js";

const STAR_NAMES = ["一星", "二星", "三星", "四星", "五星"];

/** 打开某本书的详情（按内部编号 _k 精确定位，书名重复也不会串） */
export function openModal(key) {
  const b = bookByKey(key);
  if (!b) return;

  const body = $("modalBody");
  if (!body) return;

  const d = dist(b);
  const rel = relatedBooks(BOOKS, b);

  const versionNote =
    b.editions > 1
      ? "（此书共 " + b.editions + " 个版本收录，最高 " + b.best_s.toFixed(1) + " 分）"
      : b.alt
        ? "（另一版本，代表作「" + escapeHtml(b.alt) + "」）"
        : "";

  const doubanUrl =
    b.link ||
    "https://search.douban.com/book/subject_search?search_text=" + encodeURIComponent(b.t);

  // 标签/风格：tags=豆瓣标签，cats=栏目分类（新书速递/月度榜给的），
  // 榜单记录里的分类也并进来——详情页上应当能看到这本书「属于什么」
  const styleTags = [...new Set([...(b.tags || []), ...(b.cats || [])])];
  Object.values(b.charts || {}).forEach((r) => {
    (r.cat || []).forEach((c) => { if (!styleTags.includes(c)) styleTags.push(c); });
  });

  body.innerHTML =
    '<div class="m-title serif">' + escapeHtml(b.t) + "</div>" +
    '<div class="m-meta">' +
      escapeHtml(b.a || "佚名") + "，" + escapeHtml(b.y || "—") + "，" + escapeHtml(b.pub || "—") +
      versionNote +
    "</div>" +
    (styleTags.length
      ? '<div class="m-tags">' +
        styleTags
          .map((t) => '<span class="mtag">' + escapeHtml(t) + "</span>")
          .join("") +
        "</div>"
      : "") +
    '<div class="m-stats">' +
      '<div><span class="big">' + (Number(b.s) || 0).toFixed(1) + '</span> <span style="font-size:12px;color:var(--grey)">分</span></div>' +
      '<div class="cell"><b>' + fmtV(b.v) + "</b><span> 人评价</span></div>" +
      '<div class="cell"><b>' + bayes(b).toFixed(2) + "</b><span> 好书指数</span></div>" +
    "</div>" +
    '<div class="dist">' +
      d.map((p, i) =>
        '<div class="row"><span>' + STAR_NAMES[i] + "</span>" +
        '<div class="bar"><i style="width:' + p + '%"></i></div>' +
        "<span>" + p + "%</span></div>"
      ).join("") +
    "</div>" +
    (b.d ? '<div class="m-desc serif">' + escapeHtml(b.d) + "</div>" : "") +
    (Array.isArray(b.quotes) && b.quotes.length
      ? '<div class="m-quotes"><h4>原文摘录<span>豆瓣读者标注 · 按赞数取前几条</span></h4>' +
        b.quotes
          .map(
            (q) =>
              '<blockquote class="m-quote serif">' + escapeHtml(q.q) +
              (q.p ? '<footer>引自 ' + escapeHtml(q.p) + "</footer>" : "") +
              "</blockquote>"
          )
          .join("") +
        "</div>"
      : "") +
    (rel.length
      ? '<div class="m-rel"><h4>读过这本的人也喜欢</h4><div class="rel-list">' +
        rel
          .map(
            (x) =>
              '<span class="rel-item" data-k="' + x._k + '"><b>' + escapeHtml(x.t) +
              "</b><span>" + (Number(x.s) || 0).toFixed(1) + "</span></span>"
          )
          .join("") +
        "</div></div>"
      : "") +
    '<a class="m-link" href="' + escapeHtml(doubanUrl) + '" target="_blank" rel="noopener">去豆瓣看这本书</a>';

  $("mask")?.classList.add("show");
}

export function closeModal() {
  $("mask")?.classList.remove("show");
}

export function isModalOpen() {
  return !!$("mask")?.classList.contains("show");
}
