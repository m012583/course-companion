# 验证记录

## 已执行

- 在独立提交目录执行 `npm ci --no-audit --no-fund`，从锁文件安装 702 个包成功，未复制原目录 node_modules。
- 本机 Node.js v22.14.0。
- `npm run typecheck` 通过。
- `npm run lint:app` 通过。
- 未配置真实 AI 密钥，在 3010 端口启动成功，首页 HTTP 200。
- `npm run test:crud` 使用独立 Edge 无头浏览器和内存 API，全部通过，没有浏览器运行时错误。
- 验证范围：课程搜索与取消删除；章节新增、检索、改名和删除时分类同步；资料上传、正文搜索、改名和移除；对话新增、搜索、改名和删除；消息编辑删除；任务完整编辑、检索、删除、新增及完成；笔记新增、编辑、搜索和删除；概念增删改查；全局关联删除与新增；刷新保存；删除最后一门课程后重新添加；430 像素窄屏截图。
- 测试写请求被浏览器拦截并保存在内存中，未写入真实知识库。

## 尚未验证及已知限制

- 没有真实 AI 服务密钥，因此未将真实 AI 调用标为通过；演示中的回答明确标为演示文案。
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

运行前在另一个终端启动对应端口的应用。截图放在忽略的 `test-results` 目录；`tools/capture-demo.cjs` 用明确标注的演示数据生成截图，不访问真实学习数据。
