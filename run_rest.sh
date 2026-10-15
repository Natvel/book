#!/usr/bin/env bash
# 剩余抓取队列（全部用当前最新代码启动，避免长跑进程持有旧合并逻辑抹掉新字段）：
#   漫画类标签（此前两次被并发覆盖/旧代码抹掉）→ 300 本书原文摘录 → 导出
set -u
cd "$(dirname "$0")"
PY=/Users/ninftao/.workbuddy/binaries/python/versions/3.13.12/bin/python3

echo "===== [1/3] 漫画类标签（两套排序各一轮） $(date '+%H:%M:%S') ====="
$PY -u cli.py list --tags 漫画,绘本,杂志,日漫,轻小说 --pages 50 --order score
$PY -u cli.py list --tags 漫画,绘本,杂志,日漫,轻小说 --pages 50 --order hot

echo "===== [2/3] 原文摘录：评价 ≥1000 的前 300 本 $(date '+%H:%M:%S') ====="
$PY -u cli.py quotes --limit 300 --keep 3

echo "===== [3/3] 导出 $(date '+%H:%M:%S') ====="
$PY -u cli.py export
$PY -u cli.py status
echo "全部完成 $(date '+%H:%M:%S')"
