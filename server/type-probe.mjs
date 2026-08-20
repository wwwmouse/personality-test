// type-probe.mjs —— 判型公平性对照实验（压力测试工具）
// 用法：cd server && node --env-file-if-exists=.env type-probe.mjs ../docs/type-profiles.json [轮数] [题库路径]
//   题库路径省略 = frontend/src/data/questions.json（线上题库）；跑 v3 草案时传 ../docs/questions-v3-draft.json
//   轮数省略 = 每档案 1 轮（详细输出）；轮数 >1 = 每档案多轮取众数（单轮噪声 > 邻近对区分度，
//   多轮众数才是稳定标尺），输出紧凑并附汇总。
// 作用：按"教科书式"答案逐套直接调 DeepSeek（不经过 /api/analyze，不污染统计账本），
//       打印每套答案的判型结果——检验"题目 + AI"能不能认出不同的典型类型。
// 两层诊断（题库 v3.0 数值制起）：每套档案同时打印 scorer.mjs 的确定性账本推导
//   （derived_type + 区段），模型判型与账本对不上 = 模型没执行规则，当场可抓。
// 改过题目后重跑一遍，就是最简单的回归测试。
import fs from 'node:fs'
import path from 'node:path'
import { loadQuestions, ledgerSummary } from './scorer.mjs'

const profilesPath = path.resolve(process.argv[2] || '../docs/type-profiles.json')
const rounds = Math.max(1, parseInt(process.argv[3] || '1', 10))
const questionsPath = path.resolve(
  process.argv[4] || path.join(import.meta.dirname, '../frontend/src/data/questions.json')
)
const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'))
const questions = loadQuestions(JSON.parse(fs.readFileSync(questionsPath, 'utf8')))
const SYSTEM_PROMPT = fs.readFileSync(path.join(import.meta.dirname, '../docs/prompt.md'), 'utf8')

// 打一次电话：返回 { report } 或 { error }
// reasons 可选：档案自带理由（模拟真实用户），缺的题留空
async function analyze(picks, reasons) {
  const answers = questions.map((q) => {
    const key = picks[q.id]
    const option = q.options.find((o) => o.key === key)
    return { id: q.id, question: q.text, choice: key, choice_text: option.text, reason: (reasons && reasons[q.id]) || '' }
  })

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ answers, ledger: ledgerSummary(questions, answers) }) },
      ],
      temperature: 0.8,   // 固定 0.8：成绩单可比性，不随生产温度机制走
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(120_000),
  })

  const ledger = ledgerSummary(questions, answers)
  if (!res.ok) {
    return { error: `DeepSeek 出错（${res.status}）：${(await res.text()).slice(0, 120)}`, ledger }
  }
  try {
    return { report: JSON.parse((await res.json()).choices[0].message.content), ledger }
  } catch {
    return { error: 'AI 返回的不是合法 JSON', ledger }
  }
}

// 众数：出现最多的判型；平手取先到最高票的
function modeOf(list) {
  const count = new Map()
  for (const x of list) count.set(x, (count.get(x) || 0) + 1)
  let best = list[0]
  for (const [x, n] of count) if (n > count.get(best)) best = x
  return best
}

// 判型 vs 期望类型：E/I、N/S、T/F、P/J 四维对错
function dimCheck(expected, actual) {
  return [0, 1, 2, 3].map((i) => actual[i] === expected[i])
}

const DIMS = ['E/I', 'N/S', 'T/F', 'P/J']
const dimScores = [0, 0, 0, 0]
let fullCorrect = 0
const lines = []

for (const p of profiles) {
  const expected = p.name.slice(0, 4)

  if (rounds === 1) {
    const startedAt = Date.now()
    const { report, error, ledger } = await analyze(p.picks, p.reasons)
    if (error) {
      console.log(`【${p.name}】→ ${error}\n`)
      continue
    }
    const ok = dimCheck(expected, report.personality_type)
    ok.forEach((v, i) => (dimScores[i] += v ? 1 : 0))
    if (ok.every(Boolean)) fullCorrect++
    lines.push(`${expected}→${report.personality_type}${ok.every(Boolean) ? ' ✓' : ' ✗'}`)
    console.log(`【${p.name}】→ 判型 ${report.personality_type}「${report.type_name}」｜ 耗时 ${Date.now() - startedAt}ms`)
    console.log(`  账本推导：${ledger.derived_type}（${ledger.top1} ${ledger.scores[ledger.top1]} / ${ledger.top2} ${ledger.scores[ledger.top2]}，差 ${ledger.gap}，${ledger.zone} 区）`)
    console.log(`  功能栈：${report.functions.map((f) => `${f.position}=${f.function}`).join(' / ')}`)
    console.log(`  金句：${report.punchline}\n`)
    continue
  }

  // 多轮：逐轮只记判型，最后按众数算成绩（账本每轮相同，只记第一轮）
  const types = []
  let ledger = null
  for (let r = 1; r <= rounds; r++) {
    const { report, error, ledger: lg } = await analyze(p.picks, p.reasons)
    if (!ledger) ledger = lg
    types.push(error ? 'ERR' : report.personality_type)
  }
  const valid = types.filter((t) => t !== 'ERR')
  const m = valid.length ? modeOf(valid) : 'ERR'
  const ok = m !== 'ERR' ? dimCheck(expected, m) : [false, false, false, false]
  ok.forEach((v, i) => (dimScores[i] += v ? 1 : 0))
  if (ok.every(Boolean)) fullCorrect++
  lines.push(`${expected}→[${types.join('/')}] 众数 ${m}${ok.every(Boolean) ? ' ✓' : ' ✗'}`)
  console.log(`【${p.name}】账本 ${ledger.derived_type}（${ledger.zone} 区）｜ ${types.join(' / ')} → 众数 ${m}`)
}

console.log('\n=== 汇总 ===')
console.log(`每档案 ${rounds} 轮（${rounds === 1 ? '单轮' : '众数'}口径）｜ 期望档案 ${profiles.length} 套`)
console.log(`四字母全对：${fullCorrect}/${profiles.length}`)
console.log(`分维度：${DIMS.map((d, i) => `${d} ${dimScores[i]}/${profiles.length}`).join(' ｜ ')}`)
console.log(lines.map((l) => '  ' + l).join('\n'))
