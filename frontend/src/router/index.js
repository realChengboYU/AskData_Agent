import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AskView from '../views/AskView.vue'

const routes = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: '登录' },
  },
  {
    path: '/ask',
    name: 'ask',
    component: AskView,
    meta: { title: '问数' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  const base = 'AskData Agent'
  document.title = to.meta?.title ? `${to.meta.title} · ${base}` : base
})

export default router
