# 不止于MBTI · 人格测试

> 你，远比四个字母复杂。

一个完整的 AI 应用练手项目：用户答 20 道情境题（选项 + 理由），AI 依据荣格认知功能理论（毕比模型）生成专属 MBTI 人格报告。

**线上地址：https://sherrymouse.top**

## 当前版本

| 版本线 | 当前 | 标注位置 |
|---|---|---|
| 项目 | **v0.2.0** | `package.json` |
| 题库（题目） | **v2.1** | `docs/type-eval.md` 成绩单（沿革见 git 提交记录） |
| 报告结构 | **v2.1** | `docs/product-spec.md` 第 4 节 |
| Prompt（工作手册） | **v2.2** | `docs/prompt.md` 标题 |

## 功能

- 20 道情境题（15 阳面 + 5 阴影），每题附理由框——理由会显著影响报告质量
- AI 生成完整人格报告：四字母判型、八维功能解读与评分、优势与盲点、压力篇、类型配对、金句
- 后端"验货重写"：报告按格式合同逐项校验，不合格自动退回重写（最多 3 次）
- 暗黑霓虹视觉：八维浮标背景、报告光效（英雄→阿尼玛四档递减）、荧光评分条
- 使用统计（测试次数 / 类型分布 / 理由填写率 / 反馈）+ 口令保护的 `/stats` 统计页
- 报告分享：复制文案、保存截图
- 隐私红线：只存聚合数字，不保存任何答案与理由原文

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite |
| 后端 | Express 5（本地）/ Vercel Serverless Functions（线上，共用同一份 app.js） |
| AI | DeepSeek chat API |
| 存储 | Vercel Blob（统计账本，私密仓库） |
| 部署 | Vercel（GitHub push 自动部署）+ 自有域名 |

## 本地开发

```bash
# 后端（终端 1）
cd server
npm install
npm run dev          # 需要 server/.env：DEEPSEEK_API_KEY、STATS_KEY（模板见 .env.example）

# 前端（终端 2）
cd frontend
npm install
npm run dev          # http://localhost:5173，/api 由 Vite 代理转给 3001 后端
```

命令行试飞（不经过前端直接测后端）：`cd server && npm run test:analyze`

## 部署

1. Vercel 导入本仓库：Build Command 用默认 `npm run build`，Output Directory 填 `frontend/dist`
2. 环境变量：`DEEPSEEK_API_KEY`、`STATS_KEY`；在 Storage 里创建 Blob 存储（凭据自动注入）
3. 每次 push 到 main 自动部署

## 文档

- `docs/product-spec.md` 产品说明书（玩法、题目、报告结构、里程碑）
- `docs/prompt.md` AI 工作手册（系统提示词）
- `docs/architecture.md` 系统解剖（架构与运作原理）
- `docs/recap.md` 项目全流程总结（从想法到上线的完整复盘）
- `docs/type-eval.md` 判型公平性成绩单（16 型回归实验）

## 隐私

统计系统只记录聚合数字（测试次数、类型分布、理由填写率、反馈计数），不保存答案、理由等任何原文；账本存放在私密 Blob 仓库中，只有带凭据的后端可读写。
