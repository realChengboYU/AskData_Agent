<script setup>
import { ref } from 'vue'
import { askQuestion } from '../api'

const question = ref('')
const status = ref('idle') // idle | loading | success | error
const answer = ref('')
const errorMsg = ref('')

async function submit() {
  const q = question.value.trim()
  if (!q || status.value === 'loading') return

  status.value = 'loading'
  answer.value = ''
  errorMsg.value = ''
  try {
    const data = await askQuestion({ question: q })
    status.value = 'success'
    answer.value = data?.answer ?? '（后端未返回答案内容）'
  } catch (err) {
    status.value = 'error'
    errorMsg.value =
      err?.response?.data?.detail ??
      '暂时无法连接后端服务。请确认 FastAPI 已在 8000 端口启动。'
  }
}
</script>

<template>
  <div class="page">
    <header class="masthead">
      <div class="brand">
        <span class="mark">◆</span>
        <span class="brand-name">AskData Agent</span>
      </div>
      <div class="tagline">用一句话，问清你的数据</div>
    </header>

    <main class="stage">
      <!-- 提问区：整个页面最有辨识度的地方 -->
      <section class="query">
        <label class="query-label" for="ask-input">你想问什么？</label>
        <el-input
          id="ask-input"
          v-model="question"
          type="textarea"
          :rows="4"
          resize="none"
          placeholder="例如：上个月销售额前五的产品分别卖了多少？"
          @keydown.enter.exact.prevent="submit"
        />
        <div class="query-actions">
          <span class="hint">按 Enter 提问 · Shift + Enter 换行</span>
          <el-button type="primary" :loading="status === 'loading'" @click="submit">
            {{ status === 'loading' ? '分析中…' : '提问' }}
          </el-button>
        </div>
      </section>

      <!-- 结果区 -->
      <section class="result" aria-live="polite">
        <template v-if="status === 'idle'">
          <div class="placeholder">
            <p>还没有提问。输入上面的问题，我会尝试帮你从数据里找出答案。</p>
          </div>
        </template>

        <template v-else-if="status === 'loading'">
          <div class="placeholder">
            <el-skeleton :rows="3" animated />
          </div>
        </template>

        <template v-else-if="status === 'error'">
          <el-alert type="error" :closable="false" show-icon title="出错了">
            <template #default>{{ errorMsg }}</template>
          </el-alert>
        </template>

        <template v-else>
          <div class="answer">
            <div class="answer-head">
              <span class="answer-mark">回答</span>
              <span class="answer-meta">针对你的提问</span>
            </div>
            <pre class="answer-body">{{ answer }}</pre>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #eff6ff;
  color: #1e3a8a;
  display: flex;
  flex-direction: column;
}

.masthead {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 26px 40px 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mark {
  color: #2563eb;
  font-size: 20px;
}

.brand-name {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.tagline {
  color: #6b7a93;
  font-size: 14px;
}

.stage {
  flex: 1;
  width: min(860px, 92%);
  margin: 0 auto;
  padding: 24px 0 60px;
}

.query-label {
  display: block;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
}

.query-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.hint {
  color: #9aa4b3;
  font-size: 13px;
}

.result {
  margin-top: 28px;
}

.placeholder {
  color: #8b97ad;
  font-size: 15px;
}

.answer {
  border-left: 3px solid #2563eb;
  padding: 6px 0 6px 18px;
}

.answer-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.answer-mark {
  font-weight: 650;
  color: #2563eb;
}

.answer-meta {
  color: #9aa4b3;
  font-size: 13px;
}

.answer-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  color: #1b2a4a;
}
</style>
