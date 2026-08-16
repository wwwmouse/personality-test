// server.js —— 人格测试网站的后端
// 职责：收前端提交的 10 题答案 → 调 DeepSeek 分析 → 返回报告 JSON
// 3.2 版：/api/analyze 真实调用 DeepSeek；key 从环境变量读，不进代码

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

const app = express()
const PORT = 3001

// 中间件：自动把请求体（body）里的 JSON 解析成 JS 对象，挂到 req.body 上
app.use(express.json())

// 启动时读一次"AI 工作手册"（docs/prompt.md 全文），当作 system prompt 备用
const promptPath = path.join(import.meta.dirname, '..', 'docs', 'prompt.md')
const SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf8')

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 分析接口：前端把答案发到这里，这里负责跟 DeepSeek 对话
app.post('/api/analyze', async (req, res) => {
  const answers = req.body?.answers

  // 第一道防线：答案格式不对，直接拒绝（400 = "你的请求有问题"）
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'answers 必须是题目答案数组' })
  }

  // 第二道防线：key 没配（.env 没建或没填），给出明确提示
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: '后端没读到 DEEPSEEK_API_KEY，检查 server/.env' })
  }

  try {
    // 调 DeepSeek。用的是 OpenAI 兼容格式：绝大多数国产/国外模型 API 都长这样
    const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },          // 工作手册
          { role: 'user', content: JSON.stringify(answers) },  // 用户的 10 题答案
        ],
        temperature: 0.8,                            // 0=刻板 1=跳脱，0.8 给报告留点文采
        response_format: { type: 'json_object' },    // 让 AI 只吐 JSON，方便我们解析
      }),
      signal: AbortSignal.timeout(60_000),           // 60 秒没回就放弃，避免无限等待
    })

    // AI 服务端出问题：把状态码翻译成人话，而不是甩给用户一串数字
    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      const hints = {
        401: 'API key 无效，检查 server/.env 里的 key 是否正确',
        402: 'DeepSeek 账户余额不足，去开放平台充值',
        429: '请求太频繁，稍等几秒再试',
      }
      const friendly = hints[aiResponse.status] || `DeepSeek 出错了（${aiResponse.status}）：${errText.slice(0, 200)}`
      return res.status(502).json({ error: friendly })
    }

    // 成功路径：取回 AI 的 JSON 报告，原样转给前端
    const data = await aiResponse.json()
    const report = JSON.parse(data.choices[0].message.content)
    res.json(report)
  } catch (err) {
    // 兜底：网络断、超时、AI 回了非 JSON 等，都落到这里
    res.status(500).json({ error: `分析失败：${err.message}` })
  }
})

app.listen(PORT, () => {
  console.log(`后端已启动：http://localhost:3001`)
})
