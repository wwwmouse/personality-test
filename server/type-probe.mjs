// type-probe.mjs —— 判型公平性对照实验（压力测试工具）
// 用法：cd server && node --env-file-if-exists=.env type-probe.mjs ../docs/type-profiles.json
// 作用：按"教科书式"答案逐套直接调 DeepSeek（不经过 /api/analyze，不污染统计账本），
//       打印每套答案的判型结果——检验"题目 + AI"能不能认出不同的典型类型。
// 改过题目后重跑一遍，就是最简单的回归测试。
import fs from 'node:fs'
import path from 'node:path'

const profilesPath = path.resolve(process.argv[2] || '../docs/type-profiles.json')
const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'))
const questions = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '../frontend/src/data/questions.json'), 'utf8')
)
const SYSTEM_PROMPT = fs.readFileSync(path.join(import.meta.dirname, '../docs/prompt.md'), 'utf8')

async function analyze(name, picks) {
  const answers = questions.map((q) => {
    const key = picks[q.id]
    const option = q.options.find((o) => o.key === key)
    return { id: q.id, question: q.text, choice: key, choice_text: option.text, reason: '' }
  })

  const startedAt = Date.now()
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
        { role: 'user', content: JSON.stringify(answers) },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    console.log(`【${name}】→ DeepSeek 出错（${res.status}）：${(await res.text()).slice(0, 120)}`)
    return
  }
  const data = await res.json()
  const report = JSON.parse(data.choices[0].message.content)
  console.log(`【${name}】→ 判型 ${report.personality_type}「${report.type_name}」｜ 耗时 ${Date.now() - startedAt}ms`)
  console.log(`  功能栈：${report.functions.map((f) => `${f.position}=${f.function}`).join(' / ')}`)
  console.log(`  金句：${report.punchline}\n`)
}

for (const p of profiles) {
  await analyze(p.name, p.picks)
}
