#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""万卷挑一 · 命令行入口

用法:
  python3 cli.py list --tags 小说,历史,科幻 --pages 30   # 按标签列表页抓书目
  python3 cli.py detail --limit 500                       # 补抓高分书详情页
  python3 cli.py chart                                    # 抓豆瓣「N月热门图书榜」
  python3 cli.py latest                                   # 抓豆瓣「新书速递」（带出版年月）
  python3 cli.py export                                   # 导出 web/books_data.json
  python3 cli.py status                                   # 看数据库统计
  python3 cli.py serve --port 8000                        # 本地起网页预览

示例（常用轮次）:
  python3 cli.py list --tags 小说,文学,历史,科幻,推理,心理学,经济学,哲学 --pages 40
  python3 cli.py detail --limit 800
  python3 cli.py chart && python3 cli.py latest
  python3 cli.py export && python3 cli.py serve
"""
import argparse
import time
from urllib.parse import quote

from spider import store as st
from spider.fetcher import fetch, log, set_delay
from spider.store import _QUOTES_FIELD as _QUOTES_KEY
from spider.parsers import (
    parse_blockquotes,
    parse_chart_page,
    parse_detail,
    parse_latest_page,
    parse_list_page,
)
from spider.exporter import export

# 新书速递的分类（页面上给的固定 8 个 + 全部）
LATEST_SUBCATS = ["全部", "文学", "小说", "历史文化", "社会纪实", "科学新知", "艺术设计", "商业经管", "绘本漫画"]


def cmd_list(args):
    store = st.load()
    set_delay(args.delay_min, args.delay_max)
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    # 豆瓣标签页每种排序各只开放前 1000 本（start=1000 起返回空），
    # 而「按评分」和「按热门」的前 1000 本几乎不重合——两轮都跑能接近翻倍枚举量。
    order_param = {"score": "&type=S", "hot": ""}[args.order]
    log(f"排序方式：{args.order}（score=按评分 / hot=按热门）")
    for tag in tags:
        got_new, empty_round = 0, 0
        for page in range(args.pages):
            start = page * 20
            url = f"https://book.douban.com/tag/{quote(tag)}?start={start}{order_param}"
            html = fetch(url)
            if not html:
                break
            items = parse_list_page(html, tag)
            log(f"[{tag}] 第{page + 1}页(start={start})：{len(items)} 本")
            if not items:
                empty_round += 1
                if empty_round >= 1:
                    break
                continue
            for it in items:
                if st.merge(store, it):
                    got_new += 1
            # 每 5 页存一次：库已有 ~9MB，每页都整库写回会让抓取慢一倍以上
            if page % 5 == 4:
                st.save(store)
        st.save(store)
        log(f"[{tag}] 完成，新增 {got_new} 本，总量 {len(store)}")
    st.save(store)
    unrated = sum(1 for x in store.values() if not x.get("rated"))
    log(f"列表抓取结束，共 {len(store)} 本（含无评分条目 {unrated} 本，可用 detail 补）")


def cmd_detail(args):
    store = st.load()
    if args.all:
        need = list(store.values())
    else:
        need = [x for x in store.values()
                if x.get("rated") and not x.get("d")]
    need.sort(key=lambda x: -(x.get("v") or 0))
    need = need[:args.limit]
    log(f"待补详情 {len(need)} 本（按评价人数从多到少）")
    for i, it in enumerate(need):
        html = fetch(it["link"])
        if html:
            d = parse_detail(html)
            for k in ("a", "pub", "y", "s", "v", "d", "t"):
                if d.get(k):
                    it[k] = d[k]
            if d.get("dist"):
                it["dist"] = d["dist"]
            if d.get("ptags"):
                merged = list(dict.fromkeys(d["ptags"] + [t for t in it["tags"] if t not in d["ptags"]]))
                it["tags"] = merged[:12]
            if d.get("rated") and not it.get("rated"):
                it["rated"] = True  # 列表页「载入中」的条目，详情页补到了评分
            # 每 10 本存一次：库已近 40MB，save() 要整库读回+重写，
            # 逐本存等于每本书白搭 4~5 秒磁盘往返，抓取速度直接砍半。
            if i % 10 == 9:
                st.save(store)
        log(f"({i + 1}/{len(need)}) {it['t']}")
    st.save(store)  # 收尾：补齐不足 10 本的尾巴（否则最后几本会丢）
    log("详情抓取结束")


def cmd_chart(args):
    """抓「豆瓣 N月热门图书榜」——豆瓣自己的月度排行榜。

    条数很少（实测 3 页共约 23 本），但信息是别处拿不到的：
    名次、名次涨跌、连续上榜月数、豆瓣给的分类。
    往期月份抓不到（带上 ?updated_at= 只会把标题改掉、列表变空），
    所以历史榜单只能靠定时抓取自己攒——每本书的 charts 字段按月累积。
    """
    store = st.load()
    set_delay(args.delay_min, args.delay_max)
    now = time.localtime()
    got, merged, month = 0, 0, ""

    for page in range(1, args.pages + 1):
        url = "https://book.douban.com/chart?p=%d" % page
        html = fetch(url)
        if not html:
            log(f"[月度榜] 第{page}页抓取失败，停止")
            break
        res = parse_chart_page(html)
        items = res["items"]
        if not items:
            log(f"[月度榜] 第{page}页无条目，停止")
            break
        # 标题只有「8月热门图书榜」，年份按抓取时间补；跨年时用「上月」兜一下
        mn = res["month_num"] or (now.tm_mon - 1 or 12)
        month = "%d-%02d" % (now.tm_year, mn)
        if mn > now.tm_mon:  # 12 月抓到的「1月榜」属于下一年
            month = "%d-%02d" % (now.tm_year + 1, mn)

        for it in items:
            if st.merge_chart(store, it, month):
                got += 1
            else:
                merged += 1
        st.save(store)
        log(f"[月度榜] 第{page}页：{len(items)} 本（新增 {got}，更新 {merged}）")

    st.save(store)
    log(f"[月度榜] 完成，榜单月 {month}，新增 {got} 本，更新 {merged} 本，总量 {len(store)}")


def cmd_latest(args):
    """抓「豆瓣新书速递」——按出版时间滚动的新书列表，带**出版年月**。

    这是月度视图的关键数据源：标签页只给到年份，这里给到月份。
    实测每个分类 13 页 × 19 条封顶，9 个分类合计约 1,700 条（含重复）。
    """
    store = st.load()
    set_delay(args.delay_min, args.delay_max)
    subs = [s.strip() for s in args.subcats.split(",") if s.strip()] if args.subcats else LATEST_SUBCATS
    total_new = 0

    for sub in subs:
        got_new = 0
        for page in range(1, args.pages + 1):
            url = "https://book.douban.com/latest?subcat=%s&p=%d&updated_at=" % (quote(sub), page)
            html = fetch(url)
            if not html:
                break
            items = parse_latest_page(html, sub)
            if not items:
                log(f"[新书速递·{sub}] 第{page}页无条目，本分类结束")
                break
            for it in items:
                if st.merge(store, it):
                    got_new += 1
            if page % 3 == 0:
                st.save(store)
        st.save(store)
        total_new += got_new
        log(f"[新书速递·{sub}] 完成，新增 {got_new} 本，总量 {len(store)}")

    st.save(store)
    with_ym = sum(1 for x in store.values() if x.get("ym"))
    log(f"[新书速递] 全部完成，新增 {total_new} 本；库里有出版年月的共 {with_ym} 本")


def cmd_quotes(args):
    """抓「原文摘录」——豆瓣读者为好书标注的经典段落，带页码引用。

    入口是 subject/blockquotes?sort=score：按赞数排，第一页（20 条）就是
    这本书最受认可的摘录，所以每本书只要 1 次请求，取赞数最高的几条。
    没有摘录的书也会标记（quotes=[]），重跑时自动跳过，不浪费请求。
    """
    store = st.load()
    set_delay(args.delay_min, args.delay_max)
    need = [
        x for x in store.values()
        if x.get("rated") and (x.get("v") or 0) >= args.min_votes
        and _QUOTES_KEY not in x  # 有标记（含空列表）就跳过
    ]
    need.sort(key=lambda x: -(x.get("v") or 0))
    need = need[: args.limit]
    log(f"待抓摘录 {len(need)} 本（评价 ≥ {args.min_votes}，按人数从多到少，每本保留赞数最高的 {args.keep} 条）")

    got = 0
    for i, it in enumerate(need):
        html = fetch(it["link"] + "blockquotes?sort=score")
        if html:
            qs = parse_blockquotes(html)
            qs.sort(key=lambda q: -q["z"])
            it[_QUOTES_KEY] = qs[: args.keep]
            if qs:
                got += 1
        else:
            it[_QUOTES_KEY] = []  # 请求失败也标记，避免反复撞同一本书
        if i % 5 == 4:
            st.save(store)
        log(f"({i + 1}/{len(need)}) {it['t']}：{len(it[_QUOTES_KEY])} 条")
    st.save(store)
    total = sum(1 for x in store.values() if x.get(_QUOTES_KEY))
    log(f"摘录抓取结束：本次 {got} 本有摘录；库里共 {total} 本已标记")


def cmd_export(args):
    n, unrated, merged, comics, path = export()
    log(f"导出 {n} 本（有评分）→ {path}")
    log(f"其中 {merged} 组是同书多版本，已标记合并关系（网页「合并同书版本」开关生效）")
    log(f"识别到漫画/绘本类 {comics} 本（不勾「含漫画与绘本」时会被排除）")
    log(f"数据库另有 {unrated} 本无评分条目，仅存 data/douban_books.json")


def cmd_status(args):
    store = st.load()
    rated = [x for x in store.values() if x.get("rated")]
    with_d = sum(1 for x in rated if x.get("d"))
    with_dist = sum(1 for x in rated if x.get("dist"))
    tags = {}
    for x in store.values():
        for t in x.get("tags", []):
            tags[t] = tags.get(t, 0) + 1
    log(f"数据库共 {len(store)} 本；有评分 {len(rated)} 本；有简介 {with_d} 本；有星级分布 {with_dist} 本")
    if tags:
        top = sorted(tags.items(), key=lambda kv: -kv[1])[:12]
        log("标签覆盖: " + "，".join(f"{t}({c})" for t, c in top))
    if rated:
        hi = sorted(rated, key=lambda x: -(x.get("v") or 0))[:5]
        log("评价人数 Top5: " + "；".join(f"{x['t']}({x['v']})" for x in hi))


def cmd_serve(args):
    import serve
    serve.run(args.port)


def main():
    ap = argparse.ArgumentParser(description="万卷挑一 · 豆瓣图书抓取与好书榜（个人自用）")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("list", help="按标签列表页抓书目")
    p1.add_argument("--tags", default="小说", help="逗号分隔的标签，如：小说,历史,科幻")
    p1.add_argument("--pages", type=int, default=10, help="每个标签抓多少页（每页约20本）")
    p1.add_argument("--delay-min", type=float, default=None, help="请求最小间隔秒（默认3，并发跑时调大）")
    p1.add_argument("--delay-max", type=float, default=None, help="请求最大间隔秒（默认6）")
    p1.add_argument(
        "--order", choices=["score", "hot"], default="score",
        help="标签页排序：score=按评分（默认）/ hot=按热门。两者前1000本几乎不重合，建议各跑一轮",
    )

    p2 = sub.add_parser("detail", help="补抓详情页（标签/简介/星级分布/漏掉的评分）")
    p2.add_argument("--limit", type=int, default=300, help="最多补多少本")
    p2.add_argument("--all", action="store_true", help="全部条目都补（默认只补有评分但缺简介的）")

    p5 = sub.add_parser("chart", help="抓豆瓣「N月热门图书榜」（月度排行，含名次涨跌）")
    p5.add_argument("--pages", type=int, default=4, help="最多抓几页（实测第 4 页起为空）")
    p5.add_argument("--delay-min", type=float, default=None, help="请求最小间隔秒")
    p5.add_argument("--delay-max", type=float, default=None, help="请求最大间隔秒")

    p6 = sub.add_parser("latest", help="抓豆瓣「新书速递」（带出版年月，月度视图的数据源）")
    p6.add_argument("--pages", type=int, default=13, help="每个分类最多抓几页（实测第 14 页起为空）")
    p6.add_argument("--subcats", default="", help="逗号分隔的分类，默认全部 9 个")
    p6.add_argument("--delay-min", type=float, default=None, help="请求最小间隔秒")
    p6.add_argument("--delay-max", type=float, default=None, help="请求最大间隔秒")

    p7 = sub.add_parser("quotes", help="抓「原文摘录」（经典段落+页码引用，每本 1 次请求）")
    p7.add_argument("--min-votes", type=int, default=1000, help="只抓评价人数达到多少的书")
    p7.add_argument("--limit", type=int, default=300, help="本次最多抓多少本")
    p7.add_argument("--keep", type=int, default=3, help="每本书保留赞数最高的几条")
    p7.add_argument("--delay-min", type=float, default=None, help="请求最小间隔秒")
    p7.add_argument("--delay-max", type=float, default=None, help="请求最大间隔秒")

    sub.add_parser("export", help="导出 web/books_data.json")
    sub.add_parser("status", help="数据库统计")

    p4 = sub.add_parser("serve", help="本地起网页预览")
    p4.add_argument("--port", type=int, default=8000)

    args = ap.parse_args()
    {"list": cmd_list, "detail": cmd_detail, "chart": cmd_chart, "latest": cmd_latest,
     "quotes": cmd_quotes, "export": cmd_export,
     "status": cmd_status, "serve": cmd_serve}[args.cmd](args)


if __name__ == "__main__":
    main()
