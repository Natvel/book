# 部署到腾讯云 Lighthouse

整套项目只用 Python 标准库，Linux 服务器无需 pip 安装任何东西。

## 1. 上传

```bash
# 在本地（Mac）执行，IP 换成你的 Lighthouse 公网 IP
scp wanjuan-deploy.tar.gz ubuntu@<IP>:~/
ssh ubuntu@<IP>

# 服务器上解压
tar xzf wanjuan-deploy.tar.gz
cd wanjuan
python3 cli.py status        # 确认能跑，应显示 Mac 上已抓到的存量
```

## 2. 挂后台长跑（服务器上 nohup 不会被回收）

```bash
# 列表页批量抓取（20 标签 × 50 页，约 5~6 小时）
nohup python3 -u cli.py list \
  --tags 小说,文学,随笔,历史,科幻,推理,心理学,经济学,哲学,社会学,传记,艺术,数学,编程,文化,政治,法律,医学,教育,商业 \
  --pages 50 > data/spider.log 2>&1 &

# 看进度
tail -f data/spider.log

# 补详情页（简介/星级分布，800 本约 1 小时）
nohup python3 -u cli.py detail --limit 800 > data/detail.log 2>&1 &

# 导出网页数据
python3 cli.py export
```

进阶：防进程意外退出，可用 crontab 兜底自动续跑（数据库按豆瓣 id 去重，重复跑无副作用）：

```bash
crontab -e
# 每 30 分钟检查一次，没在跑就拉起
*/30 * * * * cd ~/wanjuan && pgrep -f "cli.py list" >/dev/null || nohup python3 -u cli.py list --tags 小说,文学,随笔,历史,科幻,推理,心理学,经济学,哲学,社会学,传记,艺术,数学,编程,文化,政治,法律,医学,教育,商业 --pages 50 >> data/spider.log 2>&1
```

## 3. 在服务器上看网页

```bash
python3 cli.py serve --port 8000
```

**安全提示**：这是个人工具，不建议对公网开放端口。两种私有访问方式：

- SSH 隧道（推荐）：本地执行 `ssh -L 8000:localhost:8000 ubuntu@<IP>`，然后浏览器开 `http://localhost:8000`
- 如确需公网访问，先在 Lighthouse 防火墙放行 8000 端口，并自行加 nginx basic auth

## 4. 数据回传到 Mac（可选）

```bash
# 在 Mac 上执行，把服务器上更大的数据库拉回来
scp ubuntu@<IP>:~/wanjuan/data/douban_books.json ~/WorkBuddy/2026-10-07-07-35-46/wanjuan/data/
cd ~/WorkBuddy/2026-10-07-07-35-46/wanjuan && python3 cli.py export
```

## 注意

- `run_spider.sh` 是 Mac 专用（内含 caffeinate），服务器上忽略它
- 服务器在国内访问豆瓣无需代理；Mac 本地抓到一半的数据已打进包里，两边数据可用 scp 互相同步（同名文件直接覆盖即可，两边都是「整库 JSON」）
- 抓取频率已锁 3~6 秒/请求；如触发 403 冷却会自动等待，不用管
