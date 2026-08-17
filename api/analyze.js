// api/analyze.js —— Vercel 的"叫醒入口"
// Vercel 规矩：api/ 文件夹里每个文件 = 一个网址，这个文件对应 https://站点/api/analyze
// 它自己不干活，只做一件事：把后端的"菜谱"（server/app.js）递给 Vercel。
// 有人访问时才醒来，执行完继续睡——这就是 serverless（无服务器）的"来客才醒"。
import app from '../server/app.js'

export default app
