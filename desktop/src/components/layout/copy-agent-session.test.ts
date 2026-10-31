import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { AwaitingUserReply } from '../../types/electron'
import type { AgentSubagent, AgentTimelineItem } from '../../types/workspace'
import {
  COPY_EMPTY,
  COPY_FAIL,
  COPY_OK,
  COPY_SESSION_CHAR_LIMIT,
  COPY_TRUNCATED,
  SKILL_LABELS,
  applyCopyLimit,
  buildCopySessionText,
  createCopySessionController,
  formatCopyTimestamp,
  redactSecrets,
  writeClipboardText,
  type CopySessionSource,
} from './copy-agent-session'

const SECRET_STRINGS = [
  'sk-test-FAKEKEY123456',
  'sk-live-abcdef123456',
  'sk-proj-ABCDEFGH1234',
  'sk-ant-api03-FAKEKEY1234567890',
  'AIzaSyDummyKey0123456789abcd',
]

const PLACEHOLDERS = ['点击「生成画像」后，此处按时间顺序展示过程', '任务启动中…']

function item(partial: Partial<AgentTimelineItem> & Pick<AgentTimelineItem, 'id' | 'kind'>): AgentTimelineItem {
  return {
    time: '',
    title: '',
    body: '',
    ...partial,
  }
}

function subagent(partial: Partial<AgentSubagent> = {}): AgentSubagent {
  return {
    sessionId: '',
    agent: 'general',
    description: '',
    current: '',
    toolCount: 0,
    running: false,
    awaiting: false,
    startedAt: 0,
    steps: [],
    ...partial,
  }
}

function source(partial: Partial<CopySessionSource> = {}): CopySessionSource {
  return {
    items: [item({ id: 'u1', kind: 'user', title: '你', time: '09:00:00', body: '你好' })],
    meta: [],
    skill: 'idle',
    status: 'idle',
    awaiting: null,
    productId: '',
    copiedAt: new Date(2026, 9, 31, 9, 41, 5),
    ...partial,
  }
}

function build(partial: Partial<CopySessionSource> = {}, appVersion = '0.6.1') {
  const snap = source(partial)
  return buildCopySessionText({ ...snap, appVersion })
}

describe('redactSecrets', () => {
  it('replaces the design samples and keeps company, email, path, and keyword', () => {
    const before = [
      'Authorization: Bearer sk-test-FAKEKEY123456',
      'api_key=sk-live-abcdef123456',
      'api-key: "sk-proj-ABCDEFGH1234"',
      'key=AIzaSyDummyKey0123456789abcd',
      'sk-ant-api03-FAKEKEY1234567890',
      'AIzaSyDummyKey0123456789abcd',
      '公司：绿森塑木',
      '邮箱：sales@example.com',
      '路径：D:\\FTCS_WORKSPACE\\products',
      'keyword=wpc decking',
    ].join('\n')
    const after = redactSecrets(before)
    assert.equal(
      after,
      [
        'Authorization: Bearer [REDACTED]',
        'api_key=[REDACTED]',
        'api-key: [REDACTED]',
        'key=[REDACTED]',
        '[REDACTED]',
        '[REDACTED]',
        '公司：绿森塑木',
        '邮箱：sales@example.com',
        '路径：D:\\FTCS_WORKSPACE\\products',
        'keyword=wpc decking',
      ].join('\n'),
    )
    for (const secret of SECRET_STRINGS) assert.equal(after.includes(secret), false)
  })

  it('keeps the ideographic period after a labeled secret', () => {
    assert.equal(
      redactSecrets('密钥字段是 api_key=sk-live-abcdef123456。'),
      '密钥字段是 api_key=[REDACTED]。',
    )
  })

  it('covers the other labeled forms without eating keyword, token=, or short fragments', () => {
    assert.equal(redactSecrets('x-api-key=abcdefghij'), 'x-api-key=[REDACTED]')
    assert.equal(redactSecrets('apikey: abcdefghij'), 'apikey: [REDACTED]')
    assert.equal(redactSecrets('api key=abcdefghij'), 'api key=[REDACTED]')
    assert.equal(redactSecrets('API_KEY = "abcdefghij"'), 'API_KEY = [REDACTED]')
    assert.equal(redactSecrets('keyword=wpcdecking'), 'keyword=wpcdecking')
    assert.equal(redactSecrets('mykey=abcdefghij'), 'mykey=abcdefghij')
    assert.equal(redactSecrets('token=supersecretvalue'), 'token=supersecretvalue')
    assert.equal(redactSecrets('token=sk-live-abcdef123456'), 'token=[REDACTED]')
    assert.equal(redactSecrets('key=short'), 'key=short')
    assert.equal(redactSecrets('Bearer 1234567'), 'Bearer 1234567')
    assert.equal(redactSecrets('bearer abcdefgh'), 'Bearer [REDACTED]')
    assert.equal(redactSecrets('sk-1234567'), 'sk-1234567')
    assert.equal(redactSecrets('sk-12345678'), '[REDACTED]')
    assert.equal(redactSecrets(`AIza${'a'.repeat(19)}`), `AIza${'a'.repeat(19)}`)
    assert.equal(redactSecrets(`AIza${'a'.repeat(20)}`), '[REDACTED]')
  })
})

describe('formatCopyTimestamp', () => {
  it('uses local calendar fields and a numeric offset', () => {
    const date = new Date(2026, 9, 31, 9, 41, 5)
    const offset = -date.getTimezoneOffset()
    const sign = offset >= 0 ? '+' : '-'
    const abs = Math.abs(offset)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    assert.equal(formatCopyTimestamp(date), `2026-10-31 09:41:05 ${sign}${hh}:${mm}`)
    assert.match(formatCopyTimestamp(date), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/)
  })
})

describe('buildCopySessionText', () => {
  it('matches the design sample, including meta, full text, and the waiting card', () => {
    const toolBody = [
      '请求头 Authorization: Bearer sk-test-FAKEKEY123456',
      'api_key=sk-live-abcdef123456',
      '另外一行裸密钥 sk-ant-api03-FAKEKEY1234567890',
      '公司：绿森塑木',
      '邮箱：sales@example.com',
      '路径：D:\\FTCS_WORKSPACE\\products',
      'keyword=wpc decking',
    ].join('\n')
    const copiedAt = new Date(2026, 9, 31, 9, 41, 5)
    const built = buildCopySessionText({
      appVersion: '0.6.1',
      copiedAt,
      skill: 'expand-keywords',
      status: 'running',
      productId: 'prod_20261031_greenwood',
      meta: [
        { label: '状态', value: '扩展中' },
        { label: '产品', value: 'prod_20261031_gree' },
        { label: '耗时', value: '01:02' },
        { label: '来源', value: '画像' },
      ],
      awaiting: {
        renderable: true,
        questions: [
          {
            header: '确认范围',
            question: '这次扩展要不要包含围栏？',
            multiple: false,
            custom: true,
            options: [
              { label: '只要地板', description: '' },
              { label: '地板和围栏', description: '围栏套件一并出词' },
            ],
          },
        ],
      },
      items: [
        item({
          id: 'sys-prep',
          kind: 'system',
          title: '系统',
          time: '09:40:01',
          body: '准备为 prod_20261031_greenwood（绿森塑木）扩展关键词 · 按标准档 R1 目标 20',
        }),
        item({
          id: 'user-expand',
          kind: 'user',
          title: '你的指令 · 新建探索任务',
          time: '09:40:02',
          body: '请为绿森塑木扩展户外地板关键词。联系邮箱 sales@example.com。资料在 D:\\FTCS_WORKSPACE\\products。',
          collapsed: true,
        }),
        item({
          id: 'sys-session',
          kind: 'system',
          title: '会话',
          time: '09:40:03',
          body: '已创建 OpenCode session\nses_demo_expand_001',
        }),
        item({
          id: 'think',
          kind: 'reasoning',
          title: '思考',
          time: '09:40:10',
          body: '先看画像里的户外地板，再扩展英文检索词。',
          collapsed: true,
        }),
        item({
          id: 'tool-search',
          kind: 'tool',
          title: 'search_web',
          time: '09:40:12',
          status: 'done',
          body: toolBody,
        }),
        item({
          id: 'err',
          kind: 'error',
          title: '搜索超时',
          time: '09:40:13',
          body: 'search_web 在 30 秒内没有返回。',
        }),
        item({
          id: 'reply',
          kind: 'assistant',
          title: '回复',
          time: '09:40:20',
          body: '关键词扩展做到一半，需要你确认要不要把「围栏」算进去。',
        }),
        item({
          id: 'child',
          kind: 'tool',
          title: '检索英文站',
          time: '09:40:30',
          status: 'running',
          collapsed: true,
          subagent: subagent({
            sessionId: 'ses_demo_child_001',
            agent: 'research',
            description: '检索英文站',
            current: '正在看官网',
            toolCount: 1,
            running: true,
            steps: [
              {
                id: 's1',
                kind: 'tool',
                title: 'fetch_page',
                status: 'done',
                body: '页面提到 sales@example.com，密钥字段是 api_key=sk-live-abcdef123456。',
              },
              {
                id: 's2',
                kind: 'reasoning',
                title: '归纳',
                body: '围栏和地板可以分成两组词。',
              },
            ],
          }),
        }),
      ],
    })

    const expected = `# FTCS 智能体会话

## 元信息
- 应用版本：0.6.1
- 复制时间：${formatCopyTimestamp(copiedAt)}
- 技能：关键词扩展（expand-keywords）
- 运行状态：任务在等你回复
- 产品标识：prod_20261031_greenwood
- 会话：ses_demo_expand_001
- 栏上状态：状态=扩展中；产品=prod_20261031_gree；耗时=01:02；来源=画像
- 错误条数：1
- 最近错误：错误 · 搜索超时

## 会话正文

### 1. 系统 · 系统 · 09:40:01
准备为 prod_20261031_greenwood（绿森塑木）扩展关键词 · 按标准档 R1 目标 20

### 2. 你 · 你的指令 · 新建探索任务 · 09:40:02
请为绿森塑木扩展户外地板关键词。联系邮箱 sales@example.com。资料在 D:\\FTCS_WORKSPACE\\products。

### 3. 系统 · 会话 · 09:40:03
已创建 OpenCode session
ses_demo_expand_001

### 4. 思考 · 思考 · 09:40:10
先看画像里的户外地板，再扩展英文检索词。

### 5. 工具 · search_web · 09:40:12
状态：完成
请求头 Authorization: Bearer [REDACTED]
api_key=[REDACTED]
另外一行裸密钥 [REDACTED]
公司：绿森塑木
邮箱：sales@example.com
路径：D:\\FTCS_WORKSPACE\\products
keyword=wpc decking

### 6. 错误 · 搜索超时 · 09:40:13
search_web 在 30 秒内没有返回。

### 7. 回复 · 回复 · 09:40:20
关键词扩展做到一半，需要你确认要不要把「围栏」算进去。

### 8. 子代理 · 检索英文站 · 09:40:30
Research · 进行中
↳ 正在看官网
子会话：ses_demo_child_001
状态：进行中

#### 步骤 1. 工具 · fetch_page
状态：完成
页面提到 sales@example.com，密钥字段是 api_key=[REDACTED]。

#### 步骤 2. 思考 · 归纳
围栏和地板可以分成两组词。

## 等待用户回复

### 确认范围
这次扩展要不要包含围栏？
- 只要地板
- 地板和围栏：围栏套件一并出词
- 输入自己的答案`
    assert.equal(built.truncated, false)
    assert.equal(built.text, expected)
    for (const secret of SECRET_STRINGS) assert.equal(built.text.includes(secret), false)
    for (const placeholder of PLACEHOLDERS) assert.equal(built.text.includes(placeholder), false)
    assert.equal(built.text.includes('未提交的自填'), false)
  })

  it('copies the in-memory full text rather than the 160/80 preview', () => {
    const userBody = `${'A'.repeat(200)}ENDMARK`
    const stepBody = `${'B'.repeat(100)}ENDMARK2`
    const folded = build({
      items: [
        item({ id: 'u', kind: 'user', title: '你', body: userBody, collapsed: true }),
        item({
          id: 'child',
          kind: 'tool',
          collapsed: true,
          subagent: subagent({
            description: '子任务',
            steps: [{ id: 's', kind: 'tool', title: 'fetch', body: stepBody }],
          }),
        }),
      ],
    })
    const expanded = build({
      items: [
        item({ id: 'u', kind: 'user', title: '你', body: userBody, collapsed: false }),
        item({
          id: 'child',
          kind: 'tool',
          collapsed: false,
          subagent: subagent({
            description: '子任务',
            steps: [{ id: 's', kind: 'tool', title: 'fetch', body: stepBody }],
          }),
        }),
      ],
    })
    assert.equal(folded.text, expanded.text)
    assert.equal(folded.text.includes(userBody), true)
    assert.equal(folded.text.includes(stepBody), true)
    assert.equal(folded.text.includes('…'), false)
    assert.equal(folded.text.includes('#### 结果'), false)
  })

  it('omits optional meta lines and still reports zero errors', () => {
    const built = build({
      skill: 'not-a-skill',
      status: 'idle',
      productId: '',
      meta: [],
      awaiting: null,
      items: [item({ id: 'u', kind: 'user', title: '', time: '', body: '只有正文' })],
    })
    assert.match(built.text, /^- 技能：任务（not-a-skill）$/m)
    assert.match(built.text, /^- 运行状态：空闲$/m)
    assert.match(built.text, /^- 错误条数：0$/m)
    assert.equal(/^ - 产品标识：/m.test(built.text), false)
    assert.equal(/^- 产品标识：/m.test(built.text), false)
    assert.equal(/^- 会话：/m.test(built.text), false)
    assert.equal(/^- 栏上状态：/m.test(built.text), false)
    assert.equal(/^- 最近错误：/m.test(built.text), false)
    assert.equal(built.text.includes('## 等待用户回复'), false)
    assert.equal(built.text.indexOf('## 元信息') < built.text.indexOf('## 会话正文'), true)
  })

  it('reads the last qualifying sys-session line and skips a missing one', () => {
    const withSession = build({
      items: [
        item({
          id: 'sys-session',
          kind: 'system',
          body: '已创建 OpenCode session\nses_first',
        }),
        item({
          id: 'sys-session',
          kind: 'system',
          body: '已创建 OpenCode session\nses_last',
        }),
      ],
    })
    assert.match(withSession.text, /^- 会话：ses_last$/m)
    assert.deepEqual(withSession.text.match(/^- 会话：.*$/gm), ['- 会话：ses_last'])

    const invalidLast = build({
      items: [
        item({
          id: 'sys-session',
          kind: 'system',
          body: '已创建 OpenCode session\nses_keep',
        }),
        item({ id: 'sys-session', kind: 'system', body: '别的系统消息\nses_ignore' }),
      ],
    })
    assert.match(invalidLast.text, /^- 会话：ses_keep$/m)
    assert.equal(/^- 会话：ses_ignore$/m.test(invalidLast.text), false)

    const blankSecond = build({
      items: [item({ id: 'sys-session', kind: 'system', body: '已创建 OpenCode session\n   ' })],
    })
    assert.equal(/^- 会话：/m.test(blankSecond.text), false)
  })

  it('redacts secrets that show up in the meta lines', () => {
    const built = build({
      productId: 'sk-live-abcdef123456',
      items: [item({ id: 'u', kind: 'user', body: '正文' })],
    })
    assert.equal(built.text.includes('sk-live-abcdef123456'), false)
    assert.match(built.text, /^- 产品标识：\[REDACTED\]$/m)
  })

  it('writes fallback versions and keeps the live 0.0.0 fallback', () => {
    assert.match(build({}, '').text, /^- 应用版本：未能读取$/m)
    assert.match(build({}, '   ').text, /^- 应用版本：未能读取$/m)
    assert.match(build({}, '0.0.0').text, /^- 应用版本：0\.0\.0$/m)
  })

  it('counts item and step errors, and names the last one', () => {
    const built = build({
      items: [
        item({
          id: 'tool',
          kind: 'tool',
          title: 'search',
          status: 'error',
          subagent: subagent({
            description: '检索',
            steps: [
              { id: 'ok', kind: 'tool', title: 'fetch', status: 'done', body: 'ok' },
              { id: 'bad', kind: 'error', title: '', status: 'error', body: '失败详情' },
            ],
          }),
        }),
        item({ id: 'later', kind: 'assistant', title: '回复', body: '继续' }),
      ],
    })
    assert.match(built.text, /^- 错误条数：2$/m)
    assert.match(built.text, /^- 最近错误：错误 · （无标题）$/m)
    assert.equal(built.text.includes('失败详情'), true)
    assert.equal(built.text.includes('#### 结果'), false)
  })

  it('writes a subagent result and a done summary when the body is present', () => {
    const startedAt = Date.parse('2026-10-31T09:40:00+08:00')
    const built = build({
      awaiting: null,
      status: 'done',
      items: [
        item({
          id: 'child',
          kind: 'tool',
          status: 'done',
          time: '09:41:05',
          body: '汇总完毕',
          subagent: subagent({
            sessionId: '   ',
            agent: 'research',
            description: '',
            current: '',
            toolCount: 2,
            startedAt,
            finishedAt: startedAt + 65_000,
            steps: [],
          }),
        }),
      ],
    })
    assert.match(built.text, /### 1\. 子代理 · 09:41:05/)
    assert.match(built.text, /Research · 完成 · 2 次工具 · 1 分 5 秒/)
    assert.match(built.text, /↳ 2 次工具/)
    assert.equal(built.text.includes('子会话：'), false)
    assert.match(built.text, /#### 结果\n汇总完毕/)
  })

  it('writes the visible waiting-card text and skips an unsubmitted draft', () => {
    const draft = '用户还没提交的自填答案'
    const renderable: AwaitingUserReply = {
      renderable: true,
      questions: [
        {
          header: '第一题',
          question: '选一个',
          multiple: false,
          custom: false,
          options: [{ label: '甲', description: '' }],
        },
        {
          header: '第二题',
          question: '再选',
          multiple: true,
          custom: true,
          options: [{ label: '乙', description: '说明' }],
        },
      ],
    }
    const built = build({ awaiting: renderable, status: 'running' })
    assert.match(built.text, /^- 运行状态：任务在等你回复$/m)
    assert.equal(built.text.includes(draft), false)
    assert.match(
      built.text,
      /## 等待用户回复\n\n### 第一题\n选一个\n- 甲\n\n### 第二题\n再选\n- 乙：说明\n- 输入自己的答案$/,
    )

    const fallback = build({
      awaiting: { renderable: false, questions: [] },
      items: [item({ id: 'u', kind: 'user', body: '有条目' })],
    })
    assert.equal(fallback.text.includes('## 等待用户回复'), true)
    assert.equal(fallback.text.includes('这项操作需要你处理，当前无法代为回答。'), true)
    assert.equal(fallback.text.includes('选一个'), false)
  })

  it('keeps the skill table aligned with the panel labels', () => {
    assert.equal(SKILL_LABELS['extract-product-profile'], '画像生成')
    assert.equal(SKILL_LABELS['expand-keywords'], '关键词扩展')
    assert.equal(SKILL_LABELS['discover-leads'], '全网搜索')
    assert.equal(SKILL_LABELS['discover-leads-r2'], '社媒发现')
    assert.equal(SKILL_LABELS['discover-leads-r3'], '地图发现')
    assert.equal(SKILL_LABELS['score-and-dedupe'], '评分去重')
    assert.equal(SKILL_LABELS['enrich-lead-contacts'], '补全联系人')
    assert.equal(SKILL_LABELS['draft-outreach-email'], '起草开发信')
    assert.equal(SKILL_LABELS['translate-outreach-email'], '翻译对照')
    assert.equal(SKILL_LABELS.idle, '空闲')
  })
})

describe('applyCopyLimit', () => {
  function textOfLength(length: number): string {
    const head = '## 元信息\n- 应用版本：1\n\n## 会话正文\n'
    assert.ok(length > head.length)
    return head + 'A'.repeat(length - head.length)
  }

  it('leaves a 200000-character text unchanged', () => {
    const text = textOfLength(200_000)
    const limited = applyCopyLimit(text)
    assert.equal(limited.truncated, false)
    assert.equal(limited.text, text)
    assert.equal(limited.text.includes('已截断'), false)
  })

  it('notes N=200001 and keeps the first 200000 characters', () => {
    const text = textOfLength(200_001)
    const limited = applyCopyLimit(text)
    assert.equal(limited.truncated, true)
    assert.equal(limited.text.length, COPY_SESSION_CHAR_LIMIT)
    assert.equal(limited.text.includes('已截断，原长 200001，保留前 200000'), true)
    assert.equal(limited.text.indexOf('已截断') < limited.text.indexOf('## 会话正文'), true)
    assert.equal(limited.text.endsWith('A'.repeat(200_001 - '## 元信息\n- 应用版本：1\n\n## 会话正文\n'.length)), false)
  })

  it('notes N=250400 the same way', () => {
    const text = textOfLength(250_400)
    const limited = applyCopyLimit(text)
    assert.equal(limited.text.length, 200_000)
    assert.equal(limited.text.includes('已截断，原长 250400，保留前 200000'), true)
  })
})

describe('createCopySessionController', () => {
  it('toasts on an empty timeline and does not read the version or clipboard', async () => {
    let versionCalls = 0
    const writes: string[] = []
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => {
        versionCalls += 1
        return '0.6.1'
      },
      writeClipboard: async (text) => {
        writes.push(text)
        return true
      },
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    const snap = source({
      items: [],
      awaiting: { renderable: true, questions: [] },
    })
    await ctl.copy(snap)
    assert.deepEqual(toasts, [{ message: COPY_EMPTY, tone: undefined }])
    assert.equal(versionCalls, 0)
    assert.deepEqual(writes, [])
  })

  it('keeps the click snapshot while the version request is in flight', async () => {
    let resolveVersion: (value: string) => void = () => {}
    const version = new Promise<string>((resolve) => {
      resolveVersion = resolve
    })
    let written = ''
    const ctl = createCopySessionController({
      readAppVersion: () => version,
      writeClipboard: async (text) => {
        written = text
        return true
      },
      showToast: () => {},
    })
    const snap = source({
      items: [item({ id: 'u', kind: 'user', title: '你', body: '点击瞬间' })],
    })
    const pending = ctl.copy(snap)
    snap.items.push(item({ id: 'late', kind: 'assistant', title: '后到', body: '不该出现' }))
    snap.items[0]!.body = '被改写'
    resolveVersion('9.9.9')
    await pending
    assert.equal(written.includes('点击瞬间'), true)
    assert.equal(written.includes('被改写'), false)
    assert.equal(written.includes('不该出现'), false)
    assert.match(written, /^- 应用版本：9\.9\.9$/m)
  })

  it('uses the truncated toast when the redacted text is over the limit', async () => {
    const toasts: string[] = []
    let written = ''
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        written = text
        return true
      },
      showToast: (message) => {
        toasts.push(message)
      },
    })
    await ctl.copy(
      source({
        items: [item({ id: 'u', kind: 'user', body: 'A'.repeat(COPY_SESSION_CHAR_LIMIT) })],
      }),
    )
    assert.deepEqual(toasts, [COPY_TRUNCATED])
    assert.equal(written.length, COPY_SESSION_CHAR_LIMIT)
    assert.match(written, /已截断，原长 \d+，保留前 200000/)
  })

  it('ignores a second click until the first copy finishes', async () => {
    let resolveVersion: (value: string) => void = () => {}
    const version = new Promise<string>((resolve) => {
      resolveVersion = resolve
    })
    const toasts: string[] = []
    const ctl = createCopySessionController({
      readAppVersion: () => version,
      writeClipboard: async () => true,
      showToast: (message) => {
        toasts.push(message)
      },
    })
    const first = ctl.copy(source())
    const second = ctl.copy(source({ items: [item({ id: 'other', kind: 'user', body: '第二下' })] }))
    assert.equal(ctl.isCopying(), true)
    resolveVersion('0.6.1')
    await first
    await second
    assert.deepEqual(toasts, [COPY_OK])
    assert.equal(ctl.isCopying(), false)
  })

  it('toasts failure without changing the source timeline', async () => {
    const snap = source()
    const before = JSON.stringify(snap)
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => {
        throw new Error('version down')
      },
      writeClipboard: async () => false,
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    await ctl.copy(snap)
    assert.deepEqual(toasts, [{ message: COPY_FAIL, tone: 'error' }])
    assert.equal(JSON.stringify(snap), before)
    assert.equal(ctl.isCopying(), false)
  })

  it('still copies when the version call throws, and says the version was unread', async () => {
    let written = ''
    const toasts: string[] = []
    const ctl = createCopySessionController({
      readAppVersion: async () => {
        throw new Error('missing')
      },
      writeClipboard: async (text) => {
        written = text
        return true
      },
      showToast: (message) => {
        toasts.push(message)
      },
    })
    await ctl.copy(source())
    assert.deepEqual(toasts, [COPY_OK])
    assert.match(written, /^- 应用版本：未能读取$/m)
  })
})

function restoreGlobal(name: 'navigator' | 'document', prev: PropertyDescriptor | undefined): void {
  if (prev) Object.defineProperty(globalThis, name, prev)
  else Reflect.deleteProperty(globalThis, name)
}

describe('writeClipboardText', () => {
  const restores: Array<() => void> = []

  afterEach(() => {
    while (restores.length) restores.pop()?.()
  })

  function install(options: {
    writeText?: (text: string) => Promise<void>
    exec?: (command: string) => boolean
    failCreate?: boolean
  }) {
    const areas: FakeArea[] = []
    const commands: string[] = []
    const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const prevDoc = Object.getOwnPropertyDescriptor(globalThis, 'document')

    class FakeArea {
      value = ''
      style = { position: '', left: '' }
      attrs: Record<string, string> = {}
      selected = false
      removed = false
      setAttribute(name: string, value: string) {
        this.attrs[name] = value
      }
      select() {
        this.selected = true
      }
      remove() {
        this.removed = true
      }
    }

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: options.writeText ? { writeText: options.writeText } : undefined,
      },
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        body: {
          appendChild(node: FakeArea) {
            areas.push(node)
          },
        },
        createElement() {
          if (options.failCreate) throw new Error('create')
          return new FakeArea()
        },
        execCommand(command: string) {
          commands.push(command)
          if (!options.exec) throw new Error('no exec')
          return options.exec(command)
        },
      },
    })
    restores.push(() => {
      restoreGlobal('navigator', prevNav)
      restoreGlobal('document', prevDoc)
    })
    return { areas, commands }
  }

  it('returns true from writeText and does not create a textarea', async () => {
    let written = ''
    const { areas } = install({
      writeText: async (text: string) => {
        written = text
      },
    })
    assert.equal(await writeClipboardText('会话全文'), true)
    assert.equal(written, '会话全文')
    assert.equal(areas.length, 0)
  })

  it('falls back to a hidden textarea and removes it', async () => {
    const { areas, commands } = install({
      writeText: async () => {
        throw new Error('denied')
      },
      exec: () => true,
    })
    assert.equal(await writeClipboardText('回退全文'), true)
    assert.equal(areas.length, 1)
    const area = areas[0]!
    assert.equal(area.value, '回退全文')
    assert.equal(area.attrs.readonly, 'true')
    assert.equal(area.style.position, 'fixed')
    assert.equal(area.style.left, '-9999px')
    assert.equal(area.selected, true)
    assert.deepEqual(commands, ['copy'])
    assert.equal(area.removed, true)
  })

  it('returns false when both clipboard paths fail, and still removes the textarea', async () => {
    const { areas } = install({
      writeText: async () => {
        throw new Error('denied')
      },
      exec: () => false,
    })
    assert.equal(await writeClipboardText('失败全文'), false)
    assert.equal(areas[0]?.removed, true)
  })

  it('returns false when the textarea cannot be created', async () => {
    install({
      writeText: async () => {
        throw new Error('denied')
      },
      failCreate: true,
    })
    assert.equal(await writeClipboardText('失败全文'), false)
  })

  it('uses the same success toast for writeText and the textarea fallback', async () => {
    const cases: Array<() => ReturnType<typeof install>> = [
      () => install({ writeText: async () => {} }),
      () =>
        install({
          writeText: async () => {
            throw new Error('denied')
          },
          exec: () => true,
        }),
    ]
    for (const setup of cases) {
      setup()
      const toasts: Array<{ message: string; tone?: string }> = []
      const ctl = createCopySessionController({
        readAppVersion: async () => '0.6.1',
        writeClipboard: writeClipboardText,
        showToast: (message, options) => {
          toasts.push({ message, tone: options?.tone })
        },
      })
      await ctl.copy(source())
      assert.deepEqual(toasts, [{ message: COPY_OK, tone: 'success' }])
    }
  })

  it('toasts the failure copy when writeText and execCommand both fail', async () => {
    install({
      writeText: async () => {
        throw new Error('denied')
      },
      exec: () => false,
    })
    const snap = source()
    const before = JSON.stringify(snap.items)
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: writeClipboardText,
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    await ctl.copy(snap)
    assert.deepEqual(toasts, [{ message: COPY_FAIL, tone: 'error' }])
    assert.equal(JSON.stringify(snap.items), before)
  })
})
