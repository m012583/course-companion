# 环境与数据

| 项目 | 要求/用途 |
| --- | --- |
| Node.js | >=22.13.0，本次验证使用本机版本，见测试记录 |
| npm | 使用 `npm ci` 按 package-lock.json 安装 |
| OPENAI_API_KEY | 可选，AI 服务密钥；仅放本地 `.env.local` |
| OPENAI_BASE_URL | 可选，接口根地址，代码追加 `/chat/completions` |
| OPENAI_MODEL | 请求没有显式传模型时的回退值；页面模型选择优先 |
| COURSE_KB_PORT | 启动端口，默认 3000；在启动进程环境中设置 |
| COURSE_KB_NO_BROWSER | 为 1 时不自动打开浏览器，适用于测试 |
| PLAYWRIGHT_MODULE | 回归测试使用的 playwright-core 模块路径，可不安装到项目依赖 |
| COURSE_KB_TEST_URL | 回归目标地址，默认 http://localhost:3000 |
| EDGE_PATH | 回归测试浏览器路径，Windows 默认使用系统 Edge |

数据库和上传文件由本地 Cloudflare 模拟器管理，位于忽略的 `.wrangler` 等运行目录。浏览器 localStorage 还保存当前来源地址下的工作区副本；更换端口会改变浏览器来源。

不要删除原使用目录中的运行数据。移动源码并不会迁移学习数据。页面可下载 JSON 备份，但当前版本没有图形化 JSON 导入入口；原始上传文件也应单独保留。

源码仓库只包含空值密钥模板和 DB/FILES 绑定名称。`.env.local`、`.dev.vars`、运行目录、数据库、上传文件、测试产物均被 Git 排除。

常见问题：端口占用时换端口；AI 不可用时检查密钥、接口根地址及页面选择的模型；扫描版 PDF 可能提取不到文字，需要先 OCR。首次启动依赖优化耗时较长时，可重试启动并查看终端输出。
