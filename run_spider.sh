#!/bin/bash
# 万卷挑一 · 批量抓取脚本（由 launchd 调度）
# caffeinate -is: 脚本运行期间阻止系统空闲睡眠（-i 对电池供电也生效）
cd /Users/ninftao/WorkBuddy/2026-10-07-07-35-46/wanjuan || exit 1
exec /usr/bin/caffeinate -is /Users/ninftao/.workbuddy/binaries/python/versions/3.13.12/bin/python3 -u cli.py list \
  --tags 小说,文学,随笔,历史,科幻,推理,心理学,经济学,哲学,社会学,传记,艺术,数学,编程,文化,政治,法律,医学,教育,商业 \
  --pages 50
