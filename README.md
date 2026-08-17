# eddiekong.com

个人站的源码仓库，GitHub Pages 托管，绑定域名 `eddiekong.com`。

目前站上的内容是**贝灵顿梗介绍**——占位主题。版式（导航 / hero / 数据条 / 编号分节 / 媒体区 / 页脚）就是将来自我介绍页要用的骨架，换内容时只改文字，不用重做布局。

**零构建依赖**：不需要 Node、不需要 Ruby、不需要装任何 pip 包。仓库里是什么，浏览器跑的就是什么。

---

## 本地预览

```powershell
python -m http.server 8000
```

然后打开 <http://localhost:8000>。

Service Worker 在 `localhost` 上不注册（见 `assets/site.js` 的 `initServiceWorker`），所以本地改完刷新一定看到最新文件，不会被缓存骗。

## 目录结构

```
index.html              首页：指南正文 + 视频 + 地图 + 联系方式
gallery.html            相册（读 data/photos.json，带灯箱）
numbers.html            品种数据：手写 SVG 图表 + 表格 + 出处
search.html             站内搜索（纯前端，读 data/search-index.json）
404.html                GitHub Pages 自定义 404
blog/                   文章：index.html 列表 + 每篇一个 HTML

assets/site.css         全站样式（含深浅色 token、打印样式）
assets/site.js          全站行为（主题、嵌入、灯箱、图表、搜索、API、SW）

data/bedlington.json    品种数据，同时开放给访客下载
data/photos.json        相册清单
data/posts.json         文章清单
data/search-index.json  搜索索引（生成物，勿手改）

tools/gen.py            生成 + 校验脚本（纯标准库）
sitemap.xml feed.xml    生成物，勿手改
robots.txt site.webmanifest sw.js .nojekyll
dog.jpg CNAME
```

`.nojekyll` 让 GitHub Pages 跳过 Jekyll 处理，发布更快也更可预测。

## 改完内容后必须跑一次

```powershell
python tools/gen.py
```

它会重新生成三个派生文件：`sitemap.xml`、`feed.xml`、`data/search-index.json`，并顺带检查站内死链和 JSON 合法性。

CI（`.github/workflows/site-checks.yml`）每次 push 会跑 `python tools/gen.py --check`；**忘了跑就会红**，这是故意的——防止搜索索引和页面内容悄悄对不上。

## 怎么加内容

| 想加什么 | 怎么做 |
|---|---|
| 一张照片 | 图片文件丢进仓库 → 在 `data/photos.json` 的 `photos` 里加一条 |
| 一篇文章 | 写 `blog/<slug>.html`（照抄现有那两篇的结构）→ 在 `data/posts.json` 的 `posts` 顶部加一条 |
| 一个数字 | 改 `data/bedlington.json`，图表和表格会自动跟着变 |
| 一个新页面 | 复制 `numbers.html` 当模板，改导航里的 `aria-current` |

改完都要跑一次 `python tools/gen.py`。

因为没有模板引擎，导航栏和 `<head>` 是每个页面各存一份的——这是"零构建"的代价。改导航要逐个文件改。

## 视频 / 地图为什么要点一下才出来

首页的 YouTube、B 站、OpenStreetMap 都是**点击后才加载**：默认只渲染一个封面按钮，点了才把 iframe 插进去。

好处有三个：打开页面不给第三方送任何请求和追踪数据；国内访客不用干等一个加载不出来的 YouTube；首屏更快。

也因此，**打开任意页面时本站不发起任何外部请求**。唯一的例外是滚到页脚时会向 `api.github.com` 发一次匿名请求取"最后更新时间"，失败就静默显示兜底文本。

## 三个默认关闭的第三方服务

代码都写好了，注释掉的，填个 ID 取消注释就能用。

**评论（giscus）** —— 在 `blog/*.html` 底部

1. 仓库 Settings → General → Features 勾上 Discussions
2. 打开 <https://giscus.app>，填入 `Eddie-Kong/Eddie-Kong.github.io`，它会生成一段带 `data-repo-id` 和 `data-category-id` 的代码
3. 把两个 `REPLACE_ME` 换成生成的值，取消注释

**联系表单（Formspree）** —— 在 `index.html` 第 07 节

1. 在 <https://formspree.io> 建一个 form，拿到 form ID
2. 把 `YOURFORMID` 换掉
3. 取消注释

**访问统计（GoatCounter）** —— 在 `index.html` 的 `<head>`

1. 在 <https://www.goatcounter.com> 注册一个 site code
2. 把 `YOURCODE` 换掉
3. 取消注释，并复制到其他页面的 `<head>`

三个都不开也完全能用。

## 离线缓存

`sw.js` 让站点能装到手机主屏、断网也能看。

**改了 `PRECACHE` 列表里的文件，就要把 `sw.js` 顶部的 `CACHE_VERSION` 加一**（`v1` → `v2`），否则老访客会一直拿到旧版本。

## 这个站做不到的事

纯静态站没有后端，以下需求都得另外挂服务（Cloudflare Workers / Vercel Functions 之类）：

- 登录、鉴权、用户系统
- 往数据库写东西
- 服务端渲染
- 收款
- 自己发邮件
- **任何私密内容**——仓库是 public，文件即使没有任何链接指向也能被访问到

## 额度

站点 ≤ 1 GB，单文件 ≤ 100 MB，带宽软上限 100 GB/月，每小时 10 次构建。
