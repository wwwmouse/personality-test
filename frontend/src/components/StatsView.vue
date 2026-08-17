<script setup>
import { ref, computed } from 'vue'

// 统计页：/stats 专属。口令对了才显示账本（后端 /api/stats 会核对 STATS_KEY）
const key = ref('')
const stats = ref(null)
const error = ref('')
const loading = ref(false)

// 类型分布按次数从多到少排，条形图以最多的那个撑满为基准
const sortedTypes = computed(() =>
  Object.entries(stats.value?.types || {}).sort((a, b) => b[1] - a[1])
)
const maxCount = computed(() => (sortedTypes.value.length ? sortedTypes.value[0][1] : 1))

async function load() {
  if (!key.value.trim()) {
    error.value = '先输入口令'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/stats?key=' + encodeURIComponent(key.value.trim()))
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '读取失败')
    stats.value = data
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
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
      <p class="stats-note">只记录聚合数字：次数、类型、填写率、反馈。不保存任何答案内容。</p>
    </template>
  </div>
</template>
