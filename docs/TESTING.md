# 验证记录

日常使用体验改进及专项测试见 [体验改进](COMFORT_IMPROVEMENTS.md)。

最新真实模型结果：见 [DeepSeek 30 题评测](AI_EVALUATION.md)，30 次调用完成，存在已记录的语义与展示问题。

## 2026-09-23 改进版

类型检查、全项目 lint、领域测试和生产构建通过；构建仍有超过 500 kB 的分块提示。原有内存 API 增删改查测试通过；新增真实 D1/R2 和浏览器测试通过，实际重启后状态与附件保持一致。详见 [改进验收](IMPROVEMENTS.md)。下方导入版记录是历史结果，不代表当前仍有 19 项 lint 报错。

### 基础与检索验证

```sh
npm ci
npm run typecheck
npm run lint
npm run test:domain
npm run build
npm run eval:retrieval
```

检索报告默认写 evaluation/retrieval-report.json。原始对比基线保存在 evaluation/retrieval-baseline.json。真实模型可用后设置 COURSE_KB_EVAL_URL（及可选 COURSE_KB_EVAL_MODEL），运行 npm run eval:ai，并人工核对每条答案和引用语义；该命令会产生实际模型请求费用。不要仅凭引用编号统计“回答正确率”。

### 真实写入测试

先在独立目录安装并启动本地服务，例如 npm run dev -- --host 127.0.0.1 --port 3012 --strictPort。测试拒绝包含非测试课程 ID 的工作区，但仍须使用专用目录。

```powershell
$env:COURSE_KB_STORAGE_URL = 'http://localhost:3012'
$env:COURSE_KB_ALLOW_TEST_WRITES = 'isolated-test-workspace'
$env:PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'course-kb-check/node_modules/playwright-core'
npm run test:storage
npm run test:improvements
```

存储脚本验证附件、冲突、校验和恢复历史；浏览器脚本使用真实测试存储操作新功能。重启持久化另行检查：记录 GET /api/workspace，停止并在同一目录重启服务，再核对状态、revision 与 GET /api/files 附件字节。不能把浏览器 reload 称作服务重启。

真实用户试用按 [试用执行单](USER_TRIAL.md) 开展，目前没有参与者实测记录。

## 导入版历史记录



## 已执行

- 在独立提交目录执行 `npm ci --no-audit --no-fund`，从锁文件安装 702 个包成功，未复制原目录 node_modules。
- 本机 Node.js v22.14.0。
- 另用 `git clone --no-hardlinks` 克隆已提交版本到全新目录，重新 `npm ci` 和类型检查通过，并在 3011 端口启动验证。
- `npm run typecheck` 通过。
- `npm run lint:app` 通过。
- 未配置真实 AI 密钥，在 3010 端口启动成功，首页 HTTP 200。
- `npm run test:crud` 使用独立 Edge 无头浏览器和内存 API，全部通过，没有浏览器运行时错误。
- 验证范围：课程搜索与取消删除；章节新增、检索、改名和删除时分类同步；资料上传、正文搜索、改名和移除；对话新增、搜索、改名和删除；消息编辑删除；任务完整编辑、检索、删除、新增及完成；笔记新增、编辑、搜索和删除；概念增删改查；全局关联删除与新增；刷新保存；删除最后一门课程后重新添加；430 像素窄屏截图。
- 测试写请求被浏览器拦截并保存在内存中，未写入真实知识库。

## 尚未验证及已知限制

- 没有真实 AI 服务密钥，因此未将真实 AI 调用标为通过。
- 浏览器回归通过不代表对真实数据库并发和故障恢复做过完整测试。
- `npm run lint` 仍有导入时通用 UI 组件和 use-mobile Hook 的 19 条已知报错；定向应用检查没有关闭这些全局规则。
- 生产构建和远程网站部署不属于此次本地启动验收结果。
- 启动过程中 Miniflare 获取远程 Request.cf 元数据曾超时，随后使用默认值并正常启动。

## 重现浏览器回归

准备可启动的 Edge 和 playwright-core。可将测试工具安装在项目外，避免改变产品锁文件：

```powershell
npm install --prefix "$env:TEMP/course-kb-check" playwright-core --no-audit --no-fund
$env:PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'course-kb-check/node_modules/playwright-core'
$env:COURSE_KB_TEST_URL = 'http://localhost:3010'
npm run test:crud
```

运行前在另一个终端启动对应端口的应用。测试截图放在忽略的 `test-results` 目录，不访问真实学习数据。

## 2026-09-23 布局回归

新增 `npm run test:layout`，覆盖六种屏幕尺寸、可见区域缩小模拟、分栏拖动和键盘调整、默认正文、复习顺序和移动对话列表。使用模拟 API，不写用户数据。详见 [布局验收](LAYOUT_IMPROVEMENTS.md)。真机软键盘和真实用户试用仍待完成。

## 2026-09-24 数据保护与 OCR

新增 test:ocr（脚本自建图片与扫描 PDF）、test:protection（隔离真实库）、test:scale（模拟大数据）和 eval:reliability（显式开启真实 AI）。详见 RELIABILITY_IMPROVEMENTS.md，保留检索失败 R04。
