// stats-store.js —— 统计账本的"仓库管理员"
// 对外只暴露 readStats / recordTest / recordFeedback / resetStats 四个函数，
// 其他代码不关心账本存在哪。两个仓库二选一（怎么选看 storageMode）：
//   1. 云端 Upstash Redis：serverless 函数"睡一觉就失忆"，本地文件靠不住，必须用云端仓库。
//      Redis 的 INCR 是"原子加一"——两个人同时记账也是排队执行，绝不互相覆盖
//      （旧 Blob 账本是"读旧账→+1→写回"三步，两人撞车就丢一笔，这是 2026-08-18
//      正式统计期丢数据的元凶）。每笔测试还会往明细列表里推一张"票据"
//      （时间+判型+理由数+分差），丢了账也能凭票对账。
//   2. 本地票据目录 server/.stats-events/：本地开发没配 Redis 时用。
//      每笔测试写一张独立小票（各写各的，同样没有互相覆盖的问题），读账时把票加总。
// 对外返回的结构不变（totalTests/types/reasonFilled/reasonTotal/feedback），前端无感。

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Redis } from '@upstash/redis'

const LOCAL_DIR = path.join(import.meta.dirname, '.stats-events') // 本地票据目录

// 空账本的样子（也是记账代码的"格式合同"）
const EMPTY = {
  totalTests: 0,
  types: {}, // { INTP: 5, ENFP: 3, ... }
  reasonFilled: 0,
  reasonTotal: 0,
  feedback: { like: 0, dislike: 0 },
}

// 账本代号：所有键都挂在这个前缀下。
// 想重启统计期（清零）= 改这个代号（v1 → v2 → …），新代号下没有旧账，天然从零开始。
// 旧账的键留在库里不碍事（占几十字节）；git 历史也会留下"重启统计期"的显式记录。
const LEDGER = 'stats:v1'

// Redis 键名约定：集中写在一处，想改不散落
const KEYS = {
  totalTests: `${LEDGER}:totalTests`,   // 数字：总测试次数
  types: `${LEDGER}:types`,             // HASH：类型 → 次数
  reasonFilled: `${LEDGER}:reasonFilled`, // 数字：填了理由的题数
  reasonTotal: `${LEDGER}:reasonTotal`,   // 数字：全部题数
  feedback: `${LEDGER}:feedback`,       // HASH：like/dislike → 次数
  events: `${LEDGER}:events`,           // LIST：每笔一张票据 JSON（明细流水）
}

let redisClient = null

// 决定账本放哪：
//   - 有 Redis 地址和钥匙 → 云端 Redis。两套变量名都认：
//     Vercel KV 集成会给 KV_REST_API_URL + KV_REST_API_TOKEN（KV 的底层就是 Upstash Redis）；
//     Upstash 集成会给 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN。
//   - 本地开发两者都没有 → 本地票据目录
//   - STATS_MODE=local 是本地开发常驻开关：即使 .env 里贴了 KV 变量（给 reset-stats.js
//     清线上账本用的），本地测试也永远记本地账本，不污染线上正式统计期。
//   - 在 Vercel 上却两者都没有 = 配置遗漏，宁可报错也不悄悄写"失忆文件"
function storageMode() {
  if (process.env.STATS_MODE === 'local') return 'local'
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) return 'redis'
  if (process.env.VERCEL) {
    throw new Error('部署在 Vercel 但没配 KV/Redis：去项目后台 Storage 里创建并连接到本项目')
  }
  return 'local'
}

// Redis 客户端只建一次，函数"睡醒"后重用（避免每次记账都重新握手）
function getRedis() {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redisClient
}

// ---- 本地模式：每笔一张小票 ----

function writeLocalTicket(ticket) {
  if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true })
  const file = path.join(LOCAL_DIR, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`)
  fs.writeFileSync(file, JSON.stringify(ticket))
}

function readLocalTickets() {
  if (!fs.existsSync(LOCAL_DIR)) return []
  return fs.readdirSync(LOCAL_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LOCAL_DIR, f), 'utf8')))
}

// ---- 记账接口（两个仓库共用同一套入口） ----

// 每笔测试记一笔：聚合数字 +1，明细列表推一张票（会话号：反馈/建议凭它挂靠，流水三合一）
// margin = 选项账本前两名分差（派生数字，非原文）：观察真实用户平手区占比的数据源
async function recordTest({ type, filled, total, session, margin }) {
  const ticket = {
    ts: Date.now(),
    type: 'test',
    personality_type: type,
    reasonFilled: filled,
    reasonTotal: total,
    margin: margin ?? null,
    session: session || '',
  }
  if (storageMode() === 'redis') {
    const redis = getRedis()
    // 说明：不做"失败自动重试"。INCR 这种命令若"已生效但响应丢了"，重试会把一次测试记成两次。
    // 宁可失败时大声报错（app.js 会打日志），也不让账本静默虚高。
    // multi = 把几条命令打包一次发出：一次网络往返，也缩小"记一半失败"的窗口。
    await redis.multi()
      .incr(KEYS.totalTests)
      .hincrby(KEYS.types, type, 1)
      .incrby(KEYS.reasonFilled, filled)
      .incrby(KEYS.reasonTotal, total)
      .rpush(KEYS.events, JSON.stringify(ticket))
      .exec()
    return
  }
  writeLocalTicket(ticket)
}

// 每笔反馈记一笔：只记喜欢/不喜欢两个数字（外加一张明细票，格式统一；带会话号挂靠测试票）
async function recordFeedback({ agree, session }) {
  const ticket = { ts: Date.now(), type: 'feedback', agree, session: session || '' }
  if (storageMode() === 'redis') {
    const redis = getRedis()
    await redis.multi()
      .hincrby(KEYS.feedback, agree ? 'like' : 'dislike', 1)
      .rpush(KEYS.events, JSON.stringify(ticket))
      .exec()
    return
  }
  writeLocalTicket(ticket)
}

// 每笔建议记一张明细票（开放题只进流水，不做聚合；带会话号挂靠测试票）
async function recordSuggestion({ text, session }) {
  const ticket = { ts: Date.now(), type: 'suggest', text, session: session || '' }
  if (storageMode() === 'redis') {
    const redis = getRedis()
    await redis.rpush(KEYS.events, JSON.stringify(ticket))
    return
  }
  writeLocalTicket(ticket)
}

// 读账：Redis 分支一次读出聚合键；本地分支把票加总
async function readStats() {
  if (storageMode() === 'redis') {
    const redis = getRedis()
    const [totalTests, types, reasonFilled, reasonTotal, feedback] = await Promise.all([
      redis.get(KEYS.totalTests),
      redis.hgetall(KEYS.types),
      redis.get(KEYS.reasonFilled),
      redis.get(KEYS.reasonTotal),
      redis.hgetall(KEYS.feedback),
    ])
    return {
      totalTests: Number(totalTests) || 0,
      types: types || {},
      reasonFilled: Number(reasonFilled) || 0,
      reasonTotal: Number(reasonTotal) || 0,
      feedback: { like: Number(feedback?.like) || 0, dislike: Number(feedback?.dislike) || 0 },
    }
  }
  const stats = structuredClone(EMPTY)
  for (const t of readLocalTickets()) {
    if (t.type === 'test') {
      stats.totalTests += 1
      stats.types[t.personality_type] = (stats.types[t.personality_type] || 0) + 1
      stats.reasonFilled += t.reasonFilled
      stats.reasonTotal += t.reasonTotal
    } else if (t.type === 'feedback') {
      stats.feedback[t.agree ? 'like' : 'dislike'] += 1
    }
  }
  return stats
}

// 读明细流水：最近 limit 张票，最新在前（统计页"实时记录"用）。
// 票据就是流水——每笔测试/反馈都存了一张票，这里只是把票翻出来给人看。
async function readEvents(limit = 50) {
  if (storageMode() === 'redis') {
    const redis = getRedis()
    // LRANGE -limit -1 取列表最后 limit 条（旧→新），再倒过来让最新在前。
    // 注意：KV 客户端有时把元素自动翻译成对象返回，有时原样返回字符串——
    // 两种都接住（字符串就 JSON.parse，对象直接用），不做假设。
    const raw = await redis.lrange(KEYS.events, -limit, -1)
    return raw.reverse().map((item) => (typeof item === 'string' ? JSON.parse(item) : item))
  }
  return readLocalTickets()
    .sort((a, b) => a.ts - b.ts)
    .slice(-limit)
    .reverse()
}

// 清零：统计期重启用（reset-stats.js 脚本调用）。
// target 显式指定清哪边：'redis' = 清线上，'local' = 清本地票据目录；不传则按 storageMode 自动判断。
// 旧 Blob 时代的 .stats-local.json 不再读取——本地账随票据制重新开始，旧文件只是历史遗留。
async function resetStats(target = storageMode()) {
  if (target === 'redis') {
    const redis = getRedis()
    await redis.del(KEYS.totalTests, KEYS.types, KEYS.reasonFilled, KEYS.reasonTotal, KEYS.feedback, KEYS.events)
    return
  }
  if (fs.existsSync(LOCAL_DIR)) fs.rmSync(LOCAL_DIR, { recursive: true, force: true })
}

export { readStats, readEvents, recordTest, recordFeedback, recordSuggestion, resetStats }
