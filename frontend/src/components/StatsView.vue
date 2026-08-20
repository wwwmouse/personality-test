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

// 流水三合一：按会话号把 测试/反馈/建议 三张票合并成一行（老票没有会话号，各自成行）
const groupedEvents = computed(() => {
  const rows = []
  const index = new Map()
  for (const e of stats.value?.events || []) {
    const key = e.session || `${e.type}-${e.ts}`
    let row = index.get(key)
    if (!row) {
      row = { ts: e.ts, test: null, feedback: null, suggest: null }
      index.set(key, row)
      rows.push(row)
    }
    if (e.type === 'test') row.test = e
    else if (e.type === 'feedback') row.feedback = e
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
    <h2 class="stats-title">📊 站点统计</h2>

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
        <button class="refresh-btn" :disabled="loading" @click="load(false)">⟳ 立即刷新</button>
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
      </div>

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
                <span class="event-detail">{{ row.test.personality_type }} · 理由 {{ row.test.reasonFilled }}/{{ row.test.reasonTotal }}</span>
              </template>
              <span v-if="row.feedback" class="event-tag event-feedback">{{ row.feedback.agree ? '👍 满意' : '👎 不满意' }}</span>
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

<style scoped>
.stats-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.refresh-btn {
  background: transparent;
  color: #38bdf8;
  border: 1px solid #38bdf8;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}

.refresh-btn:hover {
  background: rgba(56, 189, 248, 0.12);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.stats-updated {
  color: #94a3b8;
  font-size: 0.8rem;
}

.events-count {
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: normal;
}

.events-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  font-size: 0.9rem;
}

/* 三合一块：边框移到块上，主行不再自带下划线；建议文字独占一行 */
.event-block {
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.event-block .event-row {
  border-bottom: none;
  padding-bottom: 4px;
}

.event-suggest-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 0 0 8px;
  font-size: 0.9rem;
}

.event-suggest-text {
  flex: 1;
  margin: 0;
  color: #cbd5e1;
  font-size: 0.85rem;
  line-height: 1.6;
  word-break: break-all;
}

.event-time {
  color: #94a3b8;
  font-family: monospace;
}

.event-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.event-test {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.event-feedback {
  background: rgba(255, 159, 28, 0.15);
  color: #ff9f1c;
}

.event-suggest {
  background: rgba(78, 205, 196, 0.15);
  color: #4ecdc4;
}

.event-detail {
  color: #cbd5e1;
}
</style>
