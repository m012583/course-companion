# 课伴 · 课程知识库

面向课程学习的本地知识管理应用：将课程资料、带来源的 AI 问答、知识笔记、概念图和复习任务放在同一工作区。

## 功能

- 课程与章节管理，资料上传、正文提取和搜索。
- PDF、DOCX、TXT、Markdown 阅读；问答根据检索到的片段展示引用。
- 笔记创建、编辑、删除、筛选及 Markdown 导出。
- 手动笔记关联、全局知识图谱、篇内概念图；AI 生成概念图为可选功能。
- 学习任务、到期复习、自评和后续复习日期安排。
- 本机副本和本地数据库自动保存；含附件的完整备份、恢复预览、历史快照；课程和笔记回收站。
- 分段阅读续接、选文提问及摘录、三档复习自评和历史记录、笔记关联建议。

完整操作范围见 [功能说明](CRUD功能说明.md)。这是单用户本地应用，不包含多用户登录和权限隔离，不应直接当作公共共享服务部署。

## 技术架构

| 层次 | 实现 |
| --- | --- |
| 页面 | React 19、TypeScript、CSS、Lucide 图标 |
| 开发与路由 | Vite 8、Vinext，App Router 风格页面与 API |
| 本地服务 | Cloudflare Vite 插件提供 Workers 运行环境 |
| 数据 | 本地模拟 D1 保存工作区，R2 保存上传文件；浏览器 localStorage 保留副本 |
| 文档处理 | pdfjs-dist、mammoth、Markdown 与 KaTeX |
| AI | 服务端调用兼容 Chat Completions 的接口；API 密钥不传给页面 |

资料经浏览器提取文本并上传原文件；工作区通过 `/api/workspace` 保存。问答由服务端检索片段后调用配置的模型。笔记及关联用于生成知识网络。数据库、上传文件和密钥不会随源码提交。

## 快速运行

需要 Node.js **22.13.0 或更新版本**、npm，首次安装依赖需要网络。Windows 上在项目根目录双击 `start.cmd`。macOS/Linux 运行 `sh start.sh`。

也可以手动执行：

```sh
npm ci
node tools/start-local.mjs
```

默认访问 `http://localhost:3000/`，保持启动进程运行。首次启动可能需要等待依赖预编译。未配置 AI 时，课程、资料、笔记、手动图谱和复习仍可使用。

### Windows 更换端口

```powershell
$env:COURSE_KB_PORT = '3010'
.\start.cmd
```

### AI 配置

启动脚本会在 `.env.local` 不存在时从 `.env.example` 创建它。填写自己的服务配置并重启：

```dotenv
OPENAI_API_KEY=填写你自己的密钥
OPENAI_BASE_URL=填写兼容服务的接口根地址
OPENAI_MODEL=填写服务支持的模型标识
```

页面“设置与备份”可直接输入服务支持的模型 ID，填写时优先于 `OPENAI_MODEL`；留空使用服务端配置。已有工作区会保留原来选择的模型，如需切回服务端配置请清空该输入。AI 调用费用由所配置的服务账户承担。

环境变量清单及数据位置见 [环境说明](docs/ENVIRONMENT.md)。

## 项目结构

```text
app/                主页面、样式和 API 路由
components/         全局图谱、篇内图谱及 UI 组件
lib/                检索、复习、图谱和存储逻辑
db/ migrations/     数据结构与迁移 SQL
public/             静态资源
tools/              本地启动及浏览器回归脚本
docs/               环境、测试、来源及提交说明
.openai/hosting.json 本地 DB/FILES 绑定名称，不含账号密钥
```

## 检查与测试

```sh
npm run typecheck
npm run lint
npm run test:domain
```

类型检查、全项目 lint、领域测试、浏览器增删改查及 `npm run build` 已通过。另有隔离环境的真实 D1/R2 备份、恢复、并发冲突与重启验证。详细重现步骤见 [测试记录](docs/TESTING.md)。

本轮改进及限制见 [改进验收](docs/IMPROVEMENTS.md)。自编 30 题的检索结果位于 `evaluation/`，不代表真实模型回答准确率；真实 AI 与用户试用仍待验证。

## 团队与开发来源

团队名称、成员、分工和联系方式：**待参赛团队提供后补充，不代表材料已齐全**。

本仓库从已有便携版源码导入，导入前没有随包提供 `.git` 历史；当前提交记录仅代表导入之后的实际整理与修改。项目使用第三方开源依赖，并在本次整理和功能修改中使用 AI 编程辅助。详见 [开发来源说明](docs/PROVENANCE.md)。

尚未由权利人选择整体开源许可证；依赖和第三方代码的授权以各自许可证为准。公开仓库不等同于授予任意再利用许可。
