// app.js —— 后端的"菜谱"：所有路由和逻辑都在这，但自己不"开店"（不 listen）
// 谁来开店都行：
//   - 本地开发：server.js 端着它开在 3001
//   - 线上部署：Vercel 用根目录 api/analyze.js 叫醒它
// 拆开的目的：同一份逻辑，本地和线上共用，不各写一套
// v2.1：输出按"合同"验货，不合格就退货让 AI 重写（最多 3 次）

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

const app = express()

// 中间件：自动把请求体（body）里的 JSON 解析成 JS 对象，挂到 req.body 上
app.use(express.json())

// 启动时读一次"AI 工作手册"（docs/prompt.md 全文），当作 system prompt 备用
const promptPath = path.join(import.meta.dirname, '..', 'docs', 'prompt.md')
const SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf8')

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 验货：按 prompt.md 第 4 章的合同逐项检查 AI 输出。
// DeepSeek 暂不支持 json_schema 强约束，所以后端自己当质检员。
function validateReport(r) {
  const problems = []
  if (!r || typeof r !== 'object') return ['输出不是 JSON 对象']
  for (const f of ['personality_type', 'type_name', 'punchline', 'description', 'type_matches', 'disclaimer']) {
    if (typeof r[f] !== 'string') problems.push(`缺少字符串字段 ${f}`)
  }
  if (!Array.isArray(r.functions) || r.functions.length !== 4) {
    problems.push('functions 必须是恰好 4 项的数组')
  } else {
    r.functions.forEach((f, i) => {
      if (!f || typeof f.position !== 'string' || typeof f.function !== 'string' || typeof f.insight !== 'string') {
        problems.push(`functions[${i}] 结构不对`)
      }
      if (!Number.isInteger(f.score) || f.score < 0 || f.score > 100) {
        problems.push(`functions[${i}].score 必须是 0~100 整数`)
      }
    })
  }
  for (const k of ['strengths', 'blind_spots']) {
    if (!Array.isArray(r[k]) || r[k].length !== 4) problems.push(`${k} 必须是恰好 4 项的数组`)
  }
  if (!Array.isArray(r.under_pressure) || r.under_pressure.length !== 2) {
    problems.push('under_pressure 必须是恰好 2 项的数组')
  }
  return problems
}

// 打一次电话给 DeepSeek。返回 { report } 或 { error }
async function callDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.8,                            // 0=刻板 1=跳脱，0.8 给报告留点文采
      response_format: { type: 'json_object' },    // 让 AI 只吐 JSON，方便解析
    }),
    signal: AbortSignal.timeout(120_000),          // 120 秒没回就放弃
  })

  // AI 服务端出问题：把状态码翻译成人话，而不是甩给用户一串数字
  if (!aiResponse.ok) {
    const errText = await aiResponse.text()
    const hints = {
      401: 'API key 无效（本地检查 server/.env，线上检查 Vercel 后台的环境变量）',
      402: 'DeepSeek 账户余额不足，去开放平台充值',
      429: '请求太频繁，稍等几秒再试',
    }
    const friendly = hints[aiResponse.status] || `DeepSeek 出错了（${aiResponse.status}）：${errText.slice(0, 200)}`
    return { error: friendly }
  }

  const data = await aiResponse.json()
  try {
    return { report: JSON.parse(data.choices[0].message.content) }
  } catch {
    return { error: 'AI 返回的不是合法 JSON' }
  }
}

// 分析接口：前端把答案发到这里，这里负责跟 DeepSeek 对话
app.post('/api/analyze', async (req, res) => {
  const answers = req.body?.answers

  // 第一道防线：答案格式不对，直接拒绝（400 = "你的请求有问题"）
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'answers 必须是题目答案数组' })
  }

  // 第二道防线：key 没配（.env 没建或没填），给出明确提示
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: '后端没读到 DEEPSEEK_API_KEY，本地检查 server/.env，线上检查 Vercel 环境变量' })
  }

  try {
    const baseMessages = [
      { role: 'system', content: SYSTEM_PROMPT },          // 工作手册
      { role: 'user', content: JSON.stringify(answers) },  // 用户的 20 题答案
    ]
    let messages = baseMessages
    let report = null

    // 最多 3 次：每次验货，不合格就把"差评"和上次输出一起发回，让 AI 重写
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await callDeepSeek(messages)
      if (result.error) return res.status(502).json({ error: result.error })

      const problems = validateReport(result.report)
      if (problems.length === 0) {
        report = result.report
        break
      }

      messages = [
        ...baseMessages,
        { role: 'assistant', content: JSON.stringify(result.report) },
        { role: 'user', content: `你上一次的输出不符合格式要求：${problems.join('；')}。请严格按输出格式重新输出完整的报告 JSON，不要输出任何其他内容。` },
      ]
    }

    if (!report) return res.status(502).json({ error: 'AI 连续 3 次输出不符合格式要求，请稍后重试' })
    res.json(report)
  } catch (err) {
    // 兜底：网络断、超时等，都落到这里
    res.status(500).json({ error: `分析失败：${err.message}` })
  }
})

export default app
