# 环境配置与依赖清单

## 环境

Node.js >=22.13.0、npm，首次安装需要网络。本次在 Windows 上测试。运行 `npm ci` 按 `package-lock.json` 安装，不使用未锁定的随意升级来替代复现。

`.env.example` 是可提交的空白模板；`.env.local` 保存本机配置并被 Git 忽略。启动器会在缺少 `.env.local` 时从模板创建它。修改 AI 配置后重启服务。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 仅调用 AI 时 | 自有服务密钥；空值时仍能浏览资料、手工记笔记和练习 |
| `OPENAI_BASE_URL` | 调用 AI 时 | 兼容服务地址；示例模板沿用 `https://api.deepseek.com`，可替换 |
| `OPENAI_MODEL` | 调用 AI 时 | 服务实际支持的模型名；模板示例不保证所有账号都可使用 |
| `OPENAI_SUPPORTS_VISION` | 否 | 兼容服务支持图片时显式设置 `true`；不影响本地 OCR |
| `COURSE_KB_PORT` | 否 | 启动器端口，默认 3002；设置后占用会报错。应在启动脚本的进程环境中设置 |
| `COURSE_KB_NO_BROWSER` | 否 | 设为 `1` 不自动打开浏览器，适合测试；在进程环境中设置 |

PowerShell 指定端口示例：

```powershell
$env:COURSE_KB_PORT = '3005'
npm.cmd run start:local
```

## 依赖

完整直接依赖及开发依赖在根目录 `package.json`，全部解析版本与校验在 `package-lock.json`。主要用途如下：

| 类别 | 依赖 |
| --- | --- |
| 页面与交互 | react、react-dom、TypeScript、Tailwind CSS、Base UI、Lucide |
| 路由与构建 | vinext、Vite、Cloudflare Vite 插件、Wrangler |
| 数据表 | drizzle-orm；本地 D1/R2 由运行时提供 |
| Markdown 与公式 | react-markdown、remark-gfm、remark-math、rehype-katex、katex |
| 文档提取 | pdfjs-dist、mammoth |
| 本机识别 | tesseract.js、@tesseract.js-data/chi_sim、@tesseract.js-data/eng |
| 规范与验证 | oxlint、oxfmt、Node 内置测试、playwright-core |

`tools/prepare-ocr.mjs` 将安装包中的 OCR worker、WASM 与语言文件复制到 `public/ocr/`。该生成目录不入 Git；`start:local`、`dev` 和 `build` 会准备它。识别时不将文档图像上传给 OCR 服务。

浏览器自动检查默认使用本机安装的 Microsoft Edge，并访问独立测试端口 3022；需要隔离数据目录，不能将测试脚本直接指向日常学习工作区。

## 数据目录

- `.wrangler/`：本机数据库、附件与运行状态，不能公开提交。
- `work/`：启动记录、依赖指纹和测试输出，不入 Git。
- `dist/`、`.vinext/`、`public/ocr/`：可重新生成的构建资源，不入 Git。
- `docs/evaluation/`：经整理的自编测试与验收记录，可随源码评审。

本机运行不要求 Cloudflare 账号或公网部署。生产构建通过只代表能够打包，不代表已经完成公网安全验收。

## 0.4 验证环境

`COURSE_KB_TEST_URL` 供 `tools/verify-learning-flow.mjs` 使用，必须指向当前测试 checkout 对应的本机实例。脚本创建专用测试课程并清理自身数据，不要在日常工作区运行。

`COURSE_KB_EVAL_URL` 供真实 AI 评测使用，只接受 localhost/127.0.0.1 的 HTTP 地址。默认 `--ai` 只运行 5 题；全量需显式指定 `--limit=80`，将产生实际服务调用。没有密钥时不运行。

PDF 构建是可选文档工具，需要 Python、ReportLab、中文 TrueType 字体；不属于软件日常运行依赖。执行 `py -3 tools/build-tech-doc.py`，输出到 `output/pdf/`。


## 0.5 本机 AI 设置

推荐通过 `npm run start:local` 启动，再在界面选择 AI 服务、输入实际模型 ID 和密钥。界面配置加密保存于独立的 `local_ai_config` 表，优先于环境文件；清除界面配置可恢复环境文件配置。

`COURSE_KB_AI_SECRET` 是启动器自动生成的本机加密密钥，保存在忽略的 `.env.local`，不要提交或分享。保留原文件即可跨重启解密；学习迁移包不包含此密钥或 AI 配置，换电脑后重新配置 AI。直接用 `npm run dev` 且未通过启动器初始化时，可继续使用环境文件方式；要使用界面加密保存，请改用 `start:local`。配置写入只接受同源、本机请求，不作为公网管理接口。

界面“测试已保存的连接”只请求一句问候，不发送课程资料；真实服务会产生一次少量调用。复述核对会发送所选片段与已保存的复述，结果仍需人工核对。

新增 `tools/verify-experience.mjs` 与旧验证脚本共用 `COURSE_KB_TEST_URL`。它要求未配置真实 AI 的独立 checkout，用本机临时模拟服务测试加密配置和复述接口，不应指向个人日常工作区。依赖清单没有新增运行时包。
