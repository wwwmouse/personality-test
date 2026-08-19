// test-analyze.js —— 不经过前端，直接测后端的"试飞员"脚本
// 用法：终端 1 跑 npm run dev 启动后端；终端 2 跑 node test-analyze.js [答案文件]
// 默认读 docs/test-input.json；也可指定别的答案文件（如 ../docs/test-input-sparse.json）
// 作用：把 20 题答案发给 /api/analyze，打印 AI 报告

import fs from 'node:fs'

const inputPath = process.argv[2] || '../docs/test-input.json'
const answers = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

const startedAt = Date.now()
const res = await fetch('http://localhost:3001/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ answers }),
})

const result = await res.json()
console.log(`HTTP ${res.status} ｜ 耗时 ${Date.now() - startedAt}ms`)
console.log(JSON.stringify(result, null, 2))
