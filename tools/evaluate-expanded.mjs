// Fixed, self-authored fixtures. Do not change gold labels after observing results.
// This measures local passage retrieval only, never generated answer accuracy.
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { moduleUrl } from '../tests/load-ts.mjs';
const { rankEvidence } = await import(await moduleUrl('../lib/retrieval.ts'));
const { retrieve } = await import(await moduleUrl('../lib/knowledge.ts'));
const subjects = [
  [
    '高等数学',
    '导数',
    '导数描述函数在某点的瞬时变化率。若位置函数为 s(t)，其导数为瞬时速度。导数与某段区间上的累积量不同。',
    [
      '导数的含义是什么',
      '函数在某点的瞬时变化率叫什么',
      '位置函数求导得到什么',
    ],
  ],
  [
    '高等数学',
    '定积分',
    '定积分表示区间上的有向累积量。速度对时间的定积分给出位移；速度可为负，因此位移不一定等于路程。',
    [
      '定积分表示什么',
      '速度对时间积分得到位移还是路程',
      '有向累积量可以用什么表示',
    ],
  ],
  [
    '高等数学',
    '矩阵乘法',
    '矩阵乘法有顺序。对列向量，ABx 表示先施加 B 再施加 A，AB 通常不等于 BA。',
    [
      'ABx 先做哪个变换',
      '矩阵乘法能否随意交换顺序',
      '先 B 再 A 的总矩阵怎样写',
    ],
  ],
  [
    '高等数学',
    '条件概率',
    '条件概率 P(A|B)=P(A交B)/P(B)，要求 P(B)>0。事件独立时 P(A|B)=P(A)。',
    [
      '条件概率公式有什么前提',
      '已知 B 发生如何求 A 的概率',
      'P(A|B) 的分母是什么',
    ],
  ],
  [
    '大学物理',
    '匀速运动',
    '匀速直线运动的位移等于速度乘时间，计算前统一单位。速度为每秒 2 米，持续 3 分钟，位移为 360 米。',
    [
      '每秒 2 米运动 3 分钟走多远',
      '匀速运动计算位移前要注意什么',
      '速度乘时间求什么',
    ],
  ],
  [
    '大学物理',
    '加速度',
    '加速度是速度对时间的变化率，单位为米每二次方秒。加速度为零表示速度不变，不代表速度为零。',
    ['加速度为零时一定静止吗', '速度变化率叫什么', '加速度的单位是什么'],
  ],
  [
    '大学物理',
    '牛顿第二定律',
    '在惯性参考系中，质量不变的物体满足合力等于质量乘加速度 F=ma。这里的力是合外力，不是任意一个力。',
    [
      'F=ma 中的力指什么',
      '质量不变时合力与加速度有什么关系',
      '牛顿第二定律适用哪种参考系',
    ],
  ],
  [
    '大学物理',
    '动量',
    '动量 p=mv，是具有方向的矢量。系统合外力为零时总动量守恒；动能守恒需要另外的条件。',
    ['动量是标量还是矢量', '总动量守恒的条件是什么', 'p=mv 表示哪个物理量'],
  ],
  [
    '程序设计',
    '二分查找',
    '二分查找要求待查序列有序，每次比较中间位置，排除一半候选区间。时间复杂度 O(log n)。',
    [
      '二分查找要求序列满足什么',
      '每次排除一半候选区间是什么算法',
      '二分查找时间复杂度是多少',
    ],
  ],
  [
    '程序设计',
    '栈',
    '栈遵循后进先出，最后入栈的元素最先出栈。函数调用与撤销操作常使用栈。',
    ['栈按什么顺序取出元素', '后进先出是什么数据结构', '撤销操作常用哪种结构'],
  ],
  [
    '程序设计',
    '队列',
    '队列遵循先进先出，先入队的元素先出队。任务排队可以用队列实现，区别于后进先出的栈。',
    ['队列按什么顺序取出元素', '先入队的元素何时出队', '任务排队使用什么结构'],
  ],
  [
    '程序设计',
    '事务',
    '数据库事务的一致性和原子性保证一组更新全部成功或全部回滚。并发版本检查可以拒绝过期写入，避免覆盖新修改。',
    [
      '一组数据库更新失败后应该怎样处理',
      '为什么要拒绝过期写入',
      '全部成功或全部回滚是什么特性',
    ],
  ],
];
const materials = [...new Set(subjects.map((s) => s[0]))].map((name) => ({
  name: `原创评测·${String(name)}`,
  type: 'TXT',
  size: '',
  status: '可检索',
  passages: subjects
    .filter((s) => s[0] === name)
    .map((s) => ({ section: s[1], text: s[2] })),
}));
const cases = subjects.flatMap((s, i) =>
  s[3].map((query, j) => ({ id: `E${i + 1}-${j + 1}`, query, expected: s[1] })),
);
for (const query of [
  '线粒体呼吸链',
  '梵高星夜配色',
  '木星卫星轨道',
  '甲骨文断代依据',
])
  cases.push({ id: `N${cases.length}`, query, expected: null });
const results = cases.map((c) => {
  const start = performance.now(),
    baseline = retrieve(c.query, materials).slice(0, 3),
    baselineMs = performance.now() - start;
  const enhancedStart = performance.now(),
    enhanced = rankEvidence(c.query, materials, [], 3),
    enhancedMs = performance.now() - enhancedStart;
  return {
    ...c,
    baseline: baseline.map((e) => e.section),
    enhanced: enhanced.map((e) => e.section),
    baselineMs,
    enhancedMs,
  };
});
const metrics = (key) => ({
  answerable: results.filter((r) => r.expected).length,
  top1: results.filter((r) => r.expected && r[key][0] === r.expected).length,
  top3: results.filter((r) => r.expected && r[key].includes(r.expected)).length,
  unanswerable: results.filter((r) => !r.expected).length,
  emptyForUnanswerable: results.filter((r) => !r.expected && !r[key].length)
    .length,
  meanMs: results.reduce((n, r) => n + r[`${key}Ms`], 0) / results.length,
});
const report = {
  evaluatedAt: new Date().toISOString(),
  scope:
    '原创短文本，三门课程 40 题，包含近似干扰与无依据问题；公开本地检索检查，非独立盲测，不测试 AI 回答或学习效果。',
  materials,
  metrics: { baseline: metrics('baseline'), enhanced: metrics('enhanced') },
  results,
};
await mkdir('docs/evaluation', { recursive: true });
await writeFile(
  'docs/evaluation/expanded-retrieval.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report.metrics, null, 2));
