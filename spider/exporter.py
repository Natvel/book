"""导出：把数据库里有评分的书导出为 web/books_data.json 供前端加载。

同书版本合并（对应网页的「合并同书版本」开关）：
  按规范化书名分组，同一作品保留评价人数最多的版本作为代表，其余标记 alt（另一版本）。
  代表版本附带 editions（版本数）与 best_s（所有版本里的最高分），供网页展示。

前端在 web/js/data.js 里用 fetch 读取这个文件；
输出纯 JSON 而不是 `var BOOKS_EXT=[...]` 的脚本，避免每次打开页面都要
解析并编译 5MB 的 JS（JSON.parse 快得多，也不污染全局变量）。
"""
import json
import os
import re

from . import store as st

WEB_DIR = os.path.join(st.ROOT, "web")
OUT_JSON = os.path.join(WEB_DIR, "books_data.json")

# 会被剔除的版本修饰词（去括号内容之外的补充）
_EDITION_WORDS = re.compile(
    r"(全集|套装|典藏版?|珍藏版?|纪念版|新版|修订版|大字本|精装|平装|文库本|插图本|彩图本|"
    r"全译|白话本|精校|校订本?|校勘本?|新校本?|注本|点评本?|注评本?|白话|"
    r"脂评汇校本?|脂评本?|脂汇本?|脂砚斋全评本?|脂砚斋批评本?|批评本?|汇校本?|汇评本?|"
    r"全评本?|新评本?|新批校注|增评校注|批注本?|校注本?|新注本?|全本|"
    r"全\d+册|套装共\d+册|上下册|第[一二三四五六七八九十\d]+版)")
_PAREN = re.compile(r"[（(【\[][^）)】\]]*[）)】\]]")
_PUNCT = re.compile(r"[\s·・:：,，。.、\-—－_'\"“”]+")
# 罗马数字转阿拉伯（三体Ⅱ = 三体2）
_ROMAN_MAP = {"Ⅰ": 1, "Ⅱ": 2, "Ⅲ": 3, "Ⅳ": 4, "Ⅴ": 5, "Ⅵ": 6, "Ⅶ": 7, "Ⅷ": 8, "Ⅸ": 9, "Ⅹ": 10}
_ROMAN = re.compile("[" + "".join(_ROMAN_MAP) + "]")

# 常见漫画/绘本出版社（用于识别从其他标签混进来的漫画）
_COMIC_PUB = re.compile(
    r"(集英社|講談社|讲谈社|小学館|小学馆|東立|东立|尖端|角川|KADOKAWA|白泉社|青文|长鸿|"
    r"玉皇朝|天下出版|双叶社|秋田书店|少年画報|全音乐谱|Square Enix|スクウェア|"
    r"マガジン|JUMP|Comics|漫友|天闻角川|南海出版.*漫画)")


def norm_title(t):
    s = _PAREN.sub("", t or "")
    s = _EDITION_WORDS.sub("", s)
    s = _ROMAN.sub(lambda m: str(_ROMAN_MAP[m.group(0)]), s)  # 三体Ⅱ → 三体2，与「三体2」合并
    s = _PUNCT.sub("", s)
    return s.lower()


# 漫画/绘本识别规则（可在 data/comic_rules.json 里增删）
RULES_FILE = os.path.join(st.DATA_DIR, "comic_rules.json")
_DEFAULT_RULES = {
    "comic_tags": ["漫画", "绘本", "杂志", "日漫", "轻小说"],
    "publishers": ["集英社", "講談社", "讲谈社", "小学館", "小学馆", "東立", "东立", "尖端",
                   "角川", "KADOKAWA", "白泉社", "青文", "长鸿", "玉皇朝", "天下出版",
                   "漫画", "连环画", "动漫"],
    "title_patterns": ["漫画", "连环画", "画集", "原画集", "绘本", "灌篮高手", "机器猫", "哆啦A梦"],
}


def load_comic_rules():
    try:
        with open(RULES_FILE, encoding="utf-8") as f:
            rules = json.load(f)
    except Exception:
        rules = {}
    out = {}
    for k, default in _DEFAULT_RULES.items():
        v = rules.get(k) or default
        out[k] = v if isinstance(v, list) else default
    return out


_RULES = load_comic_rules()


def is_comic(x):
    """是否漫画/绘本类：抓取标签命中、出版社命中、或书名命中特征词。"""
    tags = x.get("tags") or []
    if any(t in _RULES["comic_tags"] for t in tags):
        return True
    pub = x.get("pub") or ""
    if any(p and p in pub for p in _RULES["publishers"]):
        return True
    title = x.get("t") or ""
    if any(p and p in title for p in _RULES["title_patterns"]):
        return True
    return False


# 包含式归并：长标题 = 短标题 + 这些「版本/批注」用字时才认为同一部书
_ALLOW_EXTRA = re.compile(r"[评注校批汇笺证疏稽考订补图藏精版册卷全增修异本译]")
_BLOCK_EXTRA = re.compile(r"[说论研导读赏析纪传话]")  # 「蒋勋说红楼梦」「细说…」这类解读著作不并入


def _extra_ok(extra):
    if not extra or len(extra) > 6:
        return False
    if _BLOCK_EXTRA.search(extra):
        return False
    return bool(_ALLOW_EXTRA.search(extra))


def _canonical_map(keys):
    """把「红楼梦脂评汇校本」「蔡义江新评红楼梦」这类键映到核心键「红楼梦」。

    只允许两种归并：
      A. 核心书名在前，后面跟的是版本/批注词（红楼梦 + 大字本 / 脂评汇校本）
      B. 核心书名在后，前面跟的是著者/批注者名（蔡义江 + 红楼梦、毛宗岗 + 三国演义）
    「蒋勋说红楼梦」「细说红楼梦」「红楼梦的法律世界」这类解读/衍生著作不并入。
    """
    pool = set(keys)
    canon = {}
    for k in keys:
        best = k
        n = len(k)
        for i in range(n):
            for j in range(i + 2, n + 1):
                sub = k[i:j]
                if sub not in pool or len(sub) >= len(best):
                    continue
                pre, suf = k[:i], k[j:]
                if not pre and _extra_ok(suf):
                    best = sub
                elif not suf and len(pre) <= 4 and not _BLOCK_EXTRA.search(pre):
                    best = sub
        canon[k] = best
    return canon


def export():
    store = st.load()
    rated = [x for x in store.values() if x.get("rated")]

    # ---- 同书版本合并 ----
    groups = {}
    for x in rated:
        groups.setdefault(norm_title(x.get("t", "")), []).append(x)
    # 包含式归并：把带批注者/版本词的键并到核心书名
    canon = _canonical_map(list(groups.keys()))
    merged = {}
    for k, items in groups.items():
        merged.setdefault(canon.get(k, k), []).extend(items)
    groups = merged
    merged_groups = 0
    for key, group in groups.items():
        if len(group) < 2:
            continue
        merged_groups += 1
        group.sort(key=lambda b: -(b.get("v") or 0))
        rep = group[0]
        rep["editions"] = len(group)
        rep["best_s"] = max(b.get("s") or 0 for b in group)
        for other in group[1:]:
            other["alt"] = rep.get("t", "")

    rated.sort(key=lambda x: -x.get("v", 0))
    items = []
    for x in rated:
        obj = {
            "t": x["t"], "a": x.get("a", ""), "s": x["s"], "v": x.get("v", 0),
            "y": int(x.get("y") or 0) or None, "pub": x.get("pub", ""),
            "tags": x.get("tags", []), "d": x.get("d", ""),
            "link": x.get("link", ""),
        }
        # 出版年月：只有标签页给年份、新书速递给到月份，有月份才输出
        if x.get("ym"):
            obj["ym"] = x["ym"]
        if x.get("cats"):
            obj["cats"] = x["cats"]
        # 历次登上「豆瓣 N 月热门图书榜」的记录：{月份: {rank,dir,n,months}}
        if x.get("charts"):
            obj["charts"] = x["charts"]
        # 原文摘录（读者标注的经典段落，赞数最高的几条）
        if x.get("quotes"):
            obj["quotes"] = x["quotes"]
        if x.get("dist"):
            obj["dist"] = x["dist"]
        if x.get("editions"):
            obj["editions"] = x["editions"]
            obj["best_s"] = x.get("best_s")
        if x.get("alt"):
            obj["alt"] = x["alt"]
        if is_comic(x):
            obj["comic"] = True
        items.append(obj)

    os.makedirs(WEB_DIR, exist_ok=True)
    tmp = OUT_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        # 紧凑分隔符：省下约三成体积，页面解析也更快
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT_JSON)  # 原子替换，页面不会读到写一半的文件

    unrated = sum(1 for x in store.values() if not x.get("rated"))
    comics = sum(1 for x in rated if is_comic(x))
    return len(rated), unrated, merged_groups, comics, OUT_JSON
