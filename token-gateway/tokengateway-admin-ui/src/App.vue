<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const title = computed(() => (route.meta.title as string) || '管理端')
</script>

<template>
  <div class="shell">
    <aside class="nav">
      <div class="brand">Token Gateway</div>
      <p class="brand-sub">运维管理端</p>
      <nav>
        <RouterLink to="/dashboard">大屏看板</RouterLink>
        <RouterLink to="/ops/users">用户管理</RouterLink>
        <RouterLink to="/ops/usage">消费查询</RouterLink>
        <RouterLink to="/ops/topups">充值管理</RouterLink>
        <RouterLink to="/ops/prices">价目管理</RouterLink>
      </nav>
    </aside>
    <main class="main">
      <header class="top">
        <h1>{{ title }}</h1>
      </header>
      <section class="content">
        <RouterView />
      </section>
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}

.nav {
  background: #102a43;
  color: #f0f4f8;
  padding: 1.25rem 1rem;
}

.brand {
  font-weight: 700;
  font-size: 1.05rem;
}

.brand-sub {
  margin: 0.25rem 0 1.5rem;
  color: #9fb3c8;
  font-size: 0.85rem;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

nav a {
  padding: 0.55rem 0.75rem;
  border-radius: 6px;
  color: #d9e2ec;
}

nav a.router-link-active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.top h1 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.content {
  padding: 1.25rem 1.5rem 2rem;
}

@media (max-width: 800px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .nav {
    padding-bottom: 0.75rem;
  }

  nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
