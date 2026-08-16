<script setup>
// 单道题组件：题号 + 题干 + 选项 + 理由输入框
// answer 是父组件传入的响应式对象，直接修改它的 choice / reason 即可
const props = defineProps({
  question: { type: Object, required: true }, // { id, text, options, reason_prompt }
  index: { type: Number, required: true }, // 第几题
  answer: { type: Object, required: true }, // { choice, reason }
})
</script>

<template>
  <div class="question-card">
    <span class="q-number">第 {{ index }} 题</span>
    <p class="q-text">{{ question.text }}</p>

    <div class="options">
      <label v-for="opt in question.options" :key="opt.key" class="option">
        <input
          type="radio"
          :name="question.id"
          :value="opt.key"
          v-model="answer.choice"
        />
        <span class="option-text"><b>{{ opt.key }}.</b> {{ opt.text }}</span>
      </label>
    </div>

    <input
      class="reason-input"
      v-model="answer.reason"
      type="text"
      :placeholder="question.reason_prompt"
    />
  </div>
</template>
