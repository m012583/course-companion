'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  FlaskConical,
  LoaderCircle,
  Search,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import type { CourseGuide, GuideChapter } from '@/lib/course-guide';
import { retrieve, type Evidence, type Material } from '@/lib/knowledge';
import {
  calibrate,
  extractHeadings,
  materialId,
  contentFingerprint,
  type CalibrationConfig,
} from '@/lib/textbook-calibration';
import { rankEvidence } from '@/lib/retrieval';
import { demoCheck, demoMaterial, RETRIEVAL_FIXTURES } from '@/lib/demo-course';
import {
  checkResult,
  planFromCheck,
  type LearningCheck,
} from '@/lib/learning-check';
import type { ReviewPlan } from '@/lib/review-plans';
import LearningMarkdown from './learning-markdown';
import PracticePanel from './practice-panel';
import type { PracticeState } from '@/lib/practice';

export type StudyLabState = {
  calibration?: CalibrationConfig;
  checks?: LearningCheck[];
  practice?: PracticeState;
};
type LabCourse = {
  id: string;
  name: string;
  materials: Material[];
  guide?: CourseGuide;
  studyLab?: StudyLabState;
};
export default function StudyLab({
  course,
  model,
  onChange,
  onSource,
  onChapter,
  onAddChapter,
  onPlan,
  onAsk,
  onPracticePlan,
  disabled = false,
}: {
  course: LabCourse;
  model: string;
  onChange: (state: StudyLabState) => void;
  onSource: (source: Evidence) => void;
  onChapter: (id: string) => void;
  onAddChapter: (chapter: GuideChapter) => void;
  onPlan: (plan: ReviewPlan, check: LearningCheck) => void;
  onAsk: (chapter: GuideChapter, term: string, question: string) => void;
  onPracticePlan: (plan: ReviewPlan, state: StudyLabState) => void;
  disabled?: boolean;
}) {
  const readable = course.materials.filter(
    (m) => !m.deletedAt && (m.content || m.passages?.length),
  );
  const [tab, setTab] = useState<
    'calibration' | 'check' | 'practice' | 'benchmark'
  >('calibration');
  const [keys, setKeys] = useState(
    course.studyLab?.calibration?.materialKeys ?? readable.map(materialId),
  );
  const [toc, setToc] = useState(
    course.studyLab?.calibration?.toc ?? extractHeadings(readable).join('\n'),
  );
  const selected = readable.filter((m) => keys.includes(materialId(m)));
  const report = course.guide ? calibrate(course.guide, selected, toc) : null;
  const checks = course.studyLab?.checks ?? [];
  const [activeId, setActiveId] = useState(
    checks.find((c) => !c.deletedAt)?.id ?? '',
  );
  const active = checks.find((c) => c.id === activeId && !c.deletedAt);
  const [answers, setAnswers] = useState<number[]>([-1, -1]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [planDraft, setPlanDraft] = useState<ReviewPlan | null>(null);
  const [query, setQuery] = useState('先做一个变换再做另一个');
  const [comparison, setComparison] = useState<{
    baseline: Evidence[];
    enhanced: Evidence[];
  } | null>(null);
  const [bench, setBench] = useState<ReturnType<typeof runBench> | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (disabled) abort.current?.abort();
  }, [disabled]);
  const sources = (items: Evidence[]) => (
    <div className="source-chips">
      {items.map((e) => (
        <button key={`${e.id}-${e.section}`} onClick={() => onSource(e)}>
          [{e.id}] {e.name} · {e.page ? `第 ${e.page} 页` : e.section}
        </button>
      ))}
    </div>
  );
  function saveCheck(check: LearningCheck) {
    onChange({
      ...course.studyLab,
      checks: [check, ...checks.filter((c) => c.id !== check.id)],
    });
    setActiveId(check.id);
    setAnswers(check.answers ?? [-1, -1]);
    setPlanDraft(null);
    setError('');
  }
  async function generate() {
    if (abort.current || disabled) return;
    const terms = [
      ...new Set(course.guide?.chapters.flatMap((c) => c.keyConcepts) ?? []),
    ].slice(0, 6);
    if (terms.length < 2 || !selected.length) {
      setError('请先准备至少两个知识点，并在教材校准中选择可读取的资料。');
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/learning-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ terms, materials: selected, model }),
      });
      const data = (await response.json()) as {
        check?: LearningCheck;
        error?: string;
      };
      if (!response.ok || !data.check)
        throw new Error(data.error || '出题失败。');
      if (!controller.signal.aborted) saveCheck(data.check);
    } catch (issue) {
      setError(
        controller.signal.aborted
          ? '已停止出题，原自测保留。'
          : issue instanceof Error
            ? issue.message
            : '出题失败。',
      );
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }
  function runBench() {
    const material = demoMaterial();
    return RETRIEVAL_FIXTURES.map((test) => ({
      ...test,
      baseline: retrieve(test.query, [material])[0]?.section ?? '未命中',
      enhanced:
        rankEvidence(test.query, [material], [], 1)[0]?.section ?? '未命中',
    }));
  }
  const result = active?.answers ? checkResult(active, active.answers) : null;
  return (
    <section className="study-lab">
      <header className="lab-intro">
        <span className="eyebrow">让学习回到你的教材</span>
        <h2>有依据地读，再检查自己是否理解</h2>
        <p>先对照课程，再做两道自测，最后把需要巩固的内容安排进复习。</p>
      </header>
      <nav className="lab-tabs" aria-label="研学工具">
        <button
          className={tab === 'calibration' ? 'active' : ''}
          onClick={() => setTab('calibration')}
        >
          <BookOpen size={16} />
          教材校准
        </button>
        <button
          className={tab === 'check' ? 'active' : ''}
          onClick={() => setTab('check')}
        >
          <Check size={16} />
          两题自测
        </button>
        <button
          className={tab === 'benchmark' ? 'active' : ''}
          onClick={() => setTab('benchmark')}
        >
          <FlaskConical size={16} />
          检索验证
        </button>
        <button
          className={tab === 'practice' ? 'active' : ''}
          onClick={() => setTab('practice')}
        >
          题库与错题
        </button>
      </nav>
      {tab === 'practice' && (
        <PracticePanel
          course={course}
          state={course.studyLab?.practice}
          checks={checks}
          disabled={disabled}
          onSource={onSource}
          onChange={(practice) => onChange({ ...course.studyLab, practice })}
          onPlan={(plan, practice) =>
            onPracticePlan(plan, { ...course.studyLab, practice })
          }
        />
      )}
      {tab === 'calibration' && (
        <>
          <div className="lab-columns">
            <section className="panel">
              <h3>1. 选择本课教材</h3>
              <p className="muted">
                勾选的资料用于校准、章节讲解和自测；这些选择保存后生效。
              </p>
              {!readable.length && (
                <p className="notice">
                  请在“资料”上传 PDF、DOCX 或文本。扫描 PDF 需要先提取文字。
                </p>
              )}
              {readable.map((m) => (
                <label className="lab-checkline" key={materialId(m)}>
                  <input
                    type="checkbox"
                    checked={keys.includes(materialId(m))}
                    onChange={(e) =>
                      setKeys(
                        e.target.checked
                          ? [...keys, materialId(m)]
                          : keys.filter((k) => k !== materialId(m)),
                      )
                    }
                  />
                  {m.name}
                </label>
              ))}
              <h3>2. 核对真实目录</h3>
              <p className="muted">
                自动提取只识别文字标题，请核对或粘贴教材目录，每行一项。
              </p>
              <textarea
                aria-label="教材真实目录"
                rows={7}
                maxLength={6000}
                value={toc}
                onChange={(e) => setToc(e.target.value)}
              />
              <div className="actions">
                <button
                  onClick={() => {
                    setToc(extractHeadings(selected).join('\n'));
                    setMessage('已提取候选标题，请核对后保存。');
                  }}
                >
                  重新提取标题
                </button>
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={() => {
                    onChange({
                      ...course.studyLab,
                      calibration: {
                        ...course.studyLab?.calibration,
                        materialKeys: keys,
                        toc,
                        updatedAt: new Date().toISOString(),
                      },
                    });
                    setMessage('教材选择与目录已保存。');
                  }}
                >
                  保存校准设置
                </button>
              </div>
            </section>
            <section className="panel">
              <h3>3. 查看差异</h3>
              {report ? (
                <>
                  <div className="lab-stat">
                    <strong>
                      {report.found}
                      <small> / {report.rows.length}</small>
                    </strong>
                    <span>知识点找到直接文字依据</span>
                  </div>
                  <p className="muted">
                    这是文字覆盖检查，不代表内容正确或已掌握。“暂未找到”也不等于教材没有讲。
                  </p>
                  {report.partial && (
                    <p className="notice">
                      所选资料存在提取不完整、空白页或未知覆盖范围，结果仅针对已提取部分。
                    </p>
                  )}
                  <h4>目录中待核对的条目</h4>
                  {!report.unmatchedHeadings.length ? (
                    <p className="muted">
                      当前目录没有明显未对应项；仍需人工核对。
                    </p>
                  ) : (
                    report.unmatchedHeadings.map((heading) => (
                      <div className="lab-heading-row" key={heading}>
                        <span>{heading}</span>
                        <button
                          disabled={
                            disabled || course.guide!.chapters.length >= 16
                          }
                          onClick={() =>
                            onAddChapter({
                              id: crypto.randomUUID(),
                              title: heading.slice(0, 60),
                              narrative:
                                '从教材目录加入，知识点与讲解待核对补充。',
                              keyConcepts: [heading.slice(0, 60)],
                              prerequisites: [],
                              learningGoals: ['核对并理解本节的主要知识点'],
                            })
                          }
                        >
                          加入待补充章节
                        </button>
                      </div>
                    ))
                  )}
                  {!toc.trim() && (
                    <p className="notice">
                      尚未提供真实目录，暂不判断目录缺失。
                    </p>
                  )}
                </>
              ) : (
                <p>请先建立课程导览。</p>
              )}
            </section>
          </div>
          {!!report?.rows.length && (
            <section className="panel">
              <h3>逐个知识点核对</h3>
              <div className="calibration-list">
                {report.rows.map((row) => (
                  <article key={`${row.chapterId}-${row.term}`}>
                    <div>
                      <button
                        className="text-button"
                        onClick={() => onChapter(row.chapterId)}
                      >
                        {row.chapterTitle}
                      </button>
                      <h4>{row.term}</h4>
                      <span className={`lab-badge ${row.status}`}>
                        {row.status === 'found'
                          ? '找到原文'
                          : row.status === 'possible'
                            ? '可能对应 · 需核对'
                            : '暂未找到依据'}
                      </span>
                    </div>
                    <div>
                      {row.evidence.length ? (
                        <>
                          {sources(row.evidence)}
                          <label>
                            人工确认对应的原文
                            <select
                              value=""
                              disabled={disabled}
                              onChange={(event) => {
                                const evidence = row.evidence.find(
                                  (e) => e.id === event.target.value,
                                );
                                if (!evidence) return;
                                const calibration =
                                  course.studyLab?.calibration;
                                onChange({
                                  ...course.studyLab,
                                  calibration: {
                                    materialKeys: keys,
                                    toc,
                                    updatedAt: new Date().toISOString(),
                                    confirmations: {
                                      ...calibration?.confirmations,
                                      [`${row.chapterId}|${row.term}`]: {
                                        evidence,
                                        fingerprint:
                                          contentFingerprint(selected),
                                        confirmedAt: new Date().toISOString(),
                                      },
                                    },
                                  },
                                });
                                setMessage(
                                  '已保存人工确认；教材文字变化后将提示重新核对。',
                                );
                              }}
                            >
                              <option value="">查看原文后选择确认</option>
                              {row.evidence.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name} · {e.section}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <p className="muted">
                          检查资料是否完整，或补充教材相应章节。
                        </p>
                      )}
                      {course.studyLab?.calibration?.confirmations?.[
                        `${row.chapterId}|${row.term}`
                      ] && (
                        <p className="muted">
                          {course.studyLab.calibration.confirmations[
                            `${row.chapterId}|${row.term}`
                          ].fingerprint === contentFingerprint(selected)
                            ? '已人工确认对应依据'
                            : '教材内容已变化，原人工确认需复核'}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {tab === 'check' && (
        <>
          <section className="panel">
            <div className="lab-section-heading">
              <div>
                <h3>先用两道题检查理解</h3>
                <p className="muted">
                  AI
                  出题每次一次请求；评分和复习建议在本地完成。两道题不能代表整门课掌握程度。
                </p>
              </div>
              <div className="actions">
                {course.id === 'demo-linear' && (
                  <button
                    disabled={disabled || busy}
                    onClick={() => saveCheck(demoCheck())}
                  >
                    体验示例自测 · 无需 AI
                  </button>
                )}
                <button
                  className="primary"
                  disabled={busy || disabled}
                  onClick={() => void generate()}
                >
                  {busy ? '正在检索教材并出题…' : '根据教材生成两题'}
                </button>
                {busy && (
                  <button onClick={() => abort.current?.abort()}>
                    停止出题
                  </button>
                )}
              </div>
            </div>
            {!!checks.length && (
              <label>
                自测记录
                <select
                  value={activeId}
                  onChange={(e) => {
                    const c = checks.find((item) => item.id === e.target.value);
                    setActiveId(e.target.value);
                    setAnswers(c?.answers ?? [-1, -1]);
                    setPlanDraft(null);
                  }}
                >
                  {!active && <option value="">选择记录</option>}
                  {checks
                    .filter((c) => !c.deletedAt)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {new Date(c.createdAt).toLocaleString('zh-CN')} ·{' '}
                        {c.source === 'demo' ? '示例' : 'AI'} ·{' '}
                        {c.answers ? '已作答' : '待作答'}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </section>
          {active && (
            <section className="panel">
              <div className="lab-section-heading">
                <h3>
                  {active.source === 'demo'
                    ? '原创示例题'
                    : 'AI 生成题 · 请核对解析'}
                </h3>
                <button
                  disabled={disabled}
                  onClick={() => {
                    onChange({
                      ...course.studyLab,
                      checks: checks.map((c) =>
                        c.id === active.id
                          ? { ...c, deletedAt: new Date().toISOString() }
                          : c,
                      ),
                    });
                    setActiveId('');
                    setPlanDraft(null);
                  }}
                >
                  <Trash2 size={15} />
                  删除记录
                </button>
              </div>
              {active.questions.map((q, i) => (
                <fieldset className="check-question" key={q.id}>
                  <legend>
                    {i + 1}. {q.prompt}
                  </legend>
                  {q.options.map((option, index) => (
                    <label
                      className={`check-option ${active.answers && q.correct === index ? 'correct' : ''}`}
                      key={index}
                    >
                      <input
                        type="radio"
                        name={`question-${q.id}`}
                        disabled={!!active.answers || disabled}
                        checked={(active.answers ?? answers)[i] === index}
                        onChange={() =>
                          setAnswers((old) =>
                            old.map((v, j) => (i === j ? index : v)),
                          )
                        }
                      />
                      <span>
                        {String.fromCharCode(65 + index)}. {option}
                      </span>
                    </label>
                  ))}
                  {active.answers && (
                    <div className="check-explanation">
                      <strong>
                        {active.answers[i] === q.correct
                          ? '本题答对'
                          : `本题需巩固 · 正确选项 ${String.fromCharCode(65 + q.correct)}`}
                      </strong>
                      <LearningMarkdown text={q.explanation} />
                      {sources(
                        active.evidence.filter((e) =>
                          q.sourceIds.includes(e.id),
                        ),
                      )}
                      {course.guide?.chapters.find((c) =>
                        c.keyConcepts.includes(q.term),
                      ) && (
                        <button
                          onClick={() =>
                            onAsk(
                              course.guide!.chapters.find((c) =>
                                c.keyConcepts.includes(q.term),
                              )!,
                              q.term,
                              `我刚做了这道题：${q.prompt}。我选择了「${q.options[active.answers![i]]}」，正确答案是「${q.options[q.correct]}」。请结合教材解释我容易混淆的地方。`,
                            )
                          }
                        >
                          带着这道题继续提问
                        </button>
                      )}
                    </div>
                  )}
                </fieldset>
              ))}
              {!active.answers && (
                <button
                  className="primary"
                  disabled={disabled || answers.some((a) => a < 0)}
                  onClick={() =>
                    saveCheck({
                      ...active,
                      answers: [...answers],
                      submittedAt: new Date().toISOString(),
                    })
                  }
                >
                  提交答案并查看解析
                </button>
              )}
              {result && (
                <div className="check-result">
                  <strong>本次答对 {result.correct} / 2</strong>
                  <p>
                    {result.terms.length
                      ? `建议先巩固：${result.terms.join('、')}`
                      : '这两道题答对了，建议两天后再回忆一次。'}
                  </p>
                  <button
                    disabled={disabled || !!active.planId}
                    onClick={() => setPlanDraft(planFromCheck(active, course))}
                  >
                    {active.planId ? '已加入复习计划' : '预览复习安排'}
                  </button>
                </div>
              )}
            </section>
          )}
          {active && planDraft && (
            <section className="panel">
              <h3>确认后才加入复习计划</h3>
              <label>
                计划名称
                <input
                  value={planDraft.title}
                  maxLength={100}
                  onChange={(e) =>
                    setPlanDraft({ ...planDraft, title: e.target.value })
                  }
                />
              </label>
              {planDraft.tasks.map((t) => (
                <p key={t.id}>
                  {t.date} · {t.title} · {t.minutes} 分钟
                </p>
              ))}
              <div className="actions">
                <button onClick={() => setPlanDraft(null)}>取消</button>
                <button
                  className="primary"
                  disabled={disabled || !planDraft.title.trim()}
                  onClick={() => {
                    onPlan(planDraft, active);
                    setPlanDraft(null);
                    setMessage('已保存，可到“复习计划”修改日期和任务。');
                  }}
                >
                  确认加入复习计划
                </button>
              </div>
            </section>
          )}
          {!!checks.filter((c) => c.deletedAt).length && (
            <details className="panel">
              <summary>已删除的自测记录</summary>
              {checks
                .filter((c) => c.deletedAt)
                .map((c) => (
                  <div className="lab-heading-row" key={c.id}>
                    <span>{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
                    <button
                      disabled={disabled}
                      onClick={() => saveCheck({ ...c, deletedAt: undefined })}
                    >
                      <RotateCcw size={15} />
                      恢复
                    </button>
                  </div>
                ))}
            </details>
          )}
        </>
      )}
      {tab === 'benchmark' && (
        <>
          <section className="panel">
            <h3>同一道问题，两种检索结果</h3>
            <p className="muted">
              此处在所选教材上比较旧版词项计数与新版 BM25
              排序＋课程术语扩展，不调用 AI。问答中另可选择 AI
              语义改写；它会增加一次短请求。
            </p>
            <label>
              试一个自己的问法
              <input
                value={query}
                maxLength={500}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              disabled={!query.trim()}
              onClick={() =>
                setComparison({
                  baseline: retrieve(query, selected).slice(0, 3),
                  enhanced: rankEvidence(query, selected, [], 3),
                })
              }
            >
              <Search size={16} />
              对比检索
            </button>
            {comparison && (
              <div className="lab-columns">
                <div>
                  <h4>原版检索</h4>
                  {comparison.baseline.length ? (
                    sources(comparison.baseline)
                  ) : (
                    <p>未命中</p>
                  )}
                </div>
                <div>
                  <h4>新版本地检索</h4>
                  {comparison.enhanced.length ? (
                    sources(comparison.enhanced)
                  ) : (
                    <p>未命中</p>
                  )}
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <h3>可复现的小样本验证</h3>
            <p className="muted">
              6
              道公开示例，标准答案是讲义的小节名称。词表覆盖的题已明确标注。这只是检索回归检查，不能证明泛化能力或
              AI 答案准确率。
            </p>
            <button onClick={() => setBench(runBench())}>
              <FlaskConical size={16} />
              运行 6 题验证 · 无需 AI
            </button>
            <p className="muted">
              另有一轮 4 题真实问答对照：新旧版均正确回答，未测出准确率提升。
              <a href="/evaluation/live-comparison.json" download>
                下载 2026-10-03 的回答与引用记录
              </a>
              （只读取已保存结果，不调用 AI。）
            </p>
            {bench && (
              <>
                <p>
                  首条命中：原版{' '}
                  {bench.filter((r) => r.baseline === r.expected).length}
                  /6，新版{' '}
                  {bench.filter((r) => r.enhanced === r.expected).length}/6。
                </p>
                <div className="lab-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>问题 / 类型</th>
                        <th>标准小节</th>
                        <th>原版首条</th>
                        <th>新版首条</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bench.map((r) => (
                        <tr key={r.query}>
                          <td>
                            {r.query}
                            <small>{r.kind}</small>
                          </td>
                          <td>{r.expected}</td>
                          <td>{r.baseline}</td>
                          <td>{r.enhanced}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              evaluatedAt: new Date().toISOString(),
                              scope:
                                '公开示例检索回归；不是独立盲测，不测生成答案准确率',
                              results: bench,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: 'application/json' },
                      ),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = '检索验证结果.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  下载真实测试结果
                </button>
              </>
            )}
          </section>
        </>
      )}
      {busy && (
        <output>
          <LoaderCircle size={16} className="spin" /> 正在处理，完成前可停止。
        </output>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && <output className="lab-message">{message}</output>}
    </section>
  );
}
