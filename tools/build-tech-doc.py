"""Build the reviewable technical report; requires ReportLab and a CJK TTF font."""
from pathlib import Path
import os
import json
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

root = Path(__file__).resolve().parents[1]
font = Path(os.environ.get('COURSE_KB_DOC_FONT', 'C:/Windows/Fonts/msyh.ttc'))
if not font.is_file():
    raise SystemExit('Set COURSE_KB_DOC_FONT to a Chinese TrueType font path.')
pdfmetrics.registerFont(TTFont('CJK', str(font)))
out = root / 'output/pdf/course-companion-0.4-technical.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
pkg = json.loads((root/'package.json').read_text(encoding='utf-8'))
benchmark = json.loads((root/'docs/evaluation/learning-retrieval-v1.json').read_text(encoding='utf-8'))
ui = json.loads((root/'docs/evaluation/learning-ui-v1.json').read_text(encoding='utf-8'))
audit = json.loads((root/'docs/evaluation/dependency-audit-0.4.json').read_text(encoding='utf-8-sig'))['metadata']['vulnerabilities']
green = colors.HexColor('#38523f')
ink = colors.HexColor('#303c35')
body = ParagraphStyle('body', fontName='CJK', fontSize=10.5, leading=18, textColor=ink, spaceAfter=11, wordWrap='CJK')
heading = ParagraphStyle('heading', parent=body, fontSize=20, leading=28, textColor=green, spaceAfter=20)
sub = ParagraphStyle('sub', parent=body, fontSize=12.5, leading=21, textColor=green, spaceBefore=10, spaceAfter=8)
small = ParagraphStyle('small', parent=body, fontSize=9, leading=15)
table_text = ParagraphStyle('table', parent=small, spaceAfter=0)
story = []
def p(text, style=body):
    story.append(Paragraph(escape(text).replace('\n','<br/>'), style))
def h(text): p(text, sub)
def page(title):
    if story: story.append(PageBreak())
    p(title, heading)
def table(rows, widths):
    data = [[Paragraph(escape(str(c)), table_text) for c in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eaf0e6')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.7,green),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#e4e5db')),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]))
    story.extend([t,Spacer(1,12)])

page('课伴 · 研学增强版\n技术文档 0.4')
p('基于指定教材、依据可追溯、从练习反馈安排下一步的课程学习 Web 应用。')
p('文档日期：2026-10-08\n版本：'+pkg['version']+'\n代码仓库：https://github.com/m012583/course-companion', small)
h('项目概述')
p('面向大学课程学习中资料分散、读后难以检查理解、错题与教材脱节的问题，课伴将课程导览、教材阅读、引用问答、笔记、练习和复习组织在一个本地工作区。0.4 在增强版基础上改善连续学习流程和界面层级。')
h('目标用户与使用场景')
p('学生选择课程章节，查看教材依据，核对 AI 生成的题目并作答。系统依据实际作答和用户记录的错因提供下一步建议；学生确认后保存复习安排，并能从计划回到原题和教材。')
table([['团队信息','当前状态'],['团队名称','待补充'],['成员姓名与分工','待补充，提交前填写真实信息'],['仓库账号','m012583；不代替成员真实姓名']], [135,355])
p('文档区分已实现功能、自动化验证与待完成的真实评测。当前未配置 AI 密钥，本轮没有真实模型准确率、学习效果或用户满意度结论。', small)

page('01 需求分析与交互结构')
table([['用户需求','设计与验收方式'],['快速找到下一步','首页显示继续阅读、待核对题目和待巩固错题；按实际记录展示'],['阅读时核对 AI 依据','原文引用保留历史片段；能定位时进入当前教材段落'],['避免工具间反复切换','快速自测直接形成题库草稿，核对后进入练习，结果页连接复习'],['保护长期学习数据','题目版本与作答快照独立；完整备份、冲突保护和本机恢复点'],['手机可操作','压缩顶部说明、折叠资料管理、教材与问答切换；仍需实体手机验证']], [120,370])
h('导航设计')
p('全局：今日学习、我的课程、全部笔记、复习计划。知识图谱保留在学习工具中；设置与备份位于侧栏底部。课程内部：学习概览、教材阅读、AI 问答、练习与错题。')
p('教材校准与阅读相邻；检索评测移入设置，避免与日常练习混淆。课程删除位于“更多”菜单，继续显示明确文字、确认过程和回收站恢复。')
h('任务反馈')
p('出题显示实际处理阶段并支持停止。保存有同步状态；生成失败不会伪造完整结果。题目核对、错误原因和计划预览由用户确认，减少错误内容直接进入复习的机会。')

page('02 系统架构与数据流')
table([['层次','实现与职责'],['Web 界面','React '+pkg['dependencies']['react']+'、TypeScript、Tailwind；课程导航、阅读工作区、练习和复习组件'],['应用与接口','vinext '+pkg['dependencies']['vinext']+' / Vite；TypeScript API 路由、SSE 状态与流式问答'],['知识处理','PDF.js、Mammoth、Tesseract.js；分段、页码、文本校正、BM25 与有限词表'],['AI 服务接入','服务端读取环境变量，调用兼容接口；出题结果检查字段、选项和引用编号'],['本地存储','D1/R2 本机模拟；工作区、版本号、附件、恢复点；本地运行不需要 Cloudflare 账号']], [110,380])
h('主要数据流')
p('教材导入 → 提取或 OCR → 文字校正 → 章节与依据选择 → AI 生成草稿 → 人工核对 → 练习快照 → 错因建议 → 复习预览与保存。')
h('模块与状态')
p('新增 learning-flow、material-reader、learning-next 组件，将连续练习、阅读和下一步入口拆出主页面。工作区类型集中于 lib/workspace-types.ts；学习流程数据与规则在 lib/learning-flow.ts。页面仍保留部分状态协调，后续可继续按业务边界拆分。')
p('新字段均为可选项：course.reading 保存阅读位置，studyLab.flow 保存当前章节与生成记录，ReviewTask.questionId 关联练习。旧版数据可继续读取，备份附件编号重映射覆盖阅读位置。')

page('03 AI 技术方案与优化策略')
h('选型理由')
p('现阶段采用服务端兼容大模型接口，便于替换供应商；检索沿用 BM25、有限别名和可选查询改写，便于本机运行与检查依据。没有将未接入的向量数据库、多 Agent 或 MCP 描述为已实现技术。')
h('集成方式')
p('章节知识点及选定教材决定出题范围。服务端检索候选片段后，将术语与原文作为数据交给模型；模型只能返回约定的两道单选题结构。程序检查字段长度、选项唯一性、答案索引和引用编号。单知识点的同类练习允许从不同角度出题。')
p('SSE 按执行阶段发送“查找教材依据、生成练习草稿、检查格式与引用编号”，不展示虚构进度。请求有超时与取消信号；生成期间教材变化时拒绝保存旧结果。格式与引用编号检查不等同于语义正确性认证，因此仍需人工核对。')
h('可控性与隐私')
p('原文与用户输入视为不可信数据，不作为工具指令。密钥只存本机服务端配置，不进入公开仓库或课程备份。OCR 在本机运行；使用外部 AI 时，相关问题和选定资料片段会发送至所配置服务。')
h('优化决策')
p('固定题集对照未显示现检索相对旧检索的覆盖优势，因此本轮优先改进学习流程和证据使用，不增加未经验证的检索依赖。后续可用同一题集及真实教材比较语义检索，并同时记录延迟与费用。')

page('04 核心功能实现与数据保护')
table([['功能','关键实现'],['核对到练习','生成记录与题库草稿一次保存；重复导入按来源编号去重；不复活已删除题目'],['历史作答','记录题目版本、题目深复制、所选答案、正确性和证据；改题不覆盖历史'],['错因建议','依据用户记录的概念、计算、审题或记忆原因给出规则建议；不冒充 AI 诊断'],['关联复习','答错默认今天回看、两天后重练；答对四天后重练；可调整日期；使用稳定计划 ID 避免重复'],['教材阅读','保存段落位置；文字选段提问或记笔记；桌面并排问答，手机切换保留状态'],['引用回读','保留历史引用并检查当前资料状态；能定位时跳转当前段落，PDF 按页打开']], [115,375])
h('保存与恢复')
p('工作区写入使用 revision 冲突检查；恢复点与工作区更新在事务内执行。题目软删除、课程回收站、草稿恢复和含附件迁移包继续保留。恢复点与当前数据位于同一电脑，不能代替外部备份。')
p('新版本备份仍使用 course-kb-bundle 第 2 版格式；校验附件摘要并重映射文件编号。升级前保存源码、Git bundle 和学习数据；回退使用旧源码与更新前备份，不将删除数据目录作为修复步骤。')

page('05 测试与评测证据')
p('自动化测试：76 项通过，涵盖领域规则、API、迁移、事务、恢复点及新增连续学习逻辑。浏览器完成 '+str(len(ui['checkpoints']))+' 个关键场景，详见 docs/evaluation/learning-ui-v1.json。', body)
table([['验证类别','已执行范围与边界'],['界面流程','题目核对、错因、复习保存与题目直达、阅读刷新恢复、选段草稿、重复作答、删除恢复'],['响应式','无头 Edge，桌面与 768/390 像素模拟视口；不是实体手机或软键盘测试'],['固定评测','80 道自编题与人工参考答案；36 道已有调试题和 44 道新增冻结题；非第三方盲测'],['有依据问题','新增 32 题，两种检索均在前五条找齐预期片段；只衡量检索覆盖'],['无依据问题','12 题中两种检索均有 8 题返回空；相关背景命中不等于答案有据，空结果率不等于拒答率'],['真实模型','本轮未运行。脚本提供人工评审字段，没有密钥时拒绝调用，不产生虚构准确率']], [115,375])
p('题集 SHA256：'+benchmark['corpusSha256'], small)
h('依赖审计')
p(f'官方审计由 29 项降至 {audit["total"]} 项：critical {audit["critical"]}、high {audit["high"]}、moderate {audit["moderate"]}、low {audit["low"]}。剩余为依赖链中的已知问题，尚未全部修复；不能据生产构建成功认定公网安全。')

page('06 安装运行与交付')
h('安装')
p('环境：Node.js 22.13.0 或以上及 npm。首次安装需要网络。Windows 可双击 start.cmd；也可执行：\n\ngit clone https://github.com/m012583/course-companion.git\ncd course-companion\nnpm ci\nnpm run start:local')
p('启动器按锁文件准备依赖和本地 OCR 资源，默认仅监听本机。地址和端口以启动器输出为准；不要把本机 localhost 地址作为公网评审地址。')
h('AI 配置与验证')
p('将 .env.example 复制为 .env.local，填入服务地址、实际支持的模型和自己的密钥，再重启。没有 AI 配置时可以阅读原创示例、手工记笔记和练习。配置模板、依赖版本及端口变量见 docs/ENVIRONMENT.md。')
p('常规检查：npm test；npm run typecheck；npm run lint；npm run build。\n检索评测：npm run evaluate:learning。\n真实模型：配置本机 COURSE_KB_EVAL_URL 后，执行 node tools/evaluate-learning.mjs --ai --limit=5。全量需显式指定 --limit=80，调用费用由实际服务计费。')
h('源码与开发记录')
p('代码、环境模板、锁文件、测试与评测记录均随仓库保留。开发历史在已有真实提交后继续追加，不改写作者或日期，不伪造未知的早期历史。演示视频作为比赛单独材料，不放入代码仓库。')
h('公网部署边界')
p('在线演示属于单独待评估项，需要访问控制、数据隔离、调用额度限制与剩余依赖风险处置。本轮交付的是已验证本机运行的 Web 应用。')

page('07 创新点、限制与下一步')
h('应用与交互设计')
p('围绕指定教材，将来源、练习、错因和复习关联起来，让学生从“看到答案”继续走向“解释依据并再次练习”。阅读工作区保留位置，引用回读减少页面切换。创新主张应以具体实现与试用证据支撑，不将常见 RAG 或间隔复习本身描述为独创算法。')
h('工程特点')
p('保留题目版本与历史作答证据，教材变化后提醒复核；以草稿核对和复习预览约束生成结果；数据写入、恢复点及附件迁移共同保护长期学习记录。')
h('已知限制与后续顺序')
p('第一，真实模型答案、引用支持性与费用仍待评测。第二，实体手机、第二台电脑和 3-5 位同学试用尚未完成，任务卡已准备。第三，复杂公式和低清扫描识别、主观题评分、PDF 精确字框高亮尚不具备完整验证。第四，剩余依赖问题与公网隔离需要专门处理。')
p('下一步先完成真实模型与用户试用，再依据证据决定语义检索、数学分步提示或间隔算法的升级。没有足够数据时不报告课程掌握率或学习效果提升。')
h('参考与原创边界')
p('赛事要求：https://www.boxuegu.com/matchTrack/detail/?id=10037\n交互研究：github.com/helixnow/deep-student\n学习流程研究：github.com/HKUDS/DeepTutor\n引用与检索研究：github.com/kavindamihiran/AI-Study-Assistant\n主动回忆与复习：github.com/ankitects/anki-manual', small)
p('上述仓库用于分析交互与技术思路。本轮没有导入其代码；不能以替换名称、包装他人开源项目的方式参赛。团队信息须在提交前补充，真实试用结果须由实际参与者产生。', small)

def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(colors.HexColor('#e4e5db')); canvas.line(52,49,A4[0]-52,49)
    canvas.setFont('CJK',8); canvas.setFillColor(colors.HexColor('#727a70'))
    canvas.drawString(52,34,'课伴 · 研学增强版 0.4 | 技术文档 | 2026-10-08')
    canvas.drawRightString(A4[0]-52,34,str(doc.page)); canvas.restoreState()
doc = SimpleDocTemplate(str(out), pagesize=A4, rightMargin=52,leftMargin=52,topMargin=48,bottomMargin=65,title='课伴研学增强版 0.4 技术文档',author='课伴项目；团队信息待补充')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
