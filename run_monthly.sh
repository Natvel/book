#!/usr/bin/env bash
# 月度数据 + 剩余标签的串行抓取队列。
#
# 顺序有讲究：把「月度榜 + 新书速递」放最前面（约 10 分钟），
# 抓完立刻 export 一次——网页的月度视图这时就能看到真数据了；
# 后面那批标签（约 1 小时）属于补量，晚到不影响新功能。
#
# 之所以串行不并行：豆瓣反爬按 IP 算总量，单进程 3~6 秒/次最稳。
set -u
cd "$(dirname "$0")"
PY=/Users/ninftao/.workbuddy/binaries/python/versions/3.13.12/bin/python3

echo "===== [1/5] 豆瓣 N月热门图书榜 $(date '+%H:%M:%S') ====="
$PY -u cli.py chart --pages 4

echo "===== [2/5] 豆瓣新书速递（带出版年月） $(date '+%H:%M:%S') ====="
$PY -u cli.py latest --pages 13

echo "===== [3/5] 导出网页数据（月度视图此刻可用） $(date '+%H:%M:%S') ====="
$PY -u cli.py export
$PY -u cli.py status

echo "===== [4/5] 补抓剩余 8 个标签 $(date '+%H:%M:%S') ====="
$PY -u cli.py list --tags 生物,中国历史,世界史,电影,设计,建筑,摄影,人类学 --pages 50 --order score

echo "===== [5/5] 补跑漫画类标签（此前被并发覆盖丢掉的那批） $(date '+%H:%M:%S') ====="
$PY -u cli.py list --tags 漫画,绘本,杂志,日漫,轻小说 --pages 50 --order score
$PY -u cli.py list --tags 漫画,绘本,杂志,日漫,轻小说 --pages 50 --order hot

echo "===== 收尾导出 $(date '+%H:%M:%S') ====="
$PY -u cli.py export
$PY -u cli.py status
echo "全部完成 $(date '+%H:%M:%S')"
