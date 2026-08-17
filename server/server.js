// server.js —— 本地开发入口：把"菜谱"（app.js）端出来，在 3001 端口开一家常开的店
// 线上部署不走这里，Vercel 用的是根目录的 api/analyze.js
import app from './app.js'

const PORT = 3001

app.listen(PORT, () => {
  console.log(`后端已启动：http://localhost:3001`)
})
