#!/usr/bin/env bash
# 补跑被并发覆盖掉的 5 个漫画/绘本标签。
#
# 背景：之前「漫画/绘本/杂志/日漫/轻小说」那轮抓到的约 3800 本，
# 被同时运行的另一个抓取进程用「整库覆盖写」抹掉了（store.save 丢更新）。
# store.py 已修成「持锁 + 先并回磁盘再写」，但正在跑的那个进程用的是旧代码，
# 所以这里先等它退出，再补跑，避免再次被覆盖。
set -u
cd "$(dirname "$0")"
PY=/Users/ninftao/.workbuddy/binaries/python/versions/3.13.12/bin/python3
TAGS=漫画,绘本,杂志,日漫,轻小说

echo "[wait] 等待主抓取进程（中国文学 那一轮）结束..."
while pgrep -f "cli.py list --tags 中国文学" >/dev/null 2>&1; do
  sleep 30
done
echo "[wait] 主抓取已结束，开始补跑漫画类标签 $(date '+%H:%M:%S')"

echo "[1/3] 按评分排序补抓"
$PY -u cli.py list --tags "$TAGS" --pages 50 --order score

echo "[2/3] 按热门排序补抓（与按评分几乎不重合，可再翻一倍）"
$PY -u cli.py list --tags "$TAGS" --pages 50 --order hot

echo "[3/3] 导出网页数据"
$PY -u cli.py export
$PY -u cli.py status
echo "全部完成 $(date '+%H:%M:%S')"
