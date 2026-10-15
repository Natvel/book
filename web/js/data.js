/* ============================================================
   数据源装配
   BOOKS 是导出的同一个数组引用，各模块直接读；加载完再往里填，
   这样任何模块 import { BOOKS } 之后不需要重新取引用。
   ============================================================ */
import { DATA_URL } from "./config.js";
import { DEMO_BOOKS } from "./demo-books.js";

/** 全部书目（真实数据或演示数据） */
export const BOOKS = [];

/** 当前用的是不是豆瓣真实数据 */
export let USING_EXT = false;

/** 数据源说明，用于统计行文案 */
export function sourceLabel() {
  return USING_EXT ? "豆瓣数据" : "示例数据";
}

/**
 * 给每本书打一个稳定的内部编号 _k。
 * 书名可能重复（同一部书的不同版本都以本名展示），列表里靠 _k 精确定位到具体条目。
 */
let seq = 0;
function tag(book) {
  if (book._k == null) book._k = ++seq;
  return book;
}

/** 按内部编号取书；O(n) 但只在点开详情时走一次 */
export function bookByKey(k) {
  const n = Number(k);
  return BOOKS.find((b) => b._k === n) || null;
}

/**
 * 载入书目。优先 fetch books_data.json；失败则退回内置演示数据。
 * @returns {Promise<{count:number, real:boolean, error:Error|null}>}
 */
export async function loadBooks() {
  let error = null;
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length) {
        BOOKS.length = 0;
        arr.forEach((b) => BOOKS.push(tag(b)));
        USING_EXT = true;
        return { count: BOOKS.length, real: true, error: null };
      }
      error = new Error("数据文件为空");
    } else {
      error = new Error("HTTP " + res.status);
    }
  } catch (e) {
    error = e;
  }

  // 兜底：还没跑过爬虫时用演示数据，保证页面不是空白
  BOOKS.length = 0;
  DEMO_BOOKS.forEach((b) => BOOKS.push(tag({ ...b })));
  USING_EXT = false;
  return { count: BOOKS.length, real: false, error };
}
