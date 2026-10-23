import type { CourseGuide } from './course-guide';
import { lessonRequest, lessonSourceKey } from './chapter-lesson';
import type { Material, Note } from './knowledge';
import { rankEvidence } from './retrieval';
import {
  sourcePassagesForChapter,
  contentFingerprint,
} from './textbook-calibration';
import type { LearningCheck } from './learning-check';
export const DEMO_TEXT = `演示讲义 · 线性代数入门
本讲义为应用演示原创短文，不冒充学校教材或完整课程。
目录
第一章 矩阵与线性变换
第二章 特征值与特征向量
第三章 线性方程组

第一章 矩阵与线性变换
矩阵乘法表示线性变换的复合。对列向量 x，ABx 表示先施加 B，再施加 A。一般 AB 不等于 BA。若 A 是 m×n 矩阵，B 是 n×p 矩阵，则 AB 是 m×p 矩阵。例如 A=[[1,1],[0,1]]，B=[[1,0],[1,1]]，AB=[[2,1],[1,1]]，BA=[[1,1],[1,2]]。
单位矩阵 I 的主对角线元素为1，其他元素为0。在维度适配时 AI=IA=A。单位矩阵对应保持每个向量不变的线性变换。
矩阵的秩是其列空间的维数，也等于最大线性无关列组所含列的个数。A=[[1,2],[2,4]] 的第二列是第一列的2倍，秩为1。秩说明输出所能覆盖的独立方向数。

第二章 特征值与特征向量
特征向量是满足 Av=λv 的非零向量 v，λ 是相应的特征值。沿该方向，线性变换只按比例伸缩；λ 为负时方向反转。零向量不能作为特征向量。A=diag(2,3) 的向量 (1,0) 是对应特征值2的特征向量。
特征值 λ 是满足 det(A-λI)=0 的数。零可以是特征值；若 Av=0 且 v非零，则 v是对应零特征值的特征向量，变换后成为零向量，不应说零向量仍有方向。

第三章 线性方程组
线性方程组 Ax=b 有解当且仅当 rank(A)=rank([A|b])。若有解且秩等于未知数个数 n，则解唯一；若秩小于 n，则有无穷多解。系数矩阵秩和增广矩阵秩不相等时无解。
`;
export function demoMaterial(): Material {
  const blocks = [
    [
      '矩阵乘法',
      DEMO_TEXT.slice(
        DEMO_TEXT.indexOf('矩阵乘法表示'),
        DEMO_TEXT.indexOf('单位矩阵 I'),
      ),
    ],
    [
      '单位矩阵',
      DEMO_TEXT.slice(
        DEMO_TEXT.indexOf('单位矩阵 I'),
        DEMO_TEXT.indexOf('矩阵的秩是'),
      ),
    ],
    [
      '矩阵的秩',
      DEMO_TEXT.slice(
        DEMO_TEXT.indexOf('矩阵的秩是'),
        DEMO_TEXT.indexOf(
          '第二章 特征值与特征向量',
          DEMO_TEXT.indexOf('矩阵的秩是'),
        ),
      ),
    ],
    [
      '特征向量',
      DEMO_TEXT.slice(
        DEMO_TEXT.indexOf('特征向量是'),
        DEMO_TEXT.indexOf('特征值 λ'),
      ),
    ],
    [
      '特征值',
      DEMO_TEXT.slice(
        DEMO_TEXT.indexOf('特征值 λ'),
        DEMO_TEXT.lastIndexOf('第三章 线性方程组'),
      ),
    ],
    ['线性方程组', DEMO_TEXT.slice(DEMO_TEXT.indexOf('线性方程组 Ax=b'))],
  ];
  return {
    name: '演示讲义·线性代数.txt',
    type: 'TXT',
    size: '原创示例',
    status: '可检索',
    content: DEMO_TEXT,
    passages: blocks.map(([section, text]) => ({ section, text: text.trim() })),
    coverage: { characters: DEMO_TEXT.length, truncated: false },
  };
}
export function demoWorkspace() {
  const now = '2026-10-03T00:00:00.000Z';
  const material = demoMaterial();
  const guide: CourseGuide = {
    version: 1,
    source: 'manual',
    generatedFor: '线性代数 · 示例课',
    courseOverview:
      '先看懂矩阵代表的变换，再认识特征方向，最后用秩判断方程组的解。这是可以直接体验的原创示例课；阅读、教材对照和示例自测均不调用 AI。',
    settings: {
      level: '本科入门',
      major: '理工科',
      textbook: '应用内原创演示讲义',
      chapterCount: 3,
    },
    createdAt: now,
    updatedAt: now,
    chapters: [
      {
        id: 'demo-matrix',
        title: '矩阵与线性变换',
        narrative: '理解矩阵乘法的顺序、单位矩阵与独立信息的数量。',
        keyConcepts: ['矩阵乘法', '单位矩阵', '矩阵的秩'],
        prerequisites: [],
        learningGoals: ['解释矩阵乘法的顺序'],
      },
      {
        id: 'demo-eigen',
        title: '特征值与特征向量',
        narrative: '寻找变换中的特殊方向，并理解伸缩比例。',
        keyConcepts: ['特征向量', '特征值'],
        prerequisites: ['矩阵乘法'],
        learningGoals: ['区分特征向量与特征值'],
      },
      {
        id: 'demo-system',
        title: '线性方程组',
        narrative: '用秩比较判断解是否存在以及是否唯一。',
        keyConcepts: ['线性方程组'],
        prerequisites: ['矩阵的秩'],
        learningGoals: ['使用秩判断解的情况'],
      },
    ],
  };
  guide.chapters = guide.chapters.map((chapter) => ({
    ...chapter,
    lesson: {
      version: 1,
      source: 'manual',
      evidence: sourcePassagesForChapter(chapter.title, chapter.keyConcepts, [
        material,
      ]),
      materialFingerprint: contentFingerprint([material]),
      sourceKey: lessonSourceKey(
        lessonRequest('线性代数 · 示例课', guide, chapter),
      ),
      createdAt: now,
      updatedAt: now,
      overview: chapter.narrative,
      concepts: chapter.keyConcepts.map((term) => ({
        term,
        explanation: rankEvidence(term, [material], [], 1)[0]?.quote ?? '',
        example:
          term === '矩阵乘法'
            ? '先剪切再拉伸与先拉伸再剪切，得到的结果一般不同。ABx 中靠近 x 的变换先发生。'
            : term === '特征向量'
              ? 'A=diag(2,3)，A(1,0)=(2,0)，所以 (1,0) 是一个特征向量。'
              : '请结合上方演示讲义中的公式和数值例子，自己换一组数核对。',
        pitfall:
          term === '特征向量'
            ? '特征向量必须非零；但特征值可以为零。'
            : '先检查结论的前提与维度，不能只背公式。',
        questions: [`请用一个例子解释${term}。`],
      })),
      recap: chapter.learningGoals,
    },
  }));
  const notes: Note[] = [
    {
      id: 'demo-note-matrix',
      title: '为什么矩阵乘法要看顺序',
      text: '对列向量，ABx 表示先 B 后 A。一般 AB≠BA。\n\n下一步阅读 [[特征方向]]。',
      course: guide.generatedFor,
      courseId: 'demo-linear',
      chapter: guide.chapters[0].title,
      createdAt: now,
      tags: ['示例', '矩阵'],
      sources: rankEvidence('矩阵乘法', [material], [], 1),
    },
    {
      id: 'demo-note-eigen',
      title: '特征方向',
      text: '满足 $Av=\\lambda v$ 的非零向量是特征向量。\n\n先复习 [[为什么矩阵乘法要看顺序]]。',
      course: guide.generatedFor,
      courseId: 'demo-linear',
      chapter: guide.chapters[1].title,
      createdAt: now,
      tags: ['示例'],
    },
  ];
  return {
    courses: [
      {
        id: 'demo-linear',
        name: guide.generatedFor,
        code: 'DEMO',
        materials: [material],
        sessions: [],
        graphFocus: '',
        guide,
        chapters: guide.chapters.map((ch) => ch.title),
      },
    ],
    notes,
    reviewPlans: [],
    courseId: 'demo-linear',
    sessionId: '',
    activeView: 'home' as const,
    preferences: {
      brandName: '课伴·研学版',
      userName: '同学',
      semester: '独立增强版本',
    },
  };
}
export function demoCheck(): LearningCheck {
  const evidence = rankEvidence('矩阵乘法 特征向量', [demoMaterial()], [], 6);
  const idFor = (term: string) => evidence.find((e) => e.section === term)!.id;
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'demo',
    evidence,
    questions: [
      {
        id: 'matrix-order',
        term: '矩阵乘法',
        prompt: '对列向量 x，ABx 中哪一个变换先发生？',
        options: ['先 A 后 B', '先 B 后 A', '顺序总是没有影响', '一定无法计算'],
        correct: 1,
        explanation:
          '先计算 Bx，再左乘 A，因此先 B 后 A；矩阵乘法一般不可交换。',
        sourceIds: [idFor('矩阵乘法')],
      },
      {
        id: 'eigen-zero',
        term: '特征向量',
        prompt: '关于 Av=λv，哪一项正确？',
        options: [
          'v 可以是零向量',
          'λ 不能为零',
          'v 必须非零，λ 可以为零',
          'λ 为负时 v 不能是特征向量',
        ],
        correct: 2,
        explanation: '特征向量定义要求 v 非零；零可以是特征值，此时 Av=0。',
        sourceIds: [idFor('特征向量'), idFor('特征值')],
      },
    ],
  };
}
export const RETRIEVAL_FIXTURES = [
  { query: '矩阵乘法', expected: '矩阵乘法', kind: '直接术语' },
  {
    query: '先做一个变换再做另一个',
    expected: '矩阵乘法',
    kind: '词表覆盖的口语问法',
  },
  { query: '独立信息有多少', expected: '矩阵的秩', kind: '词表覆盖的口语问法' },
  { query: '只伸缩不转向', expected: '特征向量', kind: '词表覆盖的口语问法' },
  { query: '方程有没有解', expected: '线性方程组', kind: '词表覆盖的口语问法' },
  { query: '特征值可以为零吗', expected: '特征值', kind: '直接术语' },
];
