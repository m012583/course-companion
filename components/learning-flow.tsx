'use client';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, BookOpen } from 'lucide-react';
import {
  attachCheck,
  type LearningCourse,
  type StudyLabState,
} from '@/lib/learning-flow';
import { emptyPractice, latestAttempt } from '@/lib/practice';
import {
  materialId,
  sourcePassagesForChapter,
  contentFingerprint,
} from '@/lib/textbook-calibration';
import { readEventStream } from '@/lib/event-stream';
import { demoCheck } from '@/lib/demo-course';
import type { LearningCheck } from '@/lib/learning-check';
import type { Evidence } from '@/lib/knowledge';
import type { ReviewPlan } from '@/lib/review-plans';
import PracticePanel from './practice-panel';
import RetellingPanel from './retelling-panel';

export default function LearningFlow({
  course,
  model,
  disabled,
  questionId,
  onChange,
  onSource,
  onPlan,
  onExplain,
  onRead,
  aiReady,
  onSetup,
}: {
  course: LearningCourse;
  model: string;
  disabled: boolean;
  questionId?: string;
  onChange: (state: StudyLabState) => void;
  onSource: (source: Evidence) => void;
  onPlan: (plan: ReviewPlan, state: StudyLabState) => void;
  onExplain: (term: string, prompt: string) => void;
  onRead: () => void;
  aiReady: boolean;
  onSetup: () => void;
}) {
  const [tab, setTab] = useState<'quick' | 'bank' | 'wrong' | 'retelling'>(
    questionId ? 'bank' : 'quick',
  );
  const [chapterId, setChapterId] = useState(
    course.studyLab?.flow?.chapterId || course.guide?.chapters[0]?.id || '',
  );
  const [customTerms, setCustomTerms] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [focusId, setFocusId] = useState(course.studyLab?.flow?.checkId ?? '');
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(course);
  useEffect(() => {
    latest.current = course;
  }, [course]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (disabled) controller.current?.abort();
  }, [disabled]);
  const chapter = course.guide?.chapters.find((c) => c.id === chapterId);
  const terms = target
    ? [target]
    : (chapter?.keyConcepts.slice(0, 6) ??
      customTerms
        .split(/[,，、\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 6));
  const selected = course.materials.filter(
    (m) =>
      !m.deletedAt &&
      (m.content || m.passages?.length) &&
      (!course.studyLab?.calibration ||
        course.studyLab.calibration.materialKeys.includes(materialId(m))),
  );
  const evidence = sourcePassagesForChapter(
    chapter?.title ?? '',
    terms,
    selected,
  );
  const practice = course.studyLab?.practice ?? emptyPractice();
  const checks = (course.studyLab?.checks ?? []).filter((c) => !c.deletedAt);
  const group = practice.questions.filter(
    (q) => !q.deletedAt && q.originId?.startsWith(`${focusId}:`),
  );
  const step = !group.length
    ? 0
    : group.some((q) => q.status === 'draft')
      ? 1
      : group.some((q) => latestAttempt(practice, q.id))
        ? 3
        : 2;
  function saveCheck(check: LearningCheck) {
    onChange(
      attachCheck(
        latest.current.studyLab,
        check,
        latest.current.guide?.chapters ?? [],
        chapterId,
      ),
    );
    setFocusId(check.id);
    setTab('quick');
    setError('');
  }
  async function generate() {
    if (controller.current || disabled) return;
    if (!terms.length || !evidence.length) {
      setError('请先选择知识点及可读取的教材依据。');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    const fingerprint = contentFingerprint(selected);
    const focus = target
      ? `请围绕 ${target} 生成同类练习，换一个例子检查理解。`
      : undefined;
    setBusy(true);
    setError('');
    setStatus('正在连接出题服务');
    try {
      const response = await fetch('/api/learning-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        signal: abort.signal,
        body: JSON.stringify({ terms, materials: selected, model, focus }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || '连接失败，请重试。');
      }
      let check: LearningCheck | undefined;
      for await (const raw of readEventStream(response.body)) {
        const event = JSON.parse(raw);
        if (event.type === 'status') setStatus(event.text);
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'done') check = event.check;
      }
      if (abort.signal.aborted) return;
      if (!check) throw new Error('生成未完成，未保存不完整题目。请重试。');
      const currentMaterials = latest.current.materials.filter(
        (m) =>
          selected.some((s) => materialId(s) === materialId(m)) && !m.deletedAt,
      );
      if (
        contentFingerprint(currentMaterials) !== fingerprint ||
        (chapterId &&
          !latest.current.guide?.chapters.some((c) => c.id === chapterId))
      )
        throw new Error('生成期间教材或章节已变化，请重新生成。');
      saveCheck(check);
      setTarget('');
    } catch (issue) {
      if (!abort.signal.aborted)
        setError(issue instanceof Error ? issue.message : '生成失败，请重试。');
    } finally {
      controller.current = null;
      setBusy(false);
      setStatus('');
    }
  }
  return (
    <section className="learning-flow">
      <nav className="lab-tabs" aria-label="练习分类">
        {(
          [
            ['quick', '快速自测'],
            ['bank', '题库'],
            ['wrong', '错题'],
            ['retelling', '复述练习'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'retelling' && (
        <RetellingPanel
          course={course}
          onChange={onChange}
          onSource={onSource}
          disabled={disabled}
          aiReady={aiReady}
          onSetup={onSetup}
        />
      )}
      {tab === 'quick' && (
        <>
          <ol className="flow-steps" aria-label="学习步骤">
            {['选择章节', '核对题目', '作答反馈', '安排复习'].map(
              (label, i) => (
                <li key={label} aria-current={step === i ? 'step' : undefined}>
                  <span>{i + 1}</span>
                  {label}
                </li>
              ),
            )}
          </ol>
          <details
            className="panel flow-setup"
            open={!group.length || busy || !!target || !!error}
          >
            <summary>
              <BookOpen size={17} />{' '}
              {target
                ? `针对性练习：${target}`
                : (chapter?.title ?? '选择教材与知识点')}{' '}
              · 查看依据与生成
            </summary>
            <div className="flow-options">
              <label>
                学习章节
                <select
                  aria-label="学习章节"
                  disabled={busy}
                  value={chapterId}
                  onChange={(e) => {
                    setChapterId(e.target.value);
                    setTarget('');
                  }}
                >
                  <option value="">自选知识点</option>
                  {course.guide?.chapters.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              {!chapter && !target && (
                <label>
                  知识点
                  <input
                    value={customTerms}
                    disabled={busy}
                    maxLength={600}
                    onChange={(e) => setCustomTerms(e.target.value)}
                    placeholder="用逗号分隔，例如：矩阵乘法，线性变换"
                  />
                </label>
              )}
            </div>
            <p className="muted">
              本次范围：{terms.join('、') || '尚未选择知识点'} ·{' '}
              {selected.length} 份教材。题目生成后先核对，再开始练习。
            </p>
            <div className="source-chips">
              {evidence.map((e) => (
                <button key={e.id} onClick={() => onSource(e)}>
                  {e.name} · {e.page ? `第 ${e.page} 页` : e.section}
                </button>
              ))}
            </div>
            {!evidence.length && (
              <p className="notice">
                尚未找到对应原文。可以先上传教材，或调整知识点。
              </p>
            )}
            <div className="actions">
              <button
                className="primary"
                disabled={
                  disabled ||
                  !aiReady ||
                  busy ||
                  !evidence.length ||
                  !terms.length
                }
                onClick={() => void generate()}
              >
                {!aiReady
                  ? '连接 AI 后生成'
                  : busy
                    ? '生成中…'
                    : error
                      ? '重试生成练习'
                      : '生成练习草稿'}
              </button>
              {busy && (
                <button
                  onClick={() => {
                    controller.current?.abort();
                    setError('已停止生成，已有题目保留。');
                  }}
                >
                  停止生成
                </button>
              )}
              <button onClick={onRead}>打开教材</button>
              <button onClick={() => setTab('bank')}>手动建题</button>
              {course.id.startsWith('demo-') && !busy && (
                <button
                  disabled={disabled}
                  onClick={() => saveCheck(demoCheck())}
                >
                  体验原创示例题
                </button>
              )}
            </div>
            {busy && (
              <output>
                <LoaderCircle className="spin" size={16} /> {status}
                。离开练习页面会停止尚未完成的生成。
              </output>
            )}
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
          </details>
        </>
      )}
      {tab !== 'retelling' && (tab !== 'quick' || !!group.length) && (
        <PracticePanel
          key={`${tab}-${tab === 'quick' ? focusId : ''}-${questionId ?? ''}`}
          course={course}
          state={practice}
          checks={checks}
          disabled={disabled}
          initialFilter={tab === 'wrong' ? 'wrong' : 'all'}
          initialQuestionId={questionId}
          focusCheckId={tab === 'quick' ? focusId : undefined}
          onSource={onSource}
          onChange={(p) =>
            onChange({ ...latest.current.studyLab, practice: p })
          }
          onPlan={(plan, p) =>
            onPlan(plan, { ...latest.current.studyLab, practice: p })
          }
          onExplain={(term, prompt) => onExplain(term, prompt)}
          onTarget={(q) => {
            setTarget(q.term);
            setChapterId(q.chapterId);
            setTab('quick');
            setError('');
            document
              .querySelector('.learning-flow')
              ?.scrollIntoView({ block: 'start' });
          }}
        />
      )}
      {tab === 'quick' && checks.length > 0 && (
        <details className="panel">
          <summary>以前的自测与生成记录 · {checks.length}</summary>
          {checks.map((c) => (
            <div className="practice-row" key={c.id}>
              <span>
                {new Date(c.createdAt).toLocaleString('zh-CN')} ·{' '}
                {c.source === 'demo' ? '原创示例' : 'AI 草稿'}
                {c.answers
                  ? ` · 原作答 ${c.answers.map((a, i) => (a === c.questions[i].correct ? '对' : '错')).join(' / ')}`
                  : ''}
              </span>
              <button disabled={disabled} onClick={() => saveCheck(c)}>
                继续核对与练习
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
