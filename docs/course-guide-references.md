# 课程导览：参考与取舍

实现日期：2026-09-26。未安装外部课程平台或新增运行时依赖。

## ClassBuild（主要参考，MIT）

- 仓库：https://github.com/jtangen/classbuild
- 大纲提示与响应解析：https://github.com/jtangen/classbuild/blob/main/src/prompts/syllabus.ts
- 课程结构：https://github.com/jtangen/classbuild/blob/main/src/types/course.ts
- 大纲预览和编辑：https://github.com/jtangen/classbuild/blob/main/src/pages/SyllabusPage.tsx
- 原许可证：[ClassBuild-LICENSE.txt](./ClassBuild-LICENSE.txt)

`lib/course-guide.ts` 适配其 `courseOverview → chapters → narrative / keyConcepts` 数据结构、按学习阶段与教材提示构建大纲的方式，以及 `parseSyllabusResponse` 对 JSON 围栏/外围文字的提取步骤。保留章节简介只描述范围、用途和关联，不展开完整讲义的设计。界面借鉴其先预览大纲、再逐章修改的流程，以现有 React / CSS 重写，未复制整页。

与上游不同：只生成短篇预习导览；用户主动点击才请求；每次至多一次模型请求，不自动重试；严格校验字段、章节数、重复标题和长度；API 密钥只留在服务端；不引入其研究、音频、图片和整套教材生成链路。不上线未经校验的部分流式 JSON，不以默认内容伪装生成成功。

## CourseForge（工作流参考，无代码复制）

- 仓库：https://github.com/Rohan10Gupta/CourseForge
- 已核对的实现：https://github.com/Rohan10Gupta/CourseForge/blob/main/sync/course_gen_main.py

参考其主题 → 大纲 → 模块摘要的层级，以及完成阶段结果后保存、避免重复生成的思想。本项目将简短目录和摘要合成一次调用，草稿确认后随现有 workspace JSON 保存；浏览、编辑、章节结构图不调用模型。不引入 Python、Pickle 或 Notion 发布。

## OpenMAIC（产品流程参考，无代码复制）

- https://github.com/THU-MAIC/OpenMAIC

参考其先确定/编辑大纲再生成内容的思路。当前仅提供课程—章节—知识点结构图，不导入互动课堂和多代理运行时。

## 数据边界

- 课程新增可选 `guide` 字段，旧知识库不需要迁移；原资料、笔记、手动章节、对话不被导览替换。
- 保存导览不创建笔记或复习任务；主动“整理为笔记”后，可选择加入今日复习。
- 教材名称仅用于提示方向，没有教材原文时始终标为待校准。原版未实现自动目录对比；研学增强版现提供目录与知识点覆盖检查，范围见 `enhanced-version.md`。
- 本地保存、课程回收站、完整 JSON 备份包含导览；展示结构图使用保存内容，无额外 AI 调用。

## 本次扩展：章节讲解和独立问答

沿用已有的层级结构，新增 `GuideChapter.lesson`，把大纲与短篇讲解分开保存。参考 CourseForge 分阶段保存的流程，本地实现每章一次请求、逐章校验保存、失败保留与跳过已有章节的补全；没有复制其生成器代码或引入额外服务。

讲解完整覆盖本章 `keyConcepts`，每项含解释、例子、易混点和追问。点击提问时，将相关讲解快照保存到独立 session 的 `learningContext`，只在发送问题时调用已有聊天 API；不会把对话写回导览，也不会将 AI 讲解伪装成带原文编号的资料证据。沿用现有 Markdown / KaTeX、workspace 保存和回收站。
