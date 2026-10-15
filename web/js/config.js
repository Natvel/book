/* ============================================================
   全局常量
   改默认筛选条件、分页条数、排序项，都只动这一个文件。
   ============================================================ */

/** 每页条数 */
export const PER = 20;

/** 默认筛选条件：打开就是「8.5 分以上 + 1000 人以上评价」的好书榜 */
export const DEF = Object.freeze({
  min_score: 8.5,
  min_votes: 1000,
  sort: "idx",
});

/** 排序项的中文名；键的顺序就是按钮顺序 */
export const SORT_LABEL = {
  idx: "好书指数",
  score: "评分",
  votes: "评价人数",
  new: "最新出版",
  old: "最早出版",
};

/** 好书指数（IMDb Top 250 贝叶斯加权）：v/(v+m)×s + m/(v+m)×C */
export const BAYES = Object.freeze({ m: 1000, C: 8.05 });

/**
 * 新书雷达
 *
 * 两个数据源，都来自豆瓣自己的月度数据（`cli.py chart` / `cli.py latest`）：
 *   chart  —— 「豆瓣 N月热门图书榜」，豆瓣官方月度排行（名次/涨跌/连续上榜月数）
 *   latest —— 「豆瓣新书速递」，按出版时间滚动，带**出版年月**（标签页只有年份）
 *
 * 雷达分用 m=150 而不是主榜的 1000：新书评价人数天然少（很多只有几十人），
 * 沿用主榜权重会把所有新书拉平到 8.05 附近，排不出高低。
 */
export const RADAR = Object.freeze({
  mode: "chart", // chart=豆瓣月度榜 / latest=新书速递
  minVotes: 30, // 新书速递的最低评价人数
  show: 120, // 榜单最多显示多少本
  allMonths: "__all__", // 「全部月份」的哨兵值
  m: 150,
  C: 8.05,
});

/** 两个数据源的中文名 */
export const RADAR_MODE_LABEL = { chart: "豆瓣月度榜", latest: "新书速递" };

/** 未勾选「含漫画绘本」时要排除的标签（数据端已有的 comic 标记之外再兜一层） */
export const COMIC_TAGS = ["漫画", "绘本", "杂志", "日漫", "轻小说"];

/** 真实数据地址，由 spider/exporter.py 生成 */
export const DATA_URL = "books_data.json";
