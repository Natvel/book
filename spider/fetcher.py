"""HTTP 抓取层：限速、重试、403 冷却、请求日志。"""
import random
import threading
import time
import urllib.request as ureq

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# 个人自用：保持低频率。DELAY_MIN/MAX 为相邻两次请求的随机间隔秒数。
DELAY_MIN = 3.0
DELAY_MAX = 6.0
COOLDOWN_403 = 1800  # 触发反爬后冷却秒数
TIMEOUT = 20

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://book.douban.com/",
}

_lock = threading.Lock()
_last_ts = 0.0


def set_delay(mn=None, mx=None):
    """调整请求间隔（并发跑多个任务时调大，避免总频率过高）。"""
    global DELAY_MIN, DELAY_MAX
    if mn:
        DELAY_MIN = float(mn)
    if mx:
        DELAY_MAX = float(mx)
    if DELAY_MAX < DELAY_MIN:
        DELAY_MAX = DELAY_MIN


def log(msg):
    print(time.strftime("[%H:%M:%S] ") + msg, flush=True)


def _polite_wait():
    """全局节流：任何两次请求之间至少间隔随机 3~6 秒。"""
    global _last_ts
    with _lock:
        now = time.time()
        wait = _last_ts + random.uniform(DELAY_MIN, DELAY_MAX) - now
        if wait > 0:
            time.sleep(wait)
        _last_ts = time.time()


def fetch(url, tries=3):
    """抓取一个 URL，返回 HTML 文本；多次失败返回 None。"""
    for i in range(tries):
        _polite_wait()
        try:
            req = ureq.Request(url, headers=HEADERS)
            with ureq.urlopen(req, timeout=TIMEOUT) as r:
                return r.read().decode("utf-8", "ignore")
        except ureq.HTTPError as e:
            if e.code in (403, 418, 429):
                wait = COOLDOWN_403 * (i + 1)
                log(f"触发反爬({e.code})，冷却 {wait // 60} 分钟后重试…")
                time.sleep(wait)
            else:
                log(f"HTTP {e.code}: {url}")
                time.sleep(8)
        except Exception as ex:
            log(f"网络错误，重试: {ex}")
            time.sleep(12)
    log(f"放弃: {url}")
    return None
