<script setup>
// 全局背景浮标：八个认知功能符号带各自颜色，在全屏漂移 + 闪烁。
// speed：'slow'（封面，慢速）/ 'fast'（答题、分析、报告，加速）
// highlight：传入数组（如 ['Ti','Ne','Si','Fe']）时进入"高亮模式"：
//   只有这些功能闪烁，其余浮标安静变暗——结果页用它让"阳面四功能"发光
// 位置和节奏用序号公式确定性生成（不用随机数，保证每次刷新布局一致）
const props = defineProps({
  speed: { type: String, default: 'slow' },
  highlight: { type: Array, default: null },
})

// 八维 → 品牌色（用户定稿 2026-08-17）
const COLORS = {
  Ni: '#6A4C93',
  Ne: '#4ECDC4',
  Si: '#BB9457',
  Se: '#FF9F1C',
  Ti: '#74C0FC',
  Te: '#1A535C',
  Fi: '#E63946',
  Fe: '#FFC0B6',
}

const KEYS = Object.keys(COLORS)
const orbs = []

// 每种功能 6 个浮标，共 48 个，散布全屏
KEYS.forEach((fn, fi) => {
  for (let k = 0; k < 6; k++) {
    const i = fi * 6 + k
    orbs.push({
      fn,
      color: COLORS[fn],
      left: `${((fi * 7 + k * 15) % 90) + 3}%`,
      top: `${((fi * 9 + k * 13) % 84) + 4}%`,
      delay: `${(i * 0.9) % 8}s`,
      blinkDelay: `${(i * 0.55) % 3}s`,
      variant: i % 4,
    })
  }
})
</script>

<template>
  <div class="orbs-layer" :class="['orbs-' + speed, { 'orbs-highlight': highlight }]" aria-hidden="true">
    <span
      v-for="orb in orbs"
      :key="orb.fn + orb.left + orb.top"
      class="orb"
      :class="['orb-v' + orb.variant, { 'orb-glow': highlight && highlight.includes(orb.fn) }]"
      :style="{
        left: orb.left,
        top: orb.top,
        color: orb.color,
        '--delay': orb.delay,
        '--blink-delay': orb.blinkDelay,
      }"
    >{{ orb.fn }}</span>
  </div>
</template>
