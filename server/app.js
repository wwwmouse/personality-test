// app.js —— 后端的"菜谱"：所有路由和逻辑都在这，但自己不"开店"（不 listen）
// 谁来开店都行：
//   - 本地开发：server.js 端着它开在 3001
//   - 线上部署：Vercel 用根目录 api/analyze.js 叫醒它
// 拆开的目的：同一份逻辑，本地和线上共用，不各写一套
// v2.1：输出按"合同"验货，不合格就退货让 AI 重写（最多 3 次）
//
// ============================================================
// 【阅读导航】这个文件不是从上到下"执行"的，而是"启动时登记 + 来请求才干活"。
// 按"一次 /api/analyze 请求的处理顺序"理解，分三段读：
//   ┌ ① 启动段：import、创建 app、装中间件(express.json)、读菜谱(prompt.md)、读题库
//   ├ ② 工具箱段：validateReport(验货) + callDeepSeek(调 AI)
//   │    这两个函数只是"定义"（写在纸上备用），此刻不执行，被 ③ 的路由按需调用
//   └ ③ 路由段：5 扇门(接口)。主门 POST /api/analyze 的"处理顺序"
//        = 它函数体内语句从上到下的顺序：
//        拿答案 → 两道防线 → 算温度 → 算账本 → 拼消息 → 循环{调AI→验货} → 记账 → 回报告
// ============================================================

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import questionsData from '../frontend/src/data/questions.json' with { type: 'json' }
import { readStats, readEvents, recordTest, recordFeedback, recordSuggestion } from './stats-store.js'
import { loadQuestions, ledgerSummary, TYPE_STACKS } from './scorer.mjs'

const app = express()

// 中间件：自动把请求体（body）里的 JSON 解析成 JS 对象，挂到 req.body 上
app.use(express.json())

// 启动时读一次"AI 工作手册"（docs/prompt.md 全文），当作 system prompt 备用
const promptPath = path.join(import.meta.dirname, '..', 'docs', 'prompt.md')
const SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf8')

// 启动时读一次题库：选项的功能标签+权重在计分器（scorer.mjs）手里，用来算"选项账本"。
// 必须用静态 import 而不是 fs.readFileSync——Vercel 的 nft 打包只认静态依赖，
// 运行时读的文件不在"行李清单"里，线上函数会因找不到文件整店崩溃（2026-08-20 实战踩坑）。
const QUESTIONS = loadQuestions(questionsData)

// TYPE_STACKS 已挪进 scorer.mjs（判型公式与栈表单源），这里只导入使用

// 验货：按 prompt.md 第 4 章的合同逐项检查 AI 输出。
// DeepSeek 暂不支持 json_schema 强约束，所以后端自己当质检员。
function validateReport(r) {
  const problems = []
  if (!r || typeof r !== 'object') return ['输出不是 JSON 对象']
  for (const f of ['personality_type', 'type_name', 'punchline', 'description', 'disclaimer']) {
    if (typeof r[f] !== 'string') problems.push(`缺少字符串字段 ${f}`)
  }
  const POSITIONS = ['英雄', '父母', '永恒少年', '阿尼玛/阿尼姆斯']
  if (!Array.isArray(r.functions) || r.functions.length !== 4) {
    problems.push('functions 必须是恰好 4 项的数组')
  } else {
    r.functions.forEach((f, i) => {
      if (!f || typeof f.function !== 'string' || typeof f.insight !== 'string') {
        problems.push(`functions[${i}] 结构不对`)
      }
      if (f && f.position !== POSITIONS[i]) {
        problems.push(`functions[${i}].position 必须是"${POSITIONS[i]}"`)
      }
      if (!Number.isInteger(f.score) || f.score < 0 || f.score > 100) {
        problems.push(`functions[${i}].score 必须是 0~100 整数`)
      }
    })
  }
  // 四字母与阳面栈必须自洽：防止"判 INTP 却按 ENTP 解读功能"的自打脸报告
  const stack = TYPE_STACKS[r?.personality_type]
  if (stack && Array.isArray(r.functions) && r.functions.length === 4) {
    const actual = r.functions.map((f) => (f ? f.function : '')).join(',')
    if (stack.join(',') !== actual) {
      problems.push(`personality_type 与功能栈矛盾（${r.personality_type} 应为 ${stack.join('/')}，实际 ${actual}）`)
    }
  }
  if (!Array.isArray(r.under_pressure) || r.under_pressure.length !== 3) {
    problems.push('under_pressure 必须是恰好 3 项的数组')
  }
  // 类型配对（v1.0 格子法）：2 项数组（合拍/火花），每项四个字段，逼 AI 写满篇幅
  if (!Array.isArray(r.type_matches) || r.type_matches.length !== 2) {
    problems.push('type_matches 必须是恰好 2 项的数组')
  } else {
    r.type_matches.forEach((m, i) => {
      if (!m || typeof m.kind !== 'string' || typeof m.type !== 'string' || typeof m.reason !== 'string' || typeof m.scene !== 'string') {
        problems.push(`type_matches[${i}] 结构不对`)
      }
    })
  }
  return problems
}

// 打一次电话给 DeepSeek。返回 { report } 或 { error }
// 限流与瞬时故障自动重试：429 / 5xx / 网络错误最多再试 2 次（1 秒、2 秒退避）；
//   401/402/400 这类"重试也没用"的错误不重试，直接翻译成人话返回。
//   重试是安全的——判型分析是幂等操作，重发不会多记一笔账（记账在拿到合格报告之后）。
async function callDeepSeek(messages, temperature) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const hints = {
    401: 'API key 无效（本地检查 server/.env，线上检查 Vercel 后台的环境变量）',
    402: 'DeepSeek 账户余额不足，去开放平台充值',
    429: '请求太频繁，稍等几秒再试',
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    let aiResponse
    try {
      aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature,                                 // 0=刻板 1=跳脱，数值由理由填写率决定（见 /api/analyze）
          response_format: { type: 'json_object' },    // 让 AI 只吐 JSON，方便解析
        }),
        signal: AbortSignal.timeout(120_000),          // 120 秒没回就放弃
      })
    } catch (err) {
      // 网络断/超时：重试预算内再试，耗尽按 5xx 一档处理
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000))
        continue
      }
      return { error: `连接 DeepSeek 失败：${err.message}` }
    }

    // AI 服务端出问题：把状态码翻译成人话，而不是甩给用户一串数字
    if (!aiResponse.ok) {
      const status = aiResponse.status
      if ((status === 429 || status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000))
        continue
      }
      const errText = await aiResponse.text()
      const friendly = hints[status] || `DeepSeek 出错了（${status}）：${errText.slice(0, 200)}`
      return { error: friendly }
    }

    const data = await aiResponse.json()
    try {
      return { report: JSON.parse(data.choices[0].message.content) }
    } catch {
      return { error: 'AI 返回的不是合法 JSON' }
    }
  }
  return { error: 'DeepSeek 暂时不稳定（连续多次失败），请稍后再试' }
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
    // 温度随理由填写率走（0.3 + 0.6 × 填写率）：理由越少，信号越弱，判型越要保守
    // （低温=刻板但稳，避免空理由用户拿到"骰子判型"）；理由写满则放开文采与多样性
    const filled = answers.filter((a) => a.reason && a.reason.trim()).length
    const temperature = Math.round((0.3 + 0.6 * (filled / answers.length)) * 100) / 100
    // 会话号（前端每次提交生成）：反馈/建议凭它挂到这张测试票上（后台流水三合一）
    const session = typeof req.body?.session === 'string' ? req.body.session.trim().slice(0, 40) : ''

    // 选项账本由代码算好（确定性），AI 按 prompt 第 3 章的判型规则使用，不自己重算
    const ledger = ledgerSummary(QUESTIONS, answers)
    const baseMessages = [
      { role: 'system', content: SYSTEM_PROMPT },          // 工作手册
      { role: 'user', content: JSON.stringify({ answers, ledger }) },
    ]
    let messages = baseMessages
    let report = null

    // 最多 3 次：每次验货，不合格就把"差评"和上次输出一起发回，让 AI 重写
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await callDeepSeek(messages, temperature)
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

    // 埋点记账：只记成功出报告的测试，只记数字（次数/类型/理由填写情况）。
    // 记账失败绝不能拦着报告——用户没做错任何事，悄悄记日志即可。
    try {
      await recordTest({ type: report.personality_type, filled, total: answers.length, session, margin: ledger.gap })
    } catch (err) {
      console.error('统计记账失败：', err.message)
    }

    res.json(report)
  } catch (err) {
    // 兜底：网络断、超时等，都落到这里
    res.status(500).json({ error: `分析失败：${err.message}` })
  }
})

// 反馈接口：报告页"对报告满意吗？"按钮。只记一个数字，不记任何个人内容
app.post('/api/feedback', async (req, res) => {
  const { type, agree } = req.body || {}
  if (typeof type !== 'string' || type.length === 0 || typeof agree !== 'boolean') {
    return res.status(400).json({ error: '反馈格式不对' })
  }
  // 会话号：反馈挂到对应测试票上（后台流水三合一）
  const session = typeof req.body?.session === 'string' ? req.body.session.trim().slice(0, 40) : ''
  try {
    await recordFeedback({ agree, session })
    res.json({ ok: true })
  } catch (err) {
    console.error('反馈记账失败：', err.message)
    res.status(500).json({ error: '反馈记录失败' })
  }
})

// 建议接口（2026-08-20 新增）：报告页的开放题。只存文字（≤500 字），
// 进明细票据、不做聚合；记账失败不拦用户（与反馈同一原则）。
app.post('/api/suggest', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 500) : ''
  if (!text) return res.status(400).json({ error: '建议内容不能为空' })
  // 会话号：建议挂到对应测试票上（后台流水三合一）
  const session = typeof req.body?.session === 'string' ? req.body.session.trim().slice(0, 40) : ''
  try {
    await recordSuggestion({ text, session })
    res.json({ ok: true })
  } catch (err) {
    console.error('建议记账失败：', err.message)
    res.status(500).json({ error: '建议提交失败' })
  }
})

// 统计接口：/stats 页面专用。都是聚合数字，但只有知道口令的人能看
app.get('/api/stats', async (req, res) => {
  if (!process.env.STATS_KEY) {
    return res.status(503).json({ error: '后台没配置统计口令（STATS_KEY）' })
  }
  if (req.query.key !== process.env.STATS_KEY) {
    return res.status(403).json({ error: '口令不对' })
  }
  try {
    const stats = await readStats()
    const events = await readEvents(50)
    res.json({
      ...stats,
      fillRate: stats.reasonTotal ? Math.round((stats.reasonFilled / stats.reasonTotal) * 100) : 0,
      events, // 明细流水：最近 50 张票，最新在前
    })
  } catch (err) {
    res.status(502).json({ error: `读取账本失败：${err.message}` })
  }
})

// 健康检查接口（放最后：5 扇门里最不重要，先读主门 /api/analyze 再看它）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

export default app
