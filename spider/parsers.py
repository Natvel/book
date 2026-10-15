"""豆瓣页面解析：标签列表页 / 图书详情页 / 月度热门榜 / 新书速递 / 原文摘录。"""
import html as _html
import re


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()


def parse_pub(pub):
    """列表页 pub 行：'曹雪芹 / 启功 / 中华书局 / 2012-5 / 78.00元' → (作者, 出版方, 年份)"""
    parts = [strip_tags(p) for p in pub.split(" / ") if p.strip()]
    author = parts[0] if parts else ""
    year, yi = "", len(parts)
    for i, p in enumerate(parts):  # 年份通常独立成段
        m = re.match(r"^\s*(1[89]\d{2}|20[0-2]\d)", p)
        if m:
            year = m.group(1)
            yi = i
            break
    publisher = ""
    if yi > 1:
        publisher = parts[yi - 1] if parts[yi - 1] != author else ""
    if not publisher:
        for p in parts:
            if re.search(r"出版社|出版|书店|书局|书社|Press|press", p):
                publisher = p
                break
    return author, publisher, year


# 出版年月的两种写法：'2026-9' / '2026年9月' / '2026-09'
_YM = re.compile(r"(1[89]\d{2}|20[0-2]\d)\s*(?:[-–—/.年]\s*(\d{1,2}))?")


def parse_year_month(text):
    """从文本里取出版年月：'河美娜 / 2026-7 / 广西师大出版社' → ('2026', '2026-07')。

    月份可能缺失（老书只有年份），此时返回 ('2026', '')。
    标签页/新书速递给到月份，普通列表页只有年份——这就是「新书雷达」能按月切的关键。
    """
    m = _YM.search(text or "")
    if not m:
        return "", ""
    y, mo = m.group(1), m.group(2)
    if mo and 1 <= int(mo) <= 12:
        return y, "%s-%02d" % (y, int(mo))
    return y, ""


def _media_items(html):
    """拆出 .media 条目块——新书速递和月度热门榜用的是同一套 DOM"""
    return re.split(r'<li class="media clearfix">', html)[1:]


def _media_common(chunk):
    """两种榜单共有的字段：书名 / 出版信息 / 评分 / 人数"""
    m = re.search(
        r'<h2[^>]*>\s*<a class="fleft"[^>]*href="https://book\.douban\.com/subject/(\d+)/"[^>]*>(.*?)</a>',
        chunk, re.S)
    if not m:
        return None
    sid, title = m.group(1), strip_tags(m.group(2))
    title = re.split(r"\s*:\s*", title)[0].strip()  # 和标签页一致，去掉豆瓣副标题

    abstract = ""
    ma = re.search(r'<p class="subject-abstract[^"]*">(.*?)</p>', chunk, re.S)
    if ma:
        abstract = strip_tags(ma.group(1))
    parts = [p.strip() for p in abstract.split(" / ") if p.strip()]
    author = parts[0] if parts else ""
    ym = abstract
    publisher = ""
    for p in parts:
        if re.search(r"出版社|出版|书店|书局|书社|书馆|印书馆|Press", p):
            publisher = p
            break
    year, ym2 = parse_year_month(ym)

    rating = re.search(r'<span class="font-small fleft">([\d.]+)</span>', chunk)
    votes = re.search(r"\(\s*([0-9,]+)\s*人评价\s*\)", chunk)
    rated = bool(rating) and bool(votes)

    return {
        "id": sid, "t": title, "a": author, "pub": publisher,
        "y": year, "ym": ym2,
        "s": float(rating.group(1)) if rated else None,
        "v": int(votes.group(1).replace(",", "")) if votes else 0,
        "rated": rated, "d": "",
        "link": "https://book.douban.com/subject/%s/" % sid,
    }


def parse_chart_page(html):
    """解析「N月热门图书榜」（https://book.douban.com/chart）。

    这是豆瓣自己的月度排行榜，条目带：名次、名次涨跌（up/down + 位数）、
    「连续上榜N个月」、分类标签。分页 ?p=1/2/3，实测三页共约 23 本。
    注意：往期月份取不到（?updated_at=2026-07 只会把标题改成 6 月榜，列表是空的），
    所以历史榜单要靠定时抓取自己攒。

    标题只写「8月热门图书榜」不带年份，年月由调用方按抓取时间补全。
    """
    month_num = 0
    mfull = re.search(r"<h1[^>]*>\s*(\d{4})\s*年\s*(\d{1,2})\s*月", html)
    if mfull:
        month_num = int(mfull.group(2))
    else:
        mh = re.search(r"<h1[^>]*>\s*(\d{1,2})\s*月\s*热门图书榜", html)
        if mh:
            month_num = int(mh.group(1))

    out = []
    for chunk in _media_items(html):
        it = _media_common(chunk)
        if not it:
            continue
        rk = re.search(r'<strong class="green-num-box">\s*(\d+)\s*</strong>', chunk)
        trend = re.search(r'<span class="trend (up|down)"', chunk)
        tn = re.search(r'<span class="rank-value">\s*(\d+)\s*</span>', chunk)

        cats, months = [], None
        mt = re.search(r'<div class="subject-tags">(.*?)</div>', chunk, re.S)
        if mt:
            for t in re.findall(r'<span class="tag">(.*?)</span>', mt.group(1), re.S):
                t = strip_tags(t)
                mm = re.match(r"连续上榜(\d+)个月", t)
                if mm:
                    months = int(mm.group(1))
                elif t:
                    cats.append(t)

        it["tags"] = []
        it["cats"] = cats
        it["chart"] = {
            "rank": int(rk.group(1)) if rk else None,
            "dir": trend.group(1) if trend else "",
            "n": int(tn.group(1)) if tn else 0,
            "months": months,
            "cat": cats,
        }
        out.append(it)
    return {"month_num": month_num, "items": out}


def parse_latest_page(html, subcat):
    """解析「豆瓣新书速递」（https://book.douban.com/latest?subcat=X&p=N）。

    这是按出版时间滚动的新书列表，条目带**出版年月**（2026-9），
    正是月度视图需要的粒度。实测每个分类约 13 页 × 19 条封顶。

    分类放进独立的 cats 字段而不是 tags——否则「文学」「小说」这些栏目名
    会混进标签筛选和标签排除里，和真正的豆瓣标签分不清。
    """
    out = []
    for chunk in _media_items(html):
        it = _media_common(chunk)
        if not it:
            continue
        it["tags"] = []
        it["cats"] = [subcat] if subcat and subcat != "全部" else []
        out.append(it)
    return out


def parse_blockquotes(html):
    """「原文摘录」：详情页内嵌区块与 blockquotes 子页共用同一套 <li><figure> 结构。

    每条摘录含：正文文本、页码引用（「引自第202页」）、赞数。
    子页 ?sort=score 按赞数排——第一页就是这本书读者最认可的段落，
    所以只抓第一页，取赞数最高的几条即可，不必翻页。
    """
    out = []
    for chunk in re.split(r"<li>\s*<figure", html)[1:]:
        seg = chunk.split("</figure>")[0]
        # 正文在「( 查看原文 )」链接之前；顺手反转义实体、去掉引用符号
        t = re.split(r"\(\s*<a", seg, 1)[0]
        text = _html.unescape(strip_tags(t))
        text = re.sub(r"^[>\s—–]+", "", text).strip()
        if len(text) < 8:  # 太短的（残句/占位）不要
            continue
        page = ""
        mp = re.search(r"引自\s*(.+?)\s*</figcaption>", seg)
        if mp:
            page = strip_tags(_html.unescape(mp.group(1)))
        likes = re.search(r"(\d+)\s*赞", seg)
        out.append({"q": text, "p": page, "z": int(likes.group(1)) if likes else 0})
    return out


def parse_list_page(html, tag):
    """解析标签列表页。

    收录两类条目：
    - 正常条目（有评分和人数）
    - 「评价人数不足」/ 评分「载入中」的默认版面条目（rated=False，仅入库，
      由 detail 命令去详情页补真实评分；补不到则维持无评分，不上榜单）
    """
    out = []
    for chunk in re.split(r'class="subject-item"', html)[1:]:
        m = re.search(
            r'<h2[^>]*>\s*<a[^>]*href="https://book\.douban\.com/subject/(\d+)/"[^>]*>(.*?)</a>',
            chunk, re.S)
        if not m:
            continue
        sid, title = m.group(1), strip_tags(m.group(2))
        title = re.split(r"\s*:\s*", title)[0].strip()  # 去掉豆瓣副标题
        pub = ""
        mp = re.search(r'<div class="pub">(.+?)</div>', chunk, re.S)
        if mp:
            pub = strip_tags(mp.group(1))
        a, publisher, year = parse_pub(pub)
        rating = re.search(r'<span class="rating_nums">([\d.]+)</span>', chunk)
        votes = re.search(r'<span class="pl">\s*\(\s*([0-9,]+)人评价', chunk)
        rated = bool(rating) and bool(votes)
        out.append({
            "id": sid, "t": title, "a": a, "pub": publisher,
            "y": year,
            "s": float(rating.group(1)) if rated else None,
            "v": int(votes.group(1).replace(",", "")) if votes else 0,
            "rated": rated, "tags": [tag], "d": "",
            "link": f"https://book.douban.com/subject/{sid}/",
        })
    return out


def parse_detail(html):
    """解析图书详情页：标题/作者/出版方/年份/评分/人数/星级分布/豆瓣标签/简介。"""
    d = {}
    m = re.search(r'property="v:itemreviewed">(.*?)</span>', html)
    if m:
        d["t"] = strip_tags(m.group(1))
    info = re.search(r'<div id="info"[^>]*>(.*?)</div>', html, re.S)
    if info:
        txt = info.group(1)
        ma = re.search(r'作者</span>[^<]*(?:<a[^>]*>(.*?)</a>|<br\s*/?>)', txt, re.S)
        if ma:
            d["a"] = strip_tags(ma.group(1) or "")
        mp = re.search(r'出版社:</span>\s*(?:<a[^>]*>(.*?)</a>|([^<]+))', txt)
        if mp:
            d["pub"] = strip_tags(mp.group(1) or mp.group(2) or "")
        my = re.search(r'出版年:</span>\s*([0-9\-年月\.]+)', txt)
        if my:
            d["y"] = my.group(1)[:4].strip("-")
    mr = re.search(r'property="v:average">([\d.]+)</strong>', html)
    mv = re.search(r'property="v:votes">(\d+)</span>', html)
    if mr:
        d["s"] = float(mr.group(1))
        d["v"] = int(mv.group(1)) if mv else 0
        d["rated"] = True
    pers = re.findall(r'class="rating_per"[^>]*>([\d.]+)%<', html)
    if len(pers) == 5:
        d["dist"] = [float(p) for p in pers]  # 顺序：5星→1星
    # 注：豆瓣已于 2026 年前后下线条目页的「豆瓣成员常用的标签」区块
    # （页面中已无 tags-body 结构），标签目前来自列表页抓取时的顶层标签。
    mtag = re.search(r'tags-body(.*?)</div>', html, re.S)
    if mtag:
        d["ptags"] = [strip_tags(x) for x in re.findall(r'<a[^>]*>(.*?)</a>', mtag.group(1))][:15]
    intro = re.search(r'<div class="intro">(.*?)</div>', html, re.S)
    if intro:
        paras = [strip_tags(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', intro.group(1), re.S)]
        d["d"] = " ".join(p for p in paras if p)[:150]
    return d
