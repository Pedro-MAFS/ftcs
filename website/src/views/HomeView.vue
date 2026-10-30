<script setup lang="ts">
import { casePath, caseAsset, caseSteps, startFaqs } from '../content/case-study'
import { seoCopy } from '../config/site'
import { usePageSeo } from '../composables/usePageSeo'
import { useFaqJsonLd } from '../composables/useJsonLd'
usePageSeo({ ...seoCopy.home, absoluteTitle: true })
useFaqJsonLd(startFaqs.map((item, i) => ({ ...item, id: `start-${i}` })), '/')
const channels = [
  { number: '01', title: '全网搜索', body: '从公开网页和企业官网，发现与你的产品相关的公司。' },
  { number: '02', title: '社媒发现', body: '从社媒公开搜索摘要寻找公司，再核对官网与业务方向。' },
  { number: '03', title: '地图发现', body: '按城市与品类寻找本地商户，补充地区性的渠道线索。' },
]
</script>

<template>
  <div class="case-home">
    <section class="hero hero--inverse case-hero">
      <div class="container case-hero__grid">
        <div class="hero__intro">
          <p class="hero__eyebrow"><span class="eyebrow-dot"></span>FTCS · 外贸获客智能体</p>
          <h1 class="hero__brand">告别盲目开发，<br />用AI精准锁定<br class="hero-break" />全球买家。</h1>
          <p class="hero__lead">从你的产品官网或资料出发，让 AI 帮你寻找海外潜在客户、整理匹配理由，并起草有依据的开发信。目标企业和邮件内容，由你审核确认。</p>
          <div class="hero__actions">
            <RouterLink class="btn btn-primary" :to="casePath">看完整操作案例 <span aria-hidden="true">↗</span></RouterLink>
            <RouterLink class="btn btn-ghost" to="/download">下载 Windows 版</RouterLink>
          </div>
          <p class="hero-note">本机工作区 · 引导准备环境 · 人工审核草稿</p>
        </div>
        <RouterLink :to="casePath" class="hero-evidence" aria-label="查看从产品官网到开发信草稿的操作案例">
          <div class="hero-evidence__top"><span><i></i> 实际操作 · 匿名案例</span><span>02:14 <span aria-hidden="true">↗</span></span></div>
          <div class="hero-evidence__image"><img :src="caseAsset('04-scored-leads.jpg')" alt="实际录屏中的线索库与评分去重结果" width="1920" height="1080" fetchpriority="high" /></div>
          <div class="hero-evidence__bottom"><span class="play-symbol" aria-hidden="true">▶</span><div><strong>从一个产品官网开始</strong><p>看搜索方向，如何变成可跟进的企业线索。</p></div></div>
          <div class="hero-evidence__stats"><div><strong>86<span> 条</span></strong><small>去重后保留记录</small></div><div><strong>10<span> 条</span></strong><small>系统 A 级线索</small></div><div><strong>1<span> 家</span></strong><small>完成草稿审核</small></div></div>
          <p class="evidence-footnote">本次累计线索库结果，非单轮新增或效果保证。</p>
        </RouterLink>
      </div>
    </section>

    <section id="case-study" class="section case-intro">
      <div class="container case-intro__grid">
        <div><p class="section__eyebrow">从一件具体的事开始</p><h2 class="section__title">换成你的产品，<br />这条流程怎么走？</h2></div>
        <div><p class="case-intro__text">一家拥有宠物配饰、发饰与生活方式用品的企业，怎样从官网资料出发，寻找海外渠道，再为选定企业准备开发信？</p><p class="section__desc">用一次完整操作，把每一步的输入、结果和人工判断讲清楚。</p><RouterLink class="text-link" :to="casePath">查看五步图文与完整视频 <span aria-hidden="true">→</span></RouterLink></div>
      </div>
    </section>

    <section id="pipeline" class="section section--soft">
      <div class="container">
        <div class="section__head section__head--split"><div><p class="section__eyebrow">产品 → 企业 → 开发信</p><h2 class="section__title">五步，把线索变成下一步行动。</h2></div><p class="section__desc">AI 整理与执行，<br />你把握方向和关键判断。</p></div>
        <div class="workflow-list"><RouterLink v-for="(step, i) in caseSteps" :key="step.title" :to="`${casePath}#step-${i + 1}`" class="workflow-row"><span class="workflow-number">0{{ i + 1 }}</span><div><h3>{{ step.title }}</h3><p>{{ step.action }}</p></div><p class="workflow-result">{{ step.result }}</p><span aria-hidden="true">↗</span></RouterLink></div>
        <div class="channel-grid"><article v-for="channel in channels" :key="channel.title"><span>{{ channel.number }} / 发现入口</span><h3>{{ channel.title }}</h3><p>{{ channel.body }}</p></article></div>
        <p class="small-note">地图发现需开通相关能力，并具备访问 Google 服务的网络条件。<RouterLink to="/docs/places-api-key">查看说明 →</RouterLink></p>
      </div>
    </section>

    <section class="section reasoning-section">
      <div class="container reasoning-grid">
        <div><p class="section__eyebrow">找到之后，判断为什么联系</p><h2 class="section__title">有名单，<br />也有跟进的依据。</h2><p class="section__desc">查看目标公司画像与匹配理由，找到产品和对方业务之间的联系，再准备第一封信。</p><ol class="reasoning-points"><li><strong>看业务是否相关</strong><span>主营品类、渠道角色、目标市场。</span></li><li><strong>找具体的切入点</strong><span>检查匹配理由，调整破冰话术。</span></li><li><strong>把依据带进开发信</strong><span>核对个性化内容，确认后保存草稿。</span></li></ol><RouterLink class="text-link" :to="`${casePath}#match`">看案例中的匹配与写信过程 →</RouterLink></div>
        <figure class="reasoning-shot"><img :src="caseAsset('05-company-detail.jpg')" alt="目标企业详情中的公司画像、合作机会与破冰话术" width="1920" height="1080" loading="lazy" /><figcaption>案例实录 · 打开企业详情，先检查再跟进</figcaption></figure>
      </div>
    </section>

    <section id="fit" class="section section--soft"><div class="container"><p class="section__eyebrow">从你的工作问题出发</p><h2 class="section__title">这三件事，不必每次从零开始。</h2><div class="task-grid"><article><span>01 / 找方向</span><h3>有产品，不知道搜谁？</h3><p>从产品画像展开买家类型、地区与关键词，先把搜索方向定下来。</p></article><article><span>02 / 做判断</span><h3>有名单，不知道先联系谁？</h3><p>结合评分、公司画像和匹配理由，选择值得进一步核验的企业。</p></article><article><span>03 / 写第一封信</span><h3>选定公司，不知道怎么开口？</h3><p>把产品特点与对方业务联系起来，生成能检查、能修改的开发信草稿。</p></article></div></div></section>

    <section id="faq" class="section section--inverse"><div class="container faq-grid"><div><p class="section__eyebrow">开始之前</p><h2 class="section__title">你可能还想知道。</h2><RouterLink class="text-link" to="/docs/faq">查看完整使用说明 →</RouterLink></div><div class="faq-list"><details v-for="(faq, i) in startFaqs" :key="faq.question" class="faq-item" :open="i === 0"><summary>{{ faq.question }}<span aria-hidden="true">+</span></summary><p>{{ faq.answer }}</p></details></div></div></section>

    <section class="section cta-slab"><div class="container cta-slab__inner"><div><p class="section__eyebrow">从你自己的产品开始</p><h2 class="section__title">先跑通一次，再决定怎样扩大。</h2><p class="section__desc">准备一个产品官网，聚焦一个市场，检查第一批候选企业和开发信草稿。</p></div><div class="cta-actions"><RouterLink class="btn btn-primary" to="/download">下载 Windows 版</RouterLink><RouterLink class="text-link" to="/docs/getting-started">查看快速开始 →</RouterLink></div></div></section>
  </div>
</template>
