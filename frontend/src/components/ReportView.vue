<script setup>
// 报告展示组件：把报告 JSON 渲染成页面
// 报告结构见 docs/product-spec.md 第 4 节
defineProps({
  report: { type: Object, required: true },
})
</script>

<template>
  <div class="report">
    <!-- 1. 四字母 + 别称 -->
    <div class="type-badge">
      <span class="type-letters">{{ report.personality_type }}</span>
      <span class="type-name">· {{ report.type_name }}</span>
    </div>

    <!-- 2. 金句 + 人格描述 -->
    <p class="punchline">{{ report.punchline }}</p>
    <p class="description">{{ report.description }}</p>

    <!-- 3. 八维功能解读 -->
    <section class="report-section">
      <h2>你的功能配置</h2>
      <div class="function-item" v-for="f in report.functions" :key="f.position">
        <div class="function-head">
          <span class="f-name">{{ f.function }}</span>
          <span class="f-score">{{ f.score }}</span>
        </div>
        <span class="f-position">{{ f.position }}</span>
        <div class="score-track" :title="`${f.function} 使用强度 ${f.score}`">
          <div class="score-fill" :style="{ width: f.score + '%' }"></div>
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
  </div>
</template>
