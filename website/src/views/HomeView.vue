<script setup lang="ts">
import { siteConfig } from '../config/site'
import { withBase } from '../lib/base'
import { usePageSeo } from '../composables/usePageSeo'

usePageSeo({
  description:
    'FTCS 外贸获客桌面应用：从产品画像到线索发现与开发信草稿，数据留在本机，官网提供展示与下载。',
})

const heroShot = {
  src: withBase('screenshots/ftcs-线索.png'),
  alt: '外贸获客 · 线索库界面',
}

const steps = [
  {
    title: '产品录入',
    body: '导入公司网站或产品资料，归档到本机资料库。',
    src: withBase('screenshots/ftcs-录入.png'),
    alt: '产品录入界面',
  },
  {
    title: '产品画像',
    body: '生成结构化画像：公司、产品、买家与目标市场。',
    src: withBase('screenshots/ftcs-产品画像.png'),
    alt: '产品画像界面',
  },
  {
    title: '获客探索',
    body: '扩展关键词并启动 R1，在全网发现潜在客户。',
    src: withBase('screenshots/ftcs-线索探索.png'),
    alt: '获客探索界面',
  },
  {
    title: '线索评分',
    body: '去重分级，聚焦高意向线索，支持人工校对与写邮件。',
    src: withBase('screenshots/ftcs-线索.png'),
    alt: '线索库界面',
  },
  {
    title: '开发信草稿',
    body: '生成个性化邮件，改稿后通过并保存（发送后续开放）。',
    src: withBase('screenshots/ftcs-邮件.png'),
    alt: '邮件草稿界面',
  },
]

const settingsShot = {
  src: withBase('screenshots/ftcs-设置.png'),
  alt: '设置界面：官方通道与本机配置',
}
</script>

<template>
  <div>
    <section class="hero">
      <div class="container">
        <div class="hero__intro">
          <p class="hero__eyebrow">{{ siteConfig.brand }}</p>
          <h1 class="hero__brand">{{ siteConfig.productName }}</h1>
          <p class="hero__lead">{{ siteConfig.tagline }}</p>
          <div class="hero__actions">
            <RouterLink class="btn btn-primary" to="/download">下载桌面版</RouterLink>
            <RouterLink class="btn btn-secondary" to="/docs/getting-started">
              查看快速开始
            </RouterLink>
          </div>
        </div>

        <figure class="shot shot--hero">
          <img :src="heroShot.src" :alt="heroShot.alt" width="1600" height="900" />
        </figure>
      </div>
    </section>

    <section id="features" class="section">
      <div class="container">
        <div class="section__head">
          <h2 class="section__title">一条流水线，从资料到触达准备</h2>
          <p class="section__desc">
            桌面应用内完成编排；数据与密钥留在本机工作区，官网仅作展示与下载入口。
          </p>
        </div>

        <div class="showcase-list">
          <article
            v-for="(step, i) in steps"
            :key="step.title"
            class="showcase"
            :class="{ 'showcase--flip': i % 2 === 1 }"
          >
            <div class="showcase__copy">
              <span class="showcase__step">{{ String(i + 1).padStart(2, '0') }}</span>
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
            </div>
            <figure class="shot">
              <img :src="step.src" :alt="step.alt" loading="lazy" width="1400" height="800" />
            </figure>
          </article>
        </div>
      </div>
    </section>

    <section class="section section--settings">
      <div class="container showcase showcase--compact">
        <div class="showcase__copy">
          <h2 class="section__title">本机配置，密钥不出境</h2>
          <p class="section__desc">
            推荐开通官方通道：模型按余额计费，搜索无需单独配置。工作区与
            `.env` 保存在客户电脑本地。
          </p>
          <RouterLink class="btn btn-secondary" to="/docs/install">查看安装前置</RouterLink>
        </div>
        <figure class="shot">
          <img
            :src="settingsShot.src"
            :alt="settingsShot.alt"
            loading="lazy"
            width="1400"
            height="800"
          />
        </figure>
      </div>
    </section>
  </div>
</template>
