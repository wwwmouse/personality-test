// stats-store.js —— 统计账本的"仓库管理员"
// 对外只暴露 readStats / writeStats 两个函数，其他代码不关心账本存在哪。
// 两个仓库二选一（怎么选看 storageMode）：
//   1. 云端 Vercel Blob：serverless 函数"睡一觉就失忆"，本地文件靠不住，必须用云端仓库
//   2. 本地文件 server/.stats-local.json：本地开发没配 Blob 令牌时用，方便测试
// 将来想换 Redis 等别的仓库，只改这一个文件。
import fs from 'node:fs'
import path from 'node:path'
import { put, list, get } from '@vercel/blob'

const BLOB_PATH = 'stats.json' // 云端账本的文件名
const LOCAL_FILE = path.join(import.meta.dirname, '.stats-local.json') // 本地账本

// 空账本的样子（也是记账代码的"格式合同"）
const EMPTY = {
  totalTests: 0,
  types: {}, // { INTP: 5, ENFP: 3, ... }
  reasonFilled: 0,
  reasonTotal: 0,
  feedback: { like: 0, dislike: 0 },
}

// 决定账本放哪：
//   - 有 Blob 令牌（BLOB_READ_WRITE_TOKEN）或 Blob 身份牌（BLOB_STORE_ID）→ 云端。
//     新版 Vercel Blob 在函数里用 OIDC 自动认证：运行时发短效令牌，SDK 自己接住，
//     所以云端只需要 BLOB_STORE_ID，不需要手抄长令牌
//   - 本地开发两者都没有 → 本地文件
//   - 在 Vercel 上却两者都没有 = 配置遗漏，宁可报错也不悄悄写"失忆文件"
function storageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return 'blob'
  if (process.env.VERCEL) {
    throw new Error('部署在 Vercel 但没配 Blob 存储：去项目后台 Storage 里创建并连接到本项目')
  }
  return 'local'
}

// 已知短板：读→改→写不是原子的，同一瞬间两个测试同时记账可能互相覆盖。
// 练手流量下可以忽略；将来流量大了换 Redis（INCR 天然原子）——那时也只改这一个文件。
async function readStats() {
  if (storageMode() === 'blob') {
    // 仓库是私密的：list 用 SDK 鉴权没问题，但"拿到网址直接 fetch"行不通
    // （私密文件的网址不带通行证打不开）。读文件要用 SDK 的 get()，它自带通行证。
    const { blobs } = await list({ prefix: BLOB_PATH })
    if (blobs.length === 0) return structuredClone(EMPTY)
    const res = await get(BLOB_PATH, { access: 'private' })
    return JSON.parse(await new Response(res.stream).text())
  }
  if (!fs.existsSync(LOCAL_FILE)) return structuredClone(EMPTY)
  return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'))
}

async function writeStats(stats) {
  if (storageMode() === 'blob') {
    await put(BLOB_PATH, JSON.stringify(stats, null, 2), {
      access: 'private',        // 仓库是私密的：账本只有带通行证的后端自己能碰
      contentType: 'application/json',
      allowOverwrite: true,     // 覆盖写：账本始终只有一个，路径固定
    })
    return
  }
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(stats, null, 2))
}

export { readStats, writeStats }
