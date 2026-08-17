<script setup>
import { onMounted } from 'vue'

// 一次性工具页：/og-maker
// 用 canvas 画出 1200×630 的社交分享卡片图（微信/QQ 链接卡片上的图）并自动下载。
// 下载后把 og.png 放进 frontend/public/，线上社交卡片就有图了。
onMounted(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const ctx = canvas.getContext('2d')

  // 暗黑渐变背景
  const bg = ctx.createLinearGradient(0, 0, 0, 630)
  bg.addColorStop(0, '#0d0d16')
  bg.addColorStop(1, '#181826')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 1200, 630)

  // 八维彩色光点（两侧散落，带同色光晕）
  const dots = [
    ['#6A4C93', 90, 120], ['#4ECDC4', 260, 70], ['#BB9457', 120, 440], ['#FF9F1C', 310, 530],
    ['#74C0FC', 900, 110], ['#1A535C', 1085, 310], ['#E63946', 920, 530], ['#FFC0B6', 1105, 460],
  ]
  dots.forEach(([color, x, y]) => {
    ctx.shadowColor = color
    ctx.shadowBlur = 32
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.shadowBlur = 0

  // 大标题：青→蓝→紫渐变 + 霓虹光晕
  const grad = ctx.createLinearGradient(300, 0, 900, 0)
  grad.addColorStop(0, '#4ecdc4')
  grad.addColorStop(0.5, '#38bdf8')
  grad.addColorStop(1, '#a78bfa')
  ctx.fillStyle = grad
  ctx.font = 'bold 96px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.shadowColor = 'rgba(56,189,248,0.6)'
  ctx.shadowBlur = 40
  ctx.fillText('不止于MBTI', 600, 255)
  ctx.shadowBlur = 0

  // 卖点
  ctx.fillStyle = '#eef0f6'
  ctx.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('你比认识中的自己更……', 600, 355)

  // 预期管理
  ctx.fillStyle = '#9aa3b5'
  ctx.font = '28px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('20 道情景题 · 约 6 分钟', 600, 435)

  // 网址
  ctx.fillStyle = '#6f7488'
  ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('sherrymouse.top', 600, 545)

  // 自动下载
  const link = document.createElement('a')
  link.download = 'og.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
})
</script>

<template>
  <div class="og-maker-note">
    <p>✅ 卡片图已生成并开始下载（文件名 <code>og.png</code>）</p>
    <p>请把它放进 <code>frontend/public/og.png</code>，然后 commit + push。</p>
  </div>
</template>
