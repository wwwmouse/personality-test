// scorer.mjs —— 选项账本计分器（题库 v3.0 数值制）
// 设计：拆标签后的选项级功能直标 + 纯数值权重。
//   I 侧（Ti/Fi/Ni/Si）各 8 槽 ×0.7，E 侧（Te/Fe/Ne/Se）各 7 槽 ×0.8，八维总预算各 5.6
//   只计 zone="light" 的题；阴影题（zone="shadow"）不计分，只喂报告压力篇
//   两区判型+分歧注记：前两名分差 ≥0.7 = 账本区（选项说了算）；<0.7 = 平手区（理由定主辅）；账本区理由分歧时报告提"次可能类型"
//   判型公式（栈约束，2026-08-21）：主导 = 第一名（定 E/I）；辅助 = 理论合法候选中高分者（定 N/S 或 T/F）；
//     P/J 由栈自然得出——四字母必含第一名功能（旧公式四个字母各自独立，脏档案会产出栈里没有第一名的非法类型）
// 供 app.js（生产）、type-probe.mjs（回归）、test-analyze.js（试飞）共用。

const FUNCTIONS = ['Ti', 'Fi', 'Ni', 'Si', 'Te', 'Fe', 'Ne', 'Se']
const GAP_THRESHOLD = 0.7

// 毕比模型 16 型阳面栈（英雄→阿尼玛）。确定性内容代码管，不交给 AI 记（app.js 验货共用）
export const TYPE_STACKS = {
  INTP: ['Ti', 'Ne', 'Si', 'Fe'],
  ENTP: ['Ne', 'Ti', 'Fe', 'Si'],
  INTJ: ['Ni', 'Te', 'Fi', 'Se'],
  ENTJ: ['Te', 'Ni', 'Se', 'Fi'],
  INFP: ['Fi', 'Ne', 'Si', 'Te'],
  ENFP: ['Ne', 'Fi', 'Te', 'Si'],
  INFJ: ['Ni', 'Fe', 'Ti', 'Se'],
  ENFJ: ['Fe', 'Ni', 'Se', 'Ti'],
  ISTP: ['Ti', 'Se', 'Ni', 'Fe'],
  ESTP: ['Se', 'Ti', 'Fe', 'Ni'],
  ISFP: ['Fi', 'Se', 'Ni', 'Te'],
  ESFP: ['Se', 'Fi', 'Te', 'Ni'],
  ISTJ: ['Si', 'Te', 'Fi', 'Ne'],
  ESTJ: ['Te', 'Si', 'Ne', 'Fi'],
  ISFJ: ['Si', 'Fe', 'Ti', 'Ne'],
  ESFJ: ['Fe', 'Si', 'Ne', 'Ti'],
}

// 每个主导功能的两个理论合法辅助候选：相反态度 + 相反判断/感知性质（荣格辅助功能定义）
// 例：Ti（内倾判断）的辅助必须是外倾感知 → Ne 或 Se
const AUX_CANDIDATES = {
  Ti: ['Ne', 'Se'], Fi: ['Ne', 'Se'], Ni: ['Te', 'Fe'], Si: ['Te', 'Fe'],
  Te: ['Ni', 'Si'], Fe: ['Ni', 'Si'], Ne: ['Ti', 'Fi'], Se: ['Ti', 'Fi'],
}

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

// 分数 → 账本推导：候选主导、辅助、分差、区段、四字母
// 判型公式（栈约束）：主导 = 第一名定 E/I；辅助 = 两个理论合法候选中得分较高者（定 N/S 或 T/F）；
//   P/J 由栈自然得出。四字母必含第一名功能——旧公式（N/S·T/F 全局分和 + P/J 外倾最高分）四个字母
//   各自独立，脏档案（如 Ti 第一、Te 第二）会产出栈里根本没有 Ti 的非法类型（ISTJ/INTJ）。
export function deriveLedger(scores) {
  const ranked = [...FUNCTIONS]
    .map((f) => ({ f, s: scores[f] }))
    .sort((a, b) => b.s - a.s || FUNCTIONS.indexOf(a.f) - FUNCTIONS.indexOf(b.f))
  const top1 = ranked[0].f
  const top2 = ranked[1].f
  // 权重都是 1 位小数，分差先四舍五入到 1 位再比阈值，避免浮点误差（如 0.7 被算成 0.69999…）
  const gap = Math.round((ranked[0].s - ranked[1].s) * 10) / 10
  const zone = gap >= GAP_THRESHOLD ? 'ledger' : 'tie'
  // 辅助 = 理论合法候选中得分较高者；平手取候选表第一位（确定性，无随机）
  const auxCands = AUX_CANDIDATES[top1]
  const aux = scores[auxCands[0]] >= scores[auxCands[1]] ? auxCands[0] : auxCands[1]
  const type = Object.entries(TYPE_STACKS).find(([, s]) => s[0] === top1 && s[1] === aux)?.[0]
  return { top1, top2, aux, gap, zone, type }
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
