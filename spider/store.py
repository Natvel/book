"""本地存储：douban_books.json 数据库（按豆瓣 subject id 去重，可随时中断续抓）。

并发安全分两层：
  1. 不读到半个文件 —— 写入走「临时文件 + 原子替换」，读取遇到坏文件自动重试。
  2. 不丢更新 —— save() 全程持有文件锁，并先把磁盘上其他进程写进去的记录并回内存，
     再整体写回。否则两个抓取进程各持一份自己启动时的快照，后写的那个会把
     先写的整库覆盖掉（曾把另一轮抓到的几千本漫画一次性抹掉）。
"""
import contextlib
import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DB_FILE = os.path.join(DATA_DIR, "douban_books.json")
LOCK_FILE = DB_FILE + ".lock"
LOG_FILE = os.path.join(DATA_DIR, "spider.log")

try:
    import fcntl  # macOS / Linux：真文件锁，跨进程互斥
except ImportError:  # pragma: no cover - Windows 兜底
    fcntl = None

# 记录里会随抓取更新的字段；合并时按「有值优先」处理，不覆盖已有的详情
_SCALAR_FIELDS = ("t", "a", "s", "v", "y", "ym", "pub", "d", "link", "img", "lang")

# 取并集的列表字段：tags=豆瓣标签，cats=栏目分类（新书速递/月度榜给的分类）
_LIST_FIELDS = ("tags", "cats")

# 「月度榜单」相关字段：charts 是历次上榜记录，只增不改
#   形如 {"2026-08": {"rank": 1, "dir": "up", "n": 2, "months": 2, "cat": ["文学"]}}
_CHART_FIELD = "charts"


@contextlib.contextmanager
def _lock():
    """跨进程互斥锁（锁文件常驻，不删除，避免 unlink 竞态）。"""
    if fcntl is None:
        yield
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    f = open(LOCK_FILE, "w")
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        finally:
            f.close()


def _read_raw():
    """读磁盘上的库；文件不存在返回 {}，坏文件重试。"""
    for i in range(8):
        try:
            with open(DB_FILE, encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            os.makedirs(DATA_DIR, exist_ok=True)
            return {}
        except json.JSONDecodeError:
            time.sleep(1.0 + i * 0.5)
    return {}


def load():
    return _read_raw()


# 「原文摘录」：每本一组 [{q: 文本, p: 页码, z: 赞数}]，重抓时整体替换（新抓的覆盖旧的）
_QUOTES_FIELD = "quotes"


def _absorb(dst, src):
    """把 src 并进 dst：标量「有值优先」，tags 取并集，榜单记录按月份合并。

    dst 已有的详情不会被抹掉——这是并发场景下不丢数据的关键。
    """
    for k in _SCALAR_FIELDS:
        if src.get(k):
            dst[k] = src[k]
    if src.get("dist"):
        dst["dist"] = src["dist"]
    if src.get("rated"):
        dst["rated"] = True
    for f in _LIST_FIELDS:
        mine = dst.setdefault(f, [])
        for t in src.get(f) or []:
            if t not in mine:
                mine.append(t)

    # 原文摘录：列表整体替换——重抓同本书时以最新一次为准（含空列表：表示这本书没有摘录）
    if isinstance(src.get(_QUOTES_FIELD), list):
        dst[_QUOTES_FIELD] = src[_QUOTES_FIELD]

    # 月度榜单：同一本书可能连续多月上榜，按月存，历史记录保留
    charts = src.get(_CHART_FIELD)
    if charts:
        d = dst.setdefault(_CHART_FIELD, {})
        for month, rec in charts.items():
            old = d.get(month)
            if not old:
                d[month] = rec
            else:
                # 同月重复抓到就取名次更好的那次（页数翻多了可能重复）
                if rec.get("rank") and (not old.get("rank") or rec["rank"] < old["rank"]):
                    old.update(rec)
                for c in rec.get("cat") or []:
                    cats = old.setdefault("cat", [])
                    if c not in cats:
                        cats.append(c)


def merge_chart(store, item, month):
    """把一条月度榜记录并进库：书目字段照常合并，外加 charts[month]。"""
    rec = dict(item)
    rec[_CHART_FIELD] = {month: item.get("chart") or {}}
    rec.pop("chart", None)
    return merge(store, rec)


def save(store):
    """加锁 + 先并回磁盘 + 再原子写。

    先并回磁盘这一步是关键：本进程的 store 是启动时的快照，磁盘上可能还有
    另一个进程后来写入的记录。直接写回＝用旧快照覆盖别人，会丢数据。
    并回后 store 变成「磁盘 ∪ 内存」，既准确（len(store) 是真实总量），
    也不会丢任何一方的新增。
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    with _lock():
        for k, v in _read_raw().items():
            if k in store:
                _absorb(store[k], v)
            else:
                store[k] = v
        tmp = "%s.%d.%d.tmp" % (DB_FILE, os.getpid(), time.time_ns() % 1_000_000)
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(store, f, ensure_ascii=False, indent=1)
            os.replace(tmp, DB_FILE)
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


def merge(store, item):
    """合并一个条目：新评分数据覆盖旧字段，标签去重追加，榜单记录按月累积。返回是否新增。

    和 save() 里并回磁盘用的是同一个 _absorb——只有一条合并路径，
    不会出现「内存合并」和「磁盘合并」行为不一致的坑。
    """
    old = store.get(item["id"])
    if old:
        _absorb(old, item)
        return False
    store[item["id"]] = item
    return True
