<script setup>
import { ref, computed } from 'vue'

// 报告展示组件：把报告 JSON 渲染成页面
// 报告结构见 docs/product-spec.md 第 4 节
const props = defineProps({
  report: { type: Object, required: true },
})

// 八维缩写 → 中文全称字典。确定性内容写死在代码里，不交给 AI 输出
const FUNCTION_CN = {
  Ti: '内倾思维',
  Te: '外倾思维',
  Fi: '内倾情感',
  Fe: '外倾情感',
  Si: '内倾感觉',
  Se: '外倾感觉',
  Ni: '内倾直觉',
  Ne: '外倾直觉',
}

// 八维 → 品牌色（与背景浮标同源）。glow 是 rgba 前缀，拼上透明度用
const FUNCTION_COLORS = {
  Ti: { hex: '#74C0FC', glow: 'rgba(116,192,252,' },
  Te: { hex: '#1A535C', glow: 'rgba(26,83,92,' },
  Fi: { hex: '#E63946', glow: 'rgba(230,57,70,' },
  Fe: { hex: '#FFC0B6', glow: 'rgba(255,192,182,' },
  Si: { hex: '#BB9457', glow: 'rgba(187,148,87,' },
  Se: { hex: '#FF9F1C', glow: 'rgba(255,159,28,' },
  Ni: { hex: '#6A4C93', glow: 'rgba(106,76,147,' },
  Ne: { hex: '#4ECDC4', glow: 'rgba(78,205,196,' },
}

// 四个位置的"光"亮度：英雄最强 → 阿尼玛/阿尼姆斯最弱（表现重要程度递减）
const GLOW_STRENGTH = [0.9, 0.6, 0.38, 0.18]

function fnColor(fn) {
  return FUNCTION_COLORS[fn] || { hex: '#38bdf8', glow: 'rgba(56,189,248,' }
}

// 整体人格强度 = 阳面四维评分的算术平均数
const totalScore = computed(() => {
  const scores = props.report.functions.map((f) => f.score)
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

// 反馈按钮状态：'' = 还没点；'like'/'dislike' = 已记录
const feedbackState = ref('')
const feedbackLoading = ref(false)

async function sendFeedback(agree) {
  if (feedbackState.value || feedbackLoading.value) return
  feedbackLoading.value = true
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: props.report.personality_type, agree }),
    })
    if (!res.ok) throw new Error()
    feedbackState.value = agree ? 'like' : 'dislike'
  } catch {
    // 记录失败：不打扰用户（按钮悄悄回来，可以再点），错误只留在服务器日志
    console.error('反馈记录失败')
  } finally {
    feedbackLoading.value = false
  }
}
</script>

<template>
  <div class="report">
    <!-- 1. 四字母 + 别称 -->
    <div class="type-badge">
      <span class="type-letters">{{ report.personality_type }}</span>
      <span class="type-name">· {{ report.type_name }}</span>
    </div>

    <!-- 1.5 整体人格强度：阳面四维的平均分 -->
    <div class="total-score">
      <div class="total-score-head">
        <span class="total-score-num">{{ totalScore }}</span>
        <span class="total-score-label">整体人格强度</span>
      </div>
      <div class="total-track">
        <div class="total-fill" :style="{ width: totalScore + '%' }"></div>
      </div>
    </div>

    <!-- 2. 金句 + 人格描述 -->
    <p class="punchline">{{ report.punchline }}</p>
    <p class="description">{{ report.description }}</p>

    <!-- 3. 八维功能解读（四功能亮度递减光效） -->
    <section class="report-section">
      <h2>你的功能配置</h2>
      <div
        class="function-item"
        v-for="(f, i) in report.functions"
        :key="f.position"
        :style="{
          borderColor: fnColor(f.function).hex + '66',
          boxShadow: `0 0 ${8 + GLOW_STRENGTH[i] * 22}px ${fnColor(f.function).glow}${GLOW_STRENGTH[i]})`,
        }"
      >
        <div class="function-head">
          <span class="f-name" :style="{ color: fnColor(f.function).hex }">{{ f.function }}：{{ FUNCTION_CN[f.function] || '未知功能' }}</span>
          <span class="f-score" :style="{ color: fnColor(f.function).hex }">{{ f.score }}</span>
        </div>
        <span class="f-position">{{ f.position }}</span>
        <div class="score-track" :title="`${f.function} 使用强度 ${f.score}`">
          <div
            class="score-fill"
            :style="{ width: f.score + '%', background: fnColor(f.function).hex, '--fill': fnColor(f.function).hex }"
          ></div>
        </div>
        <p class="f-insight">{{ f.insight }}</p>
      </div>
    </section>

    <!-- 4. 优势与盲点 -->
    <section class="report-section">
      <h2>优势</h2>
      <ul>
        <li v-for="(s, i) in report.strengths" :key="i">{{ s }}</li>
      </ul>
    </section>
    <section class="report-section">
      <h2>盲点</h2>
      <ul>
        <li v-for="(b, i) in report.blind_spots" :key="i">{{ b }}</li>
      </ul>
    </section>

    <!-- 5. 压力下的你 + 类型配对（v2 新增） -->
    <section class="report-section">
      <h2>压力下的你</h2>
      <p class="pressure-label">高压之下</p>
      <p class="pressure-text">{{ report.under_pressure[0] }}</p>
      <p class="pressure-label">风暴过后</p>
      <p class="pressure-text">{{ report.under_pressure[1] }}</p>
    </section>
    <section class="report-section">
      <h2>类型配对</h2>
      <p>{{ report.type_matches }}</p>
    </section>

    <!-- 6. 免责声明 -->
    <p class="disclaimer">{{ report.disclaimer }}</p>

    <!-- 7. 反馈：只记一个数字，不记任何个人内容 -->
    <section class="feedback-box">
      <p class="feedback-title">对报告满意吗？</p>
      <template v-if="!feedbackState">
        <button class="feedback-btn" :disabled="feedbackLoading" @click="sendFeedback(true)">满意</button>
        <button class="feedback-btn" :disabled="feedbackLoading" @click="sendFeedback(false)">不满意</button>
      </template>
      <p v-else-if="feedbackState === 'like'" class="feedback-done">谢谢喵^^</p>
      <p v-else class="feedback-done">对不起喵……QAQ</p>
    </section>
  </div>
</template>
