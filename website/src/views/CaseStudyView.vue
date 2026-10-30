<script setup lang="ts">
import { computed, ref } from 'vue'
import { casePath, caseAsset, caseSteps, caseVideoId, caseVideoUrl } from '../content/case-study'
import { usePageSeo } from '../composables/usePageSeo'
const player = ref<HTMLDivElement | null>(null)
const startTime = ref<number | null>(null)
const playerKey = ref(0)
const playerSrc = computed(() => `https://player.bilibili.com/player.html?bvid=${caseVideoId}&p=1&autoplay=1&danmaku=0&t=${startTime.value ?? 0}`)
const watchUrl = computed(() => `${caseVideoUrl}?t=${startTime.value ?? 0}`)
function jumpTo(seconds: number) {
  startTime.value = seconds
  // The official embed supports an initial time; remount even when replaying the same chapter.
  playerKey.value += 1
  player.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
usePageSeo({ title: '从产品官网到开发信草稿：外贸获客操作案例', description: '看一家宠物配饰与生活方式用品企业，如何使用 FTCS 检查画像、发现企业、评分去重并审核开发信草稿。含 2 分 14 秒视频与五步图文。', path: casePath })
</script>

<template>
  <div class="case-page">
    <header class="case-page__header section--inverse"><div class="container"><RouterLink class="case-back" to="/">← 返回首页</RouterLink><p class="section__eyebrow">使用案例 / 宠物配饰与生活方式用品</p><h1>从一个产品官网，<br />到一封有依据的开发信。</h1><p class="case-deck">跟着一次实际操作，看产品资料如何变成搜索方向、候选企业和经过人工审核的开发信草稿。</p><div class="case-tags"><span>匿名企业实录</span><span>五步完整流程</span><span>视频 02:14</span></div></div></header>
    <section class="section"><div class="container">
      <div id="case-video" ref="player" class="case-video">
        <button v-if="startTime === null" class="case-video__cover" aria-label="播放完整案例视频" @click="jumpTo(0)">
          <img :src="caseAsset('04-scored-leads.jpg')" alt="FTCS 线索评分操作预览" width="1920" height="1080" />
          <span>▶ 播放完整案例 · 02:14</span>
        </button>
        <iframe v-else :key="playerKey" :src="playerSrc" title="FTCS 从产品官网到开发信审核操作演示（B站播放器）" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
      <p class="small-note">视频由哔哩哔哩提供。无法播放？<a :href="watchUrl" target="_blank" rel="noopener noreferrer">前往 B 站观看 ↗</a></p>
      <div class="chapter-nav" aria-label="视频章节"><button v-for="(step, i) in caseSteps" :key="step.time" @click="jumpTo(step.time)"><span>{{ step.label }}</span>{{ ['产品画像', '搜索方向', '发现企业', '评分核验', '开发信审核'][i] }}</button></div>
      <p class="small-note">视频省略了等待过程，2 分 14 秒为剪辑时长，不代表任务实际耗时。<a href="#case-results">查看本次结果口径 ↓</a></p>
    </div></section>
    <section id="case-results" class="section section--soft"><div class="container"><div class="section__head"><p class="section__eyebrow">这次操作，留下了什么</p><h2 class="section__title">可检查的线索，可继续使用的草稿。</h2></div><div class="case-results"><div><strong>89 → 86</strong><h3>累计记录 → 去重后保留</h3><p>3 条重复记录被淘汰。</p></div><div><strong>10 <small>条</small></strong><h3>系统 A 级线索</h3><p>另有 B 级 68 条、C 级 8 条。</p></div><div><strong>1 <small>家</small></strong><h3>完成开发信草稿审核</h3><p>针对一家选定企业起草并保存。</p></div></div><p class="small-note">数字来自本次录屏中的累计线索库，非单轮新增；分级表示系统匹配判断。素材未展示邮件发送、客户回复或成交，不构成效果保证。</p></div></section>
    <section class="section"><div class="container case-context"><div><p class="section__eyebrow">任务背景</p><h2 class="section__title">先明确产品，再寻找对应渠道。</h2></div><div><p>这家企业的资料包含宠物领结与项圈、原创印花发圈与发夹、包袋等品类。探索对象包括宠物用品、礼品和配饰渠道的批发商、进口商与零售商。</p><p>操作者从企业官网生成画像，补充欧美、日本、韩国、俄罗斯等市场方向，再检查关键词与候选企业。最终开发信对应的是发饰产品与发饰批发业务。</p></div></div></section>
    <section class="case-walkthrough"><div class="container"><article v-for="(step, i) in caseSteps" :id="`step-${i + 1}`" :key="step.title" class="case-step"><div class="case-step__heading"><span class="workflow-number">0{{ i + 1 }}</span><h2>{{ step.title }}</h2><button class="text-link" @click="jumpTo(step.time)">从 {{ step.label }} 播放 ↗</button></div><div class="case-step__copy"><p><strong>怎么操作</strong>{{ step.action }}</p><p><strong>得到什么</strong>{{ step.result }}</p><p><strong>你来确认</strong>{{ step.check }}</p></div><a :href="caseAsset(step.image)" target="_blank" rel="noopener noreferrer" :aria-label="`查看大图：${step.title}`"><img :src="caseAsset(step.image)" :alt="step.title + '：实际操作截图'" width="1920" height="1080" loading="lazy" /></a></article></div></section>
    <section id="match" class="section section--soft"><div class="container"><p class="section__eyebrow">一个具体的匹配例子</p><h2 class="section__title">为什么这封信，写给 Inca Jewellery？</h2><div class="match-chain"><article><span>卖方产品</span><h3>原创印花发饰</h3><p>本次产品画像中包含发圈、蝴蝶结发夹等品类。</p></article><article><span>系统记录的匹配方向</span><h3>发饰及配饰批发业务</h3><p>案例中该企业获评 82 分 / A 级，仍需人工核验业务匹配情况。</p></article><article><span>开发信切入点</span><h3>把产品特点接到批发品类</h3><p>围绕原创印花发饰起草英文邮件，再核对个性化依据与供货承诺。</p></article></div><p class="small-note">这里展示系统记录与操作者的审核过程，不代表该企业已表达采购意向，也不构成企业对 FTCS 的推荐。</p></div></section>
    <section class="section cta-slab"><div class="container cta-slab__inner"><div><h2 class="section__title">用自己的产品，试着走一遍。</h2><p class="section__desc">先聚焦一个品类、一个市场和少量搜索词，再检查线索与草稿质量。</p></div><div class="cta-actions"><RouterLink class="btn btn-primary" to="/download">下载 Windows 版</RouterLink><RouterLink class="text-link" to="/docs/getting-started">查看快速开始 →</RouterLink></div></div></section>
  </div>
</template>
