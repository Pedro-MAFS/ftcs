<template>
  <section class="main-pane boot-landing" aria-live="polite">
    <h1 class="boot-landing__title">正在打开…</h1>
  </section>
</template>

<style scoped>
.boot-landing {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.boot-landing__title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
}
</style>
