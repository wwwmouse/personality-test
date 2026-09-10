<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 统计页：/stats 专属。口令对了才显示账本（后端 /api/stats 会核对 STATS_KEY）
const key = ref('')
const stats = ref(null)
const error = ref('')
const loading = ref(false)
const updatedAt = ref('') // 上次成功读到数据的时间

// 类型分布按次数从多到少排，条形图以最多的那个撑满为基准
const sortedTypes = computed(() =>
  Object.entries(stats.value?.types || {}).sort((a, b) => b[1] - a[1])
)
const maxCount = computed(() => (sortedTypes.value.length ? sortedTypes.value[0][1] : 1))

// 分差阈值由后端下发（源头在 scorer.mjs 的 GAP_THRESHOLD），前端不写死
const gapThreshold = computed(() => stats.value?.gapThreshold ?? 0.7)

// 平手率展示：没有带分差的票时显示 —（而不是 0%，避免把"没数据"读成"没有平手"）
const tieRateText = computed(() => {
  const t = stats.value?.tie
  return t && t.rate != null ? t.rate + '%' : '—'
})

// 一张票的区段标注。margin 可能是 null（2026-08-21 之前的票没有这个字段），返回 null 表示不显示
function zoneTagOf(margin) {
  if (typeof margin !== 'number') return null
  return margin >= gapThreshold.value
    ? { cls: 'zone-ledger', label: '账本区' }
    : { cls: 'zone-tie', label: '平手区' }
}

// 流水三合一：按会话号把 测试/反馈/建议 三张票合并成一行（老票没有会话号，各自成行）
const groupedEvents = computed(() => {
  const rows = []
  const index = new Map()
  for (const e of stats.value?.events || []) {
    const key = e.session || `${e.type}-${e.ts}`
    let row = index.get(key)
    if (!row) {
      row = { ts: e.ts, test: null, testZone: null, feedback: null, suggest: null }
      index.set(key, row)
      rows.push(row)
    }
    if (e.type === 'test') {
      row.test = e
      row.testZone = zoneTagOf(e.margin)
    } else if (e.type === 'feedback') row.feedback = e
    else if (e.type === 'suggest') row.suggest = e
    row.ts = Math.max(row.ts, e.ts)
  }
  return rows.sort((a, b) => b.ts - a.ts)
})

// 把票据时间戳格式化成 "MM-DD HH:mm:ss"
function formatTime(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// silent = 自动刷新的静默模式：不闪"读取中"，失败也保留旧数据（展示时网络抖一下不碍事）
async function load(silent = false) {
  if (!key.value.trim()) {
    if (!silent) error.value = '先输入口令'
    return
  }
  if (!silent) {
    loading.value = true
    error.value = ''
  }
  try {
    const res = await fetch('/api/stats?key=' + encodeURIComponent(key.value.trim()))
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '读取失败')
    stats.value = data
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    error.value = ''
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// 口令通过、数据到手后，每 10 秒自动刷一次（静默）。
// 组件卸载时清掉定时器，避免离开页面后还在后台刷
let autoTimer = null
onMounted(() => {
  autoTimer = setInterval(() => {
    if (stats.value) load(true)
  }, 10_000)
})
onUnmounted(() => clearInterval(autoTimer))
</script>

<template>
  <div class="stats-card">
    <h2 class="stats-title">站点统计</h2>

    <!-- 口令门：没拿到数据前，只露一个输入框 -->
    <div v-if="!stats" class="stats-gate">
      <input
        v-model="key"
        type="password"
        class="stats-key-input"
        placeholder="管理员口令"
        @keyup.enter="load"
      />
      <button class="submit-btn" :disabled="loading" @click="load">
        {{ loading ? '读取中…' : '查看' }}
      </button>
      <p v-if="error" class="stats-error">{{ error }}</p>
    </div>

    <!-- 数据区 -->
    <template v-else>
      <div class="stats-toolbar">
        <button class="refresh-btn" :disabled="loading" @click="load(false)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          立即刷新
        </button>
        <span class="stats-updated">数据更新于 {{ updatedAt || '—' }}</span>
      </div>

      <div class="stats-grid">
        <div class="stat-tile">
          <span class="stat-num">{{ stats.totalTests }}</span>
          <span class="stat-label">总测试次数</span>
        </div>
        <div class="stat-tile">
          <span class="stat-num">{{ stats.fillRate }}%</span>
          <span class="stat-label">理由填写率</span>
        </div>
        <div class="stat-tile">
          <span class="stat-num">{{ stats.feedback.like }} / {{ stats.feedback.dislike }}</span>
          <span class="stat-label">满意 / 不满意</span>
        </div>
        <div class="stat-tile">
          <span class="stat-num">{{ tieRateText }}</span>
          <span class="stat-label">
            平手区占比 <span class="stat-note-inline">（近 {{ stats.tie?.n || 0 }} 次判定）</span>
          </span>
        </div>
      </div>

      <p class="stats-note stats-tie-note">
        <b>分差</b>＝选项账本前两名功能的分差。分差 ≥ {{ gapThreshold }} = <b>账本区</b>：选项自己就分得清，判型不看理由；分差 &lt; {{ gapThreshold }} = <b>平手区</b>：改由「理由」裁决。
        参考基线：随机作答的平手率约 57%——明显低于它，才说明选项真的分出了信号。
        （分差字段 2026-08-21 起才有，更早的票无此数据；占比只统计最近的票，不足以下结论。）
      </p>

      <div class="stats-section">
        <h3>类型分布</h3>
        <div v-if="!sortedTypes.length" class="stats-empty">还没有人测过</div>
        <div v-for="[type, count] in sortedTypes" :key="type" class="type-row">
          <span class="type-row-name">{{ type }}</span>
          <div class="type-row-track">
            <div class="type-row-fill" :style="{ width: (count / maxCount) * 100 + '%' }"></div>
          </div>
          <span class="type-row-count">{{ count }}</span>
        </div>
      </div>
      <div class="stats-section">
        <h3>实时流水 <span class="events-count">最近 {{ stats.events?.length || 0 }} 条</span></h3>
        <div v-if="!stats.events?.length" class="stats-empty">还没有记录</div>
        <ul v-else class="events-list">
          <li v-for="(row, i) in groupedEvents" :key="i" class="event-block">
            <div class="event-row">
              <span class="event-time">{{ formatTime(row.ts) }}</span>
              <template v-if="row.test">
                <span class="event-tag event-test">测试</span>
                <span class="event-detail">
                  {{ row.test.personality_type }} · 理由 {{ row.test.reasonFilled }}/{{ row.test.reasonTotal }}<template v-if="row.testZone"> · 分差 {{ row.test.margin }}</template>
                </span>
                <span v-if="row.testZone" class="event-zone" :class="row.testZone.cls">{{ row.testZone.label }}</span>
              </template>
              <span v-if="row.feedback" class="event-tag event-feedback">{{ row.feedback.agree ? '满意' : '不满意' }}</span>
            </div>
            <div v-if="row.suggest" class="event-suggest-row">
              <span class="event-tag event-suggest">建议</span>
              <span class="event-suggest-text">{{ row.suggest.text }}</span>
            </div>
          </li>
        </ul>
      </div>

      <p v-if="error" class="stats-error">{{ error }}</p>
      <p class="stats-note">只记录聚合数字、判型，以及用户自愿填写的建议文字。不保存任何答案与理由原文。</p>
    </template>
  </div>
</template>

