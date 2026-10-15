/* ============================================================
   入口：绑事件 → 载数据 → 首屏渲染
   ============================================================ */
import { $ } from "./utils.js";
import { loadBooks } from "./data.js";
import { readUrl, syncInputs } from "./state.js";
import { buildChips } from "./views/chips.js";
import { render } from "./render.js";
import { bindEvents } from "./events.js";

/** 页面级错误直接显示在统计行上，不静默失败 */
function reportError(err) {
  console.error("[万卷挑一]", err);
  const el = $("statsLine");
  if (el) el.textContent = "出错了：" + (err && err.message ? err.message : err);
}

window.addEventListener("error", (e) => {
  const el = $("statsLine");
  if (el && !el.textContent.includes("出错")) el.textContent = "脚本出错：" + (e.message || "未知错误");
});

async function boot() {
  // 先绑事件：数据还在路上时界面已经可点，不会出现「点了没反应」
  bindEvents();

  const res = await loadBooks();
  if (!res.real) {
    console.warn(
      "[万卷挑一] 没读到 " +
        "books_data.json，已改用内置示例数据。" +
        (res.error ? "（原因：" + res.error.message + "）" : "")
    );
  }

  readUrl();
  syncInputs();
  buildChips();
  render();
}

boot().catch(reportError);
