#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地预览服务器：python3 serve.py [port]，默认 http://localhost:8000

用线程化的 ThreadingHTTPServer，避免单线程在传输 5MB 的 books_data.json
时阻塞其它请求；allow_reuse_address 让端口重启时不被 TIME_WAIT 卡住。

注意：前端用的是原生 ES Module，浏览器不允许 file:// 协议加载模块，
所以必须通过本服务器（或其它 http 服务）打开页面，双击 index.html 无效。
"""
import http.server
import os
import sys
from functools import partial


WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map[""] = "text/plain; charset=utf-8"
    extensions_map[".js"] = "application/javascript; charset=utf-8"
    extensions_map[".html"] = "text/html; charset=utf-8"

    def end_headers(self):
        # 本地预览，禁用缓存，改完就能看到
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def run(port=8000):
    handler = partial(Handler, directory=WEB_DIR)
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"万卷挑一 已启动: http://localhost:{port}  (Ctrl+C 停止)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")


def _parse_port(argv):
    """支持 `serve.py 8777` 和 `serve.py --port 8777` 两种写法。"""
    for i, a in enumerate(argv):
        if a in ("--port", "-p") and i + 1 < len(argv):
            return int(argv[i + 1])
        if a.startswith("--port="):
            return int(a.split("=", 1)[1])
        if a.isdigit():
            return int(a)
    return 8000


if __name__ == "__main__":
    run(_parse_port(sys.argv[1:]))
