<script setup>
import { ref } from 'vue'
import questions from './data/questions.json'
import sampleReport from './data/sample-report.json'
import QuestionItem from './components/QuestionItem.vue'
import ReportView from './components/ReportView.vue'

// 当前阶段：answering = 答题中；result = 展示报告
const phase = ref('answering')

// 所有题的答案容器，提前初始化好，形如：
// { q1: { choice: '', reason: '' }, q2: {...}, ... }
const answers = ref(
  Object.fromEntries(questions.map((q) => [q.id, { choice: '', reason: '' }]))
)

// 点击"生成我的报告"：先检查每题都选了，再切换到报告页
function handleSubmit() {
  const missing = questions.find((q) => !answers.value[q.id].choice)
  if (missing) {
    alert(`第 ${missing.id.slice(1)} 题还没选哦`)
    return
  }
  phase.value = 'result'
}

// 再测一次：清空所有答案，回到答题页
function handleRestart() {
  for (const q of questions) {
    answers.value[q.id] = { choice: '', reason: '' }
  }
  phase.value = 'answering'
}
</script>

<template>
  <div class="page">
    <header class="site-header">
      <h1>人格小测试</h1>
      <p class="subtitle">10 道情景题 · 看看你是谁</p>
    </header>

    <!-- 答题阶段：用 v-for 把 10 道题依次渲染出来 -->
    <main v-if="phase === 'answering'" class="container">
      <QuestionItem
        v-for="(q, i) in questions"
        :key="q.id"
        :question="q"
        :index="i + 1"
        :answer="answers[q.id]"
      />
      <button class="submit-btn" @click="handleSubmit">生成我的报告 ✨</button>
    </main>

    <!-- 报告阶段：目前用假数据 sample-report.json 渲染，阶段 3 换成真接口 -->
    <main v-else class="container">
      <ReportView :report="sampleReport" />
      <button class="restart-btn" @click="handleRestart">再测一次</button>
    </main>
  </div>
</template>
