/* ============================================================
   视图：标签快捷排除
   建一次（要遍历全库统计词频，比较贵），之后只切换高亮。

   默认只显示次数最多的前 16 个标签，尾部一个「全部 N 个标签」
   展开开关——库里一共 57 种标签，只给 16 个的话用户想全选也选不全
   （排除是黑名单：只有带上被点标签的书才会被去掉）。
   ============================================================ */
import { $, escapeHtml, splitExclude } from "../utils.js";
import { BOOKS } from "../data.js";
import { state } from "../state.js";

const CHIP_LIMIT = 16;

let expanded = false; // 展开状态只属于界面，不进 URL、不进筛选状态

/** 建标签条：默认取次数前 16，展开后全部 */
export function buildChips(limit = CHIP_LIMIT) {
  const counter = {};
  BOOKS.forEach((b) => {
    if (b.alt) return; // 另一版本的条目不参与词频
    (b.tags || []).forEach((t) => {
      counter[t] = (counter[t] || 0) + 1;
    });
  });

  const all = Object.keys(counter).sort((a, b) => counter[b] - counter[a]);
  const shown = expanded ? all : all.slice(0, limit);

  const box = $("tagChips");
  if (!box) return;
  box.innerHTML =
    '<span class="lab" style="font-size:13px;color:var(--grey);flex:none">点标签可排除：</span>' +
    shown
      .map(
        (t) =>
          '<button type="button" class="opt" data-tt="' + escapeHtml(t) + '">' +
          escapeHtml(t) +
          '<span class="cnt">' + counter[t] + "</span></button>"
      )
      .join("") +
    (all.length > limit
      ? '<button type="button" class="opt chip-toggle">' +
        (expanded ? "收起 ▴" : "全部 " + all.length + " 个标签 ▾") +
        "</button>"
      : "");

  // 展开开关：直连（重建后重新绑），不带 data-tt 所以不会触发标签排除
  const tog = box.querySelector(".chip-toggle");
  if (tog) {
    tog.addEventListener("click", () => {
      expanded = !expanded;
      buildChips();
      markActiveChips(state.exclude); // 重建后把已排除的标签重新点亮
    });
  }
}

/** 只切换高亮，不重建 DOM */
export function markActiveChips(excludeStr) {
  const active = new Set(splitExclude(excludeStr));
  document.querySelectorAll("#tagChips button[data-tt]").forEach((b) => {
    b.classList.toggle("on", active.has(b.dataset.tt));
  });
}
