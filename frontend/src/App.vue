<script setup>
import { ref, computed } from 'vue'
import questions from './data/questions.json'
import QuestionItem from './components/QuestionItem.vue'
import ReportView from './components/ReportView.vue'

// 当前阶段：answering = 答题中；analyzing = 分析中；result = 展示报告
const phase = ref('answering')

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
  phase.value = 'analyzing'
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: buildPayload() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    report.value = data
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
    <header class="site-header">
      <h1>不止于MBTI</h1>
      <p class="subtitle">20 道情景题 · 你的理由，会写进只属于你的报告</p>
    </header>

    <!-- 答题阶段：用 v-for 把 20 道题依次渲染出来 -->
    <main v-if="phase === 'answering'" class="container">
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

    <!-- 分析阶段：要读 5~10 秒，给用户一个等待反馈 -->
    <main v-else-if="phase === 'analyzing'" class="container">
      <p class="analyzing">🤔 正在解读你的二十个瞬间…（约 10~20 秒）</p>
    </main>

    <!-- 失败阶段：如实告诉用户发生了什么，并给出路 -->
    <main v-else-if="phase === 'error'" class="container">
      <div class="error-box">
        <p class="error-title">😵 分析没成功</p>
        <p class="error-msg">{{ errorMessage }}</p>
        <p class="error-hint">你的 10 题答案都还留着——重试，或返回改答案。</p>
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
  padding: 80px 20px;
  font-size: 1.2rem;
  color: #666;
  animation: pulse 1.5s ease-in-out infinite;
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
