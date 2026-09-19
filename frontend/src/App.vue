<script setup>
// Element Plus 组件通过 unplugin-vue-components 自动按需注册
</script>

<template>
  <router-view />
</template>

<style>
/* Element Plus 主题：主色改为品牌蓝 (#2563EB)
   用 !important 确保覆盖组件按需注入的默认 :root 变量 */
:root {
  --el-color-primary: #2563eb !important;
  --el-color-primary-light-3: #60a5fa !important;
  --el-color-primary-light-5: #93c5fd !important;
  --el-color-primary-light-7: #bfdbfe !important;
  --el-color-primary-light-8: #dbeafe !important;
  --el-color-primary-light-9: #eff6ff !important;
  --el-color-primary-dark-2: #1e3a8a !important;
  --el-border-radius-base: 8px;
  --el-font-family: "PingFang SC", "Microsoft YaHei", system-ui, -apple-system,
    "Segoe UI", Roboto, sans-serif;
}

/* 全局面板重置，避免浏览器默认样式干扰元素级 label/input 的布局 */
:root {
  color-scheme: light;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
}
</style>
