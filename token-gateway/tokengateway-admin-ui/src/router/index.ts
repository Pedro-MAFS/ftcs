import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: '大屏看板' },
    },
    {
      path: '/ops/users',
      name: 'users',
      component: () => import('@/views/UsersView.vue'),
      meta: { title: '用户管理' },
    },
    {
      path: '/ops/users/:id',
      name: 'user-detail',
      component: () => import('@/views/UserDetailView.vue'),
      meta: { title: '用户详情' },
    },
    {
      path: '/ops/usage',
      name: 'usage',
      component: () => import('@/views/UsageView.vue'),
      meta: { title: '消费查询' },
    },
    {
      path: '/ops/topups',
      name: 'topups',
      component: () => import('@/views/TopupsView.vue'),
      meta: { title: '充值管理' },
    },
    {
      path: '/ops/prices',
      name: 'prices',
      component: () => import('@/views/PricesView.vue'),
      meta: { title: '价目管理' },
    },
  ],
})
