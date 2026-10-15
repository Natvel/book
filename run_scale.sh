#!/bin/bash
# 万卷挑一 · 扩大抓取规模（挂机跑，约 15 小时）
#
# 背景（实测数据）：
#   · 豆瓣图书标签页每种排序各只开放前 1000 本（start=1000 起返回空）
#   · 标签云共 145 个
#   · 「按评分」和「按热门」的前 1000 本几乎不重合（实测前 20 本重合 0 本）
#   · 标签间重叠很低：82% 的书只属于 1 个标签，边际产出稳定在 ~810 本/标签
#   所以：99 个全新标签 × 按评分 + 142 个标签 × 按热门 ≈ 12,050 次请求
#   按 3~6 秒/次算 ≈ 15 小时，预期最终 10 万~13 万本
#
# 与旧版的区别（旧的从没跑过，标签清单已过期）：
#   1. 标签清单由库内实际饱和度重新生成（tags_scale_score.txt / tags_scale_hot.txt）
#      —— 旧 tags_todo.txt 里有 14 个标签其实早抓满了，重跑纯属浪费
#   2. 改成「一个标签一次进程 + 断点续跑」：每抓完一个标签就写 data/scale_progress.txt，
#      中途被杀进程后重跑本脚本会自动跳过已完成的标签（旧版崩了就得从头再来）
#   3. 输出同时追加到 data/scale.log，便于事后核对
#
# caffeinate -is 阻止系统空闲睡眠；-i 对电池供电也生效。
set -u
cd "$(dirname "$0")" || exit 1
PY=/Users/ninftao/.workbuddy/binaries/python/versions/3.13.12/bin/python3
PROG=data/scale_progress.txt
mkdir -p data
touch "$PROG"

run_stage() {  # $1=排序(score|hot)  $2=标签清单文件
  local order="$1" file="$2" i=0 total t key
  total=$(grep -c . "$file")
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    i=$((i + 1))
    key="$order|$t"
    if grep -qxF "$key" "$PROG"; then
      # 注意：变量后面紧跟中文必须写成 ${t}——macOS 自带 bash 3.2 会把
      # 「$t（」误解析成变量名，配合 set -u 直接报 unbound variable 退出
      echo "[$(date '+%H:%M:%S')] ($i/$total) 跳过 $order · ${t}（已完成）"
      continue
    fi
    echo "[$(date '+%H:%M:%S')] ===== ($i/$total) $order · ${t} ====="
    if "$PY" cli.py list --tags "$t" --pages 50 --order "$order" \
         --delay-min 3 --delay-max 6; then
      echo "$key" >> "$PROG"
    else
      echo "[$(date '+%H:%M:%S')] !! ${t} 抓取失败，稍后重跑本脚本会自动重试"
    fi
  done < "$file"
}

echo "===== 阶段 1/2：99 个全新标签 × 按评分 $(date '+%F %H:%M:%S') ====="
run_stage score tags_scale_score.txt

echo "===== 阶段 2/2：142 个标签 × 按热门 $(date '+%F %H:%M:%S') ====="
run_stage hot tags_scale_hot.txt

echo "===== 抓取完成，导出前端数据 $(date '+%F %H:%M:%S') ====="
"$PY" cli.py export
"$PY" cli.py status
echo "===== 全部完成 $(date '+%F %H:%M:%S') ====="
