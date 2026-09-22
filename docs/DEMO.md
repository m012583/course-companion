# 演示初稿

已生成仓库外的 `课伴-6分钟演示初稿.mp4`：时长 6 分钟，1920×1080，H.264 视频和 AAC 普通话合成配音。

这是八组真实应用页面截图的分段讲解，不是实时操作录像；画面持续标注“操作截图讲解初稿、合成配音、演示数据”。AI 回答为明确标注的演示文案，不代表真实接口已实测。

讲解顺序：项目介绍、课程章节、资料阅读、AI 问答边界、笔记和篇内图谱、全局图谱、任务复习、运行和验证状态。完整台词在 `demo-narration.json`。

正式提交前需由团队核对、补上姓名和分工，并补录真实 AI 服务操作及连续交互演示；是否接受合成配音须按比赛要求确认。

## 再生成

1. 按测试说明启动项目，设置 PLAYWRIGHT_MODULE 和 COURSE_KB_TEST_URL。
2. 运行 `node tools/capture-demo.cjs` 生成独立演示截图。
3. Windows PowerShell 使用 System.Speech 的 Microsoft Huihui Desktop 声音，将 JSON 中八段 text 分别输出为 `test-results/demo/1.wav` 至 `8.wav`。
4. Python 安装 imageio-ffmpeg 后运行 `py tools/build-demo-video.py`。脚本将各段配音适配到 42 秒并保留 3 秒画面停顿，得到总长 6 分钟的初稿。

生成目录和视频不进入源码 Git 历史；台词和生成工具保留，便于后续修改。
