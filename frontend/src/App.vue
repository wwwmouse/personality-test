<script setup>
import { ref, computed, watch } from 'vue'
import questions from './data/questions.json'
import QuestionItem from './components/QuestionItem.vue'
import ReportView from './components/ReportView.vue'
import StatsView from './components/StatsView.vue'
import OrbsBackground from './components/OrbsBackground.vue'

// 当前阶段：cover = 封面；answering = 答题中；analyzing = 分析中；result = 展示报告
const phase = ref('cover')

// 统计页捷径：访问 /stats 时走统计页，其余路径都走答题流程
const isStatsPage = window.location.pathname === '/stats'

// 全局背景浮标速度：封面慢速漂浮；进入答题/分析/报告后加速
const orbSpeed = computed(() => (phase.value === 'cover' ? 'slow' : 'fast'))

// 结果页高亮：只有报告判定的阳面四功能闪烁，其余浮标安静（表现"你的四大功能"）
const orbHighlight = computed(() =>
  phase.value === 'result' && report.value ? report.value.functions.map((f) => f.function) : null
)

// 分析中的等待文案轮播：每 4 秒换一句，让 10~20 秒的等待不无聊。
// 魔法盒子原则：只写用户体验，不泄露内部流程（不出现"调 API"之类）
const analyzingLines = [
  '小猫正在读你的二十个瞬间…',
  '小猫正在把你的理由折成纸飞机…',
  '小猫正在描摹你的功能图谱…',
  '小猫正在给报告盖上最后一枚印章…',
]
const analyzingText = ref(analyzingLines[0])
let analyzingTimer = null

// 分析中的"假进度"：按渐近曲线爬升（先快后慢），永远压在 94 以下，
// 结果回来瞬间跳到 100。真实信息只有"还没好/好了"，曲线让进度条不穿帮。
const analyzeProgress = ref(0)
// 小猫表情两帧轮换（🐱→😺→🐱），看起来像在眨眼
const catFaces = ['🐱', '😺']
const catFace = ref(catFaces[0])
let analyzeStart = 0
let analyzeTimer = null
let catTimer = null

watch(phase, (p) => {
  clearInterval(analyzingTimer)
  clearInterval(analyzeTimer)
  clearInterval(catTimer)
  if (p === 'analyzing') {
    analyzeStart = Date.now()
    analyzeProgress.value = 0
    analyzingText.value = analyzingLines[0]
    analyzingTimer = setInterval(() => {
      const next = (analyzingLines.indexOf(analyzingText.value) + 1) % analyzingLines.length
      analyzingText.value = analyzingLines[next]
    }, 4000)
    analyzeTimer = setInterval(() => {
      const elapsed = (Date.now() - analyzeStart) / 1000
      const base = 92 * (1 - Math.exp(-elapsed / 8)) // 渐近爬向 92：8 秒过 58%、20 秒过 84%
      const wiggle = Math.sin(elapsed * 2.2) * 1.2    // 轻微蠕动，看起来"活着"
      analyzeProgress.value = Math.min(94, base + wiggle)
    }, 200)
    catTimer = setInterval(() => {
      catFace.value = catFaces[(catFaces.indexOf(catFace.value) + 1) % catFaces.length]
    }, 900)
  } else if (p === 'result') {
    analyzeProgress.value = 100 // 结果回来的瞬间满条
  }
})

// 报告回看：上次的完整报告存在浏览器本地（localStorage），封面给"查看上次报告"入口
// 这样看完报告关掉页面，也不用重新答一遍题
const hasSavedReport = ref(localStorage.getItem('last-report') !== null)

// 会话号：每次提交生成一个，反馈/建议凭它挂到这张测试票上（后台流水三合一）
const sessionId = ref('')

function viewSavedReport() {
  try {
    report.value = JSON.parse(localStorage.getItem('last-report'))
    phase.value = 'result'
  } catch {
    hasSavedReport.value = false
  }
}

// 真报告存放处（阶段 3 起由后端 /api/analyze 生成，不再用假数据）
const report = ref(null)

// 分析失败时的错误信息（'' = 没出过错）
const errorMessage = ref('')

// 答题进度：已选题数 → 进度条百分比
const answeredCount = computed(() => questions.filter((q) => answers.value[q.id].choice).length)
const progressPct = computed(() => Math.round((answeredCount.value / questions.length) * 100))

// 所有题的答案容器，提前初始化好，形如：
// { q1: { choice: '', reason: '' }, q2: {...}, ... }
const answers = ref(
  Object.fromEntries(questions.map((q) => [q.id, { choice: '', reason: '' }]))
)

// 把页面收集的答案整理成后端要的格式（见 docs/prompt.md 第 2 章）
function buildPayload() {
  return questions.map((q) => {
    const a = answers.value[q.id]
    const option = q.options.find((o) => o.key === a.choice)
    return {
      id: q.id,
      question: q.text,
      choice: a.choice,
      choice_text: option.text,
      reason: a.reason.trim(),
    }
  })
}

// 点击"生成我的报告"：检查每题都选了、核心题理由填了 → 发给后端 → 展示真报告
async function handleSubmit() {
  const missing = questions.find((q) => !answers.value[q.id].choice)
  if (missing) {
    alert(`第 ${missing.id.slice(1)} 题还没选哦`)
    return
  }
  const needReason = questions.find((q) => q.core && !answers.value[q.id].reason.trim())
  if (needReason) {
    alert(`第 ${needReason.id.slice(1)} 题是核心题，理由不能空——你的理由会写进报告，别让它空着`)
    return
  }

  errorMessage.value = ''
  sessionId.value =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  phase.value = 'analyzing'
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: buildPayload(), session: sessionId.value }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    report.value = data
    try {
      localStorage.setItem('last-report', JSON.stringify(data))
      localStorage.setItem('last-session', sessionId.value)
      // 新报告 = 新的反馈机会：作废上一份报告的"已反馈/已建议"戳
      localStorage.removeItem('feedback-done')
      localStorage.removeItem('suggest-done')
    } catch {
      // 浏览器不让存（隐私模式等）：不影响看报告，只影响下次回看
    }
    phase.value = 'result'
  } catch (err) {
    // 失败：进入专门的失败页，答案都保留着，用户可重试或返回修改
    errorMessage.value = err.message
    phase.value = 'error'
  }
}

// 再测一次：清空所有答案，回到答题页
function handleRestart() {
  for (const q of questions) {
    answers.value[q.id] = { choice: '', reason: '' }
  }
  report.value = null
  phase.value = 'answering'
}
</script>

<template>
  <div class="page">
    <!-- 全局背景：八维浮标（封面慢速全闪，答题/报告加速全闪，结果页只闪阳面四功能） -->
    <OrbsBackground :speed="orbSpeed" :highlight="orbHighlight" />
    <header v-if="phase !== 'cover'" class="site-header">
      <h1>不止于MBTI</h1>
    </header>

    <!-- 统计页：/stats 专属（口令门在 StatsView 里） -->
    <main v-if="isStatsPage" class="container">
      <StatsView />
    </main>

    <!-- 封面：第一印象页，别一进门就是题目 -->
    <main v-else-if="phase === 'cover'" class="container">
      <div class="cover">
        <div class="cover-inner">
          <p class="cover-badge">MBTI人格测试</p>
          <h1 class="cover-title">不止于MBTI</h1>
          <p class="cover-tagline">你比认识中的自己更……</p>
          <div class="cover-intros">
            <p class="cover-lead">你，远比四个字母复杂。</p>
            <p class="cover-intro">
              MBTI 的根基是荣格的心理类型理论：它把人的内心活动拆成八种认知功能——思维、情感、感觉、直觉，各自又有向内与向外的方向。<br />
              这八种功能人皆有之，但调用倾向与意识归属却大相径庭，故而分为阳面与阴影：<br />
              阳面功能是流淌于日常与自我间的本能力量。<br />
              阴影功能是隐藏在压力与成长中的终生课题。
            </p>
            <p class="cover-intro">
              通过 20 道情境题，本测验会尝试还原测试者的功能排序，并反馈：习惯怎样思考、为什么会被某些场景触动、压力来临时本能地做什么。它不是给人贴标签，而是一面镜子——照出那些"我说不清为什么，但我就是这样"的部分。认识功能，是为了更好地与自己相处，也更好地理解身边那些与自己不同的人。
            </p>
          </div>
          <ol class="cover-tips">
            <li>每题下方都有理由框：相同的选择、不同的动机，反映的是两个不同的灵魂。</li>
            <li>本测验旨在为使用者提供认识自己的方式，不附带任何明确建议与判断</li>
            <li>如果再难相遇，祝您早安，午安，晚安^^</li>
          </ol>
          <p class="cover-meta">20 道情景题 · 约 6 分钟</p>
          <button class="cover-start" @click="phase = 'answering'">开始测试</button>
          <button v-if="hasSavedReport" class="restart-btn cover-replay" @click="viewSavedReport">查看上次报告</button>
        </div>
      </div>
    </main>

    <!-- 答题阶段：用 v-for 把 20 道题依次渲染出来 -->
    <main v-else-if="phase === 'answering'" class="container">
      <div class="progress-wrap">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>
        <span class="progress-text">{{ answeredCount }} / {{ questions.length }}</span>
      </div>
      <QuestionItem
        v-for="(q, i) in questions"
        :key="q.id"
        :question="q"
        :index="i + 1"
        :answer="answers[q.id]"
      />
      <button class="submit-btn" @click="handleSubmit">生成我的报告 ✨</button>
    </main>

    <!-- 分析阶段：10~20 秒的等待。小猫踱步/眨眼 + 假进度条 + 轮播文案 + 跳动的小点 -->
    <main v-else-if="phase === 'analyzing'" class="container">
      <div class="analyzing">
        <div class="cat-stage">
          <span class="cat-emoji">{{ catFace }}</span>
          <span class="cat-shadow"></span>
        </div>
        <div class="analyze-progress">
          <div class="analyze-progress-fill" :style="{ width: analyzeProgress + '%' }"></div>
        </div>
        <p class="analyzing-text" :key="analyzingText">{{ analyzingText }}</p>
        <p class="analyzing-dots"><span>·</span><span>·</span><span>·</span></p>
      </div>
    </main>

    <!-- 失败阶段：如实告诉用户发生了什么，并给出路 -->
    <main v-else-if="phase === 'error'" class="container">
      <div class="error-box">
        <p class="error-title">😵 分析没成功</p>
        <p class="error-msg">{{ errorMessage }}</p>
        <p class="error-hint">你的 20 题答案都还留着——重试，或返回改答案。</p>
        <div class="error-actions">
          <button class="submit-btn" @click="handleSubmit">🔄 重试一次</button>
          <button class="restart-btn" @click="phase = 'answering'">返回修改答案</button>
        </div>
      </div>
    </main>

    <!-- 报告阶段：展示后端生成的真实报告 -->
    <main v-else class="container">
      <ReportView :report="report" />
      <button class="restart-btn" @click="handleRestart">再测一次</button>
    </main>
  </div>
</template>

<style scoped>
.analyzing {
  text-align: center;
  padding: 60px 20px 80px;
  font-size: 1.2rem;
  color: #666;
}

/* 小猫舞台：emoji 左右踱步，影子跟着伸缩，像猫在台子上走 */
.cat-stage {
  width: 88px;
  margin: 0 auto 22px;
}

.cat-emoji {
  display: block;
  font-size: 3.2rem;
  line-height: 1;
  animation: cat-walk 2.6s ease-in-out infinite;
}

.cat-shadow {
  display: block;
  width: 38px;
  height: 6px;
  margin: 8px auto 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
  animation: cat-shadow 2.6s ease-in-out infinite;
}

@keyframes cat-walk {
  0%,
  100% {
    transform: translateX(-14px);
  }
  50% {
    transform: translateX(14px);
  }
}

@keyframes cat-shadow {
  0%,
  100% {
    transform: scaleX(1);
    opacity: 0.45;
  }
  50% {
    transform: scaleX(0.55);
    opacity: 0.2;
  }
}

/* 假进度条：渐近爬升的填充 + 蓝青渐变，与八维品牌色一致 */
.analyze-progress {
  width: min(320px, 70vw);
  height: 6px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.analyze-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #38bdf8, #4ecdc4);
  transition: width 0.3s ease;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.error-box {
  max-width: 520px;
  margin: 60px auto;
  padding: 32px;
  text-align: center;
  border: 1px solid #f0d4d4;
  border-radius: 12px;
  background: #fff7f7;
}
.error-title {
  margin: 0 0 12px;
  font-size: 1.3rem;
  font-weight: 600;
}
.error-msg {
  margin: 0 0 8px;
  color: #c0392b;
  word-break: break-all;
}
.error-hint {
  margin: 0 0 20px;
  color: #888;
  font-size: 0.95rem;
}
.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
