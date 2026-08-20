// scorer.mjs —— 选项账本计分器（题库 v3.0 数值制）
// 设计：拆标签后的选项级功能直标 + 纯数值权重。
//   I 侧（Ti/Fi/Ni/Si）各 8 槽 ×0.7，E 侧（Te/Fe/Ne/Se）各 7 槽 ×0.8，八维总预算各 5.6
//   只计 zone="light" 的题；阴影题（zone="shadow"）不计分，只喂报告压力篇
//   三区裁决：前两名分差 ≥0.7 = 账本区（选项说了算）；<0.7 = 平手区（理由定主辅）
// 供 app.js（生产）、type-probe.mjs（回归）、test-analyze.js（试飞）共用。

const FUNCTIONS = ['Ti', 'Fi', 'Ni', 'Si', 'Te', 'Fe', 'Ne', 'Se']
const INTROVERTED = new Set(['Ti', 'Fi', 'Ni', 'Si'])
const JUDGING = new Set(['Ti', 'Fi', 'Te', 'Fe'])
const GAP_THRESHOLD = 0.7

// 读题库文件：兼容裸数组（线上格式）与 { questions: [...] } 包装（草案格式）
export function loadQuestions(raw) {
  return Array.isArray(raw) ? raw : raw.questions
}

// 答案数组 → 八维分数（只计阳面题；缺 zone 字段视为阳面，兼容旧题库）
export function scoreLedger(questions, answers) {
  const scores = Object.fromEntries(FUNCTIONS.map((f) => [f, 0]))
  const byId = new Map(answers.map((a) => [a.id, a]))
  for (const q of questions) {
    if (q.zone === 'shadow') continue
    const ans = byId.get(q.id)
    if (!ans) continue
    const opt = q.options.find((o) => o.key === ans.choice)
    if (!opt || !opt.function) continue
    scores[opt.function] += opt.weight ?? 0
  }
  return scores
}

// 分数 → 账本推导：候选主导、分差、区段、四字母
export function deriveLedger(scores) {
  const ranked = [...FUNCTIONS]
    .map((f) => ({ f, s: scores[f] }))
    .sort((a, b) => b.s - a.s || FUNCTIONS.indexOf(a.f) - FUNCTIONS.indexOf(b.f))
  const top1 = ranked[0].f
  const top2 = ranked[1].f
  // 权重都是 1 位小数，分差先四舍五入到 1 位再比阈值，避免浮点误差（如 0.7 被算成 0.69999…）
  const gap = Math.round((ranked[0].s - ranked[1].s) * 10) / 10
  const zone = gap >= GAP_THRESHOLD ? 'ledger' : 'tie'
  // 四字母公式：E/I=主导方向；N/S、T/F=分和；P/J=外倾侧最高分是判断还是感知
  const ei = INTROVERTED.has(top1) ? 'I' : 'E'
  const ns = scores.Ni + scores.Ne >= scores.Si + scores.Se ? 'N' : 'S'
  const tf = scores.Ti + scores.Te >= scores.Fi + scores.Fe ? 'T' : 'F'
  const extraBest = ranked.find((r) => !INTROVERTED.has(r.f))
  const pj = extraBest && JUDGING.has(extraBest.f) ? 'J' : 'P'
  return { top1, top2, gap, zone, type: ei + ns + tf + pj }
}

// 喂给 AI 的账本摘要（一位小数）
export function ledgerSummary(questions, answers) {
  const scores = scoreLedger(questions, answers)
  const d = deriveLedger(scores)
  const rounded = Object.fromEntries(FUNCTIONS.map((f) => [f, Math.round(scores[f] * 10) / 10]))
  return {
    scores: rounded,
    top1: d.top1,
    top2: d.top2,
    gap: d.gap,
    zone: d.zone,
    derived_type: d.type,
  }
}
