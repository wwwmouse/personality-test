// reset-stats.js —— 统计期清零工具
// 用法（在 server/ 目录下）：
//   node --env-file-if-exists=.env reset-stats.js --yes   清线上账本（.env 里要有 KV 变量）
//   node --env-file-if-exists=.env reset-stats.js --local 清本地票据目录
// 清线上必须显式带 --yes：宁可多敲一个参数，也不手滑误删正式账本。
import { resetStats } from './stats-store.js'

const target = process.argv.includes('--local') ? 'local' : 'redis'

if (target === 'redis') {
  if (!process.argv.includes('--yes')) {
    console.error('清线上账本必须带 --yes 确认：node reset-stats.js --yes')
    console.error('（只想清本地票据目录：node reset-stats.js --local）')
    process.exit(1)
  }
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error('本地 .env 里没有 KV 变量：去 Vercel 后台 Settings → Environment Variables 复制')
    console.error('KV_REST_API_URL 和 KV_REST_API_TOKEN，贴进 server/.env（该文件已被 git 忽略）')
    process.exit(1)
  }
}

await resetStats(target)
console.log(target === 'redis' ? '线上账本已清零 ✅ 统计期从零重新开跑' : '本地票据目录已清空 ✅')
