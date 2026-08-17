<script setup>
import { computed } from 'vue'

// 全局背景浮标：八个认知功能符号带各自颜色，在屏幕左右两侧边带漂移 + 闪烁。
// speed：'slow'（封面，慢速）/ 'fast'（答题、分析、报告，加速）
// highlight：传入数组（如 ['Ti','Ne','Si','Fe']）时进入"高亮模式"（结果页）：
//   只渲染阳面四功能（阴面直接移除），放大 + 按位置四档常亮（英雄最亮 → 阿尼玛最暗）
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

// 默认模式：每种 6 个共 48 个，只分布在左右两侧边带（中央阅读区保持干净）
const orbs = []
KEYS.forEach((fn, fi) => {
  for (let k = 0; k < 6; k++) {
    const i = fi * 6 + k
    const onLeft = k % 2 === 0
    orbs.push({
      fn,
      color: COLORS[fn],
      left: onLeft
        ? `${2 + (fi % 3) * 3 + (k % 3) * 1.4}%`
        : `${90 + (fi % 3) * 3 + (k % 3) * 1.4}%`,
      top: `${4 + ((fi * 9 + k * 13) % 82)}%`,
      delay: `${(i * 0.9) % 8}s`,
      blinkDelay: `${(i * 0.55) % 3}s`,
      variant: i % 4,
    })
  }
})

// 高亮模式：只留阳面四功能，每种 3 个放大版，位置按 rank 散在两侧边带
const displayOrbs = computed(() => {
  if (!props.highlight) return orbs
  const list = []
  props.highlight.forEach((fn, rank) => {
    for (let k = 0; k < 3; k++) {
      const onLeft = k % 2 === 0
      list.push({
        fn,
        color: COLORS[fn] || '#38bdf8',
        rank,
        left: onLeft
          ? `${1.5 + rank * 1.8 + k * 1.6}%`
          : `${88 + rank * 1.8 + k * 1.6}%`,
        top: `${5 + ((rank * 21 + k * 9) % 80)}%`,
        delay: `${(rank * 1.2 + k * 2.4) % 6}s`,
        blinkDelay: '0s',
        variant: (rank + k) % 4,
      })
    }
  })
  return list
})
</script>

<template>
  <div class="orbs-layer" :class="['orbs-' + speed, { 'orbs-highlight': highlight }]" aria-hidden="true">
    <span
      v-for="orb in displayOrbs"
      :key="orb.fn + orb.left + orb.top"
      class="orb"
      :class="['orb-v' + orb.variant, highlight ? 'orb-r' + orb.rank : '']"
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
