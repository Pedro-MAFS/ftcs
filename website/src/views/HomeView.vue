<script setup lang="ts">
import { withBase } from '../lib/base'
import { geoFaqs, seoCopy } from '../config/site'
import { usePageSeo } from '../composables/usePageSeo'
import { useFaqJsonLd } from '../composables/useJsonLd'

usePageSeo({
  title: seoCopy.home.title,
  description: seoCopy.home.description,
  absoluteTitle: true,
  path: seoCopy.home.path,
})
useFaqJsonLd(geoFaqs)

const steps = [
  {
    title: '产品录入',
    body: '按文件夹整理官网书签与说明书，勾选文件或整个产品目录，交给智能体生成画像。',
    src: withBase('screenshots/ftcs-录入.png'),
    alt: '产品录入界面',
  },
  {
    title: '产品画像',
    body: 'AI 抽出公司、产品、买家与目标市场。画像是后续关键词与获客探索的基础。',
    src: withBase('screenshots/ftcs-产品画像.png'),
    alt: '产品画像界面',
  },
  {
    title: '获客探索',
    body: '按产品、场景、买家、地理扩展关键词。可在公开网页广撒网，也可按领英、脸书等公开主页的搜索摘要发现公司并核对官网。',
    src: withBase('screenshots/ftcs-线索探索.png'),
    alt: '获客探索界面',
  },
  {
    title: '线索评分',
    body: '智能体去重分级到 A/B/C，聚焦高意向线索。支持人工校对后再写邮件。',
    src: withBase('screenshots/ftcs-线索.png'),
    alt: '线索库界面',
  },
  {
    title: '开发信草稿',
    body: 'AI 为高意向线索生成短函与正式函变体。你改稿确认后保存在本机，发出节奏由你掌握。',
    src: withBase('screenshots/ftcs-邮件.png'),
    alt: '邮件草稿界面',
  },
]

const loopSteps = [
  {
    title: '资料进本机',
    body: '官网书签与说明书进同一产品夹，勾选后由 AI 生成画像。密钥留在本机，不上传官网。',
  },
  {
    title: '获客探索',
    body: 'AI 扩展关键词后探索：公开网页广撒网，以及可选的社媒公开摘要发现。线索库评分去重，只盯高意向。',
  },
  {
    title: '人审出信',
    body: '切换话术变体并改稿，确认后落盘。每封信都经你过目，避免误触达。',
  },
]
</script>

<template>
  <div>
    <section class="hero hero--inverse">
      <div class="container">
        <div class="hero__intro">
          <p class="hero__eyebrow"><span class="eyebrow-dot"></span>FTCS  ·  外贸获客智能体（Agent）</p>
          <h1 class="hero__brand">告别盲目开发，<br />用AI精准锁定全球买家。</h1>
          <p class="hero__lead">
            FTCS 是跑在你电脑上的外贸获客智能体。把官网与说明书交给它，由 AI
            生成产品与买家画像，再从公开网页广撒网（也可按社媒公开摘要发现公司），评分去重，并写出可改稿的开发信草稿。数据与密钥留在本机。
          </p>
          <div class="hero__actions">
            <RouterLink class="btn btn-primary" to="/download">下载桌面版</RouterLink>
            <a class="btn btn-ghost" href="#pipeline">查看流水线</a>
          </div>
        </div>
      </div>
    </section>

    <section id="pipeline" class="section">
      <div class="container">
        <div class="section__head section__head--split">
          <div>
            <p class="section__eyebrow">AGENT PIPELINE</p>
            <h2 class="section__title">一条智能体流水线。</h2>
          </div>
          <p class="section__desc">桌面应用内完成编排。官网只做展示与下载入口。</p>
        </div>

        <div class="pipeline-list">
          <article v-for="(step, i) in steps" :key="step.title" class="pipeline-step">
            <div class="pipeline-row">
              <span class="pipeline-row__index">{{ String(i + 1).padStart(2, '0') }}</span>
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

    <section class="section section--inverse">
      <div class="container">
        <p class="section__eyebrow">LOCAL AGENT  ·  AI LOOP</p>
        <h2 class="section__title">把资料交给智能体，跑通一次获客闭环。</h2>
        <div class="loop-grid">
          <article v-for="(item, i) in loopSteps" :key="item.title" class="loop-card">
            <span class="showcase__step">{{ String(i + 1).padStart(2, '0') }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
          </article>
        </div>
      </div>
    </section>

    <section id="fit" class="section">
      <div class="container">
        <div class="section__head section__head--split">
          <div>
            <p class="section__eyebrow">WHO IT IS FOR</p>
            <h2 class="section__title">给一线外贸用的 AI 智能体。</h2>
          </div>
          <p class="section__desc">先看它怎么帮你获客，再下载桌面版。</p>
        </div>
        <div class="fit-grid">
          <article class="fit-card">
            <p class="fit-card__kicker">适合</p>
            <h3>已有产品资料的出海团队</h3>
            <p>
              中小工厂与外贸业务员：把官网、说明书交给本机智能体，用 AI
              生成画像、发现线索、写出可改稿开发信。资料和密钥不出境。
            </p>
          </article>
          <article class="fit-card">
            <p class="fit-card__kicker">优势</p>
            <h3>从你的产品出发找买家</h3>
            <p>
              按产品画像在公开网页广撒网，也可按社媒公开摘要发现公司并核对官网。线索可核对、开发信可改稿。资料留在本机，出信前由你确认。
            </p>
          </article>
        </div>
      </div>
    </section>

    <section id="faq" class="section section--inverse">
      <div class="container">
        <p class="section__eyebrow">FAQ</p>
        <h2 class="section__title">外贸获客，常见三问。</h2>
        <div class="faq-list">
          <article v-for="item in geoFaqs" :key="item.id" class="faq-item">
            <h3>
              <RouterLink :to="`/docs/faq#${item.id}`">{{ item.question }}</RouterLink>
            </h3>
            <p>{{ item.answer }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="section cta-slab">
      <div class="container cta-slab__inner">
        <div>
          <h2 class="section__title">把产品资料，变成可行动的线索与开发信草稿。</h2>
          <p class="section__desc">
            Windows 桌面智能体。密钥留在本机；官方通道开通即可探索，无需自备模型与搜索
            Key。
          </p>
        </div>
        <RouterLink class="btn btn-primary" to="/download">下载桌面版</RouterLink>
      </div>
    </section>
  </div>
</template>
