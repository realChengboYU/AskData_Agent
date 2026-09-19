<script setup>
import { ref } from 'vue'
import { askQuestion } from '../api'

const question = ref('')
const status = ref('idle') // idle | loading | success | error
const result = ref(null) // { answer, reasoning, sql, chart }
const errorMsg = ref('')

function formatNum(n) {
  return typeof n === 'number' ? n.toLocaleString('zh-CN') : n
}

function barWidth(v, values) {
  const nums = (values || []).map(Number)
  const max = Math.max(...nums)
  return max ? `${Math.round((Number(v) / max) * 100)}%` : '0%'
}

async function submit() {
  const q = question.value.trim()
  if (!q || status.value === 'loading') return

  status.value = 'loading'
  result.value = null
  errorMsg.value = ''
  try {
    const data = await askQuestion({ question: q })
    status.value = 'success'
    result.value = data ?? {}
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
            <p class="answer-text">{{ result?.answer }}</p>

            <!-- 一键转图表 -->
            <template v-if="result?.chart && result.chart.type === 'bar'">
              <div class="chart-block">
                <div class="chart-title">{{ result.chart.title }}</div>
                <div class="bars">
                  <div
                    class="bar"
                    v-for="(label, i) in result.chart.labels"
                    :key="label"
                  >
                    <div class="bar-value">
                      {{ formatNum(result.chart.values[i]) }} {{ result.chart.unit }}
                    </div>
                    <div class="bar-track">
                      <div
                        class="bar-fill"
                        :style="{ width: barWidth(result.chart.values[i], result.chart.values) }"
                      ></div>
                    </div>
                    <div class="bar-label">{{ label }}</div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 可追溯：推理过程 -->
            <template v-if="result?.reasoning && result.reasoning.length">
              <div class="trace">
                <div class="trace-title">推理过程（可追溯）</div>
                <ol class="trace-list">
                  <li v-for="(s, i) in result.reasoning" :key="i">{{ s }}</li>
                </ol>
              </div>
            </template>

            <!-- 可追溯：生成 SQL -->
            <template v-if="result?.sql">
              <div class="trace">
                <div class="trace-title">生成查询 SQL</div>
                <pre class="sql-block">{{ result.sql }}</pre>
              </div>
            </template>
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

.answer-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: #1b2a4a;
}

.chart-block {
  margin-top: 24px;
  padding: 16px 18px;
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 12px;
}

.chart-title {
  font-size: 14px;
  font-weight: 650;
  color: #1e3a8a;
  margin-bottom: 14px;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  min-height: 150px;
}

.bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.bar-value {
  font-size: 12px;
  color: #1e3a8a;
  white-space: nowrap;
}

.bar-track {
  width: 100%;
  height: 96px;
  background: #eff6ff;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.bar-fill {
  width: 0;
  height: 100%;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
  border-radius: 6px 6px 0 0;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.bar-label {
  font-size: 13px;
  color: #334155;
}

.trace {
  margin-top: 20px;
  padding: 14px 16px;
  background: #f8fbff;
  border: 1px solid #dbeafe;
  border-radius: 10px;
}

.trace-title {
  font-size: 13px;
  font-weight: 650;
  color: #2563eb;
  margin-bottom: 10px;
}

.trace-list {
  margin: 0;
  padding-left: 20px;
  color: #45536b;
  font-size: 14px;
  line-height: 1.8;
}

.sql-block {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.7;
  color: #dbeafe;
  background: #0f172a;
  padding: 12px 14px;
  border-radius: 8px;
}
</style>
