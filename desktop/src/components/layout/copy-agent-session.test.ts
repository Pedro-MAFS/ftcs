import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { AwaitingUserReply } from '../../types/electron'
import type { AgentSubagent, AgentTimelineItem } from '../../types/workspace'
import {
  CLIP_SAVE_FAIL,
  COPY_EMPTY,
  COPY_FAIL,
  COPY_OK,
  COPY_SESSION_CHAR_LIMIT,
  SKILL_LABELS,
  buildCopySessionText,
  clipSavedLine,
  copySaveFailToast,
  copySavedToast,
  createCopySessionController,
  formatCopyTimestamp,
  formatSessionDownloadName,
  redactSecrets,
  writeClipboardText,
  type CopySessionSource,
  type SaveTextToDownloadsInput,
  type SaveTextToDownloadsResult,
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

/** 拼出脱敏后长度恰好为 length 的快照。版本与点击时间固定，方便和控制器对照。 */
function sourceOfLength(length: number, bodySuffix = ''): CopySessionSource {
  const copiedAt = new Date(2026, 10, 1, 15, 30, 45)
  const probeBody = bodySuffix || 'A'
  const probe = buildCopySessionText({
    ...source({
      items: [item({ id: 'u', kind: 'user', body: probeBody })],
      copiedAt,
    }),
    appVersion: '0.6.1',
  })
  const pad = length - probe.text.length
  assert.ok(pad >= 0, `body shorter than target: ${probe.text.length} > ${length}`)
  return source({
    items: [item({ id: 'u', kind: 'user', body: `${'A'.repeat(pad)}${probeBody}` })],
    copiedAt,
  })
}

function refuseSave(): Promise<SaveTextToDownloadsResult> {
  return Promise.reject(new Error('should not save'))
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

describe('formatSessionDownloadName', () => {
  it('uses zero-padded local time and a fixed txt extension', () => {
    assert.equal(
      formatSessionDownloadName(new Date(2026, 10, 1, 15, 30, 45)),
      'ftcs-session-20261101-153045.txt',
    )
    assert.equal(
      formatSessionDownloadName(new Date(2026, 0, 2, 3, 4, 5)),
      'ftcs-session-20260102-030405.txt',
    )
  })
})

describe('buildCopySessionText length', () => {
  it('does not invent placeholder sentences for an empty timeline', () => {
    const built = build({ items: [] })
    for (const placeholder of PLACEHOLDERS) assert.equal(built.text.includes(placeholder), false)
    assert.equal(built.text.includes('当前没有可复制的会话'), false)
    assert.equal(built.text.includes('已截断'), false)
  })

  it('leaves N=200000 unchanged, with no truncation note and no path line', () => {
    const snap = sourceOfLength(COPY_SESSION_CHAR_LIMIT)
    const built = buildCopySessionText({ ...snap, appVersion: '0.6.1' })
    assert.equal(built.text.length, COPY_SESSION_CHAR_LIMIT)
    assert.equal(built.text.includes('已截断'), false)
    assert.equal(built.text.includes('全文已保存'), false)
  })

  it('keeps N=200001 in full and does not slice', () => {
    const snap = sourceOfLength(200_001, 'ENDMARK')
    const built = buildCopySessionText({ ...snap, appVersion: '0.6.1' })
    assert.equal(built.text.length, 200_001)
    assert.equal(built.text.endsWith('ENDMARK'), true)
    assert.equal(built.text.includes('已截断'), false)
    assert.equal(built.text.includes('全文已保存'), false)
    assert.equal(built.text.includes('会话过长'), false)
  })
})

describe('createCopySessionController', () => {
  it('toasts on an empty timeline and does not read the version, clipboard, or downloads', async () => {
    let versionCalls = 0
    const writes: string[] = []
    const saves: SaveTextToDownloadsInput[] = []
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
      saveTextToDownloads: async (input) => {
        saves.push(input)
        return { ok: true, path: 'should-not-save.txt' }
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
    assert.deepEqual(saves, [])
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
      saveTextToDownloads: refuseSave,
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

  it('copies the full text at N=200000 and does not save a file', async () => {
    const writes: string[] = []
    const saves: SaveTextToDownloadsInput[] = []
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        return true
      },
      saveTextToDownloads: async (input) => {
        saves.push(input)
        return { ok: true, path: 'should-not-save.txt' }
      },
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    const snap = sourceOfLength(COPY_SESSION_CHAR_LIMIT)
    const expected = buildCopySessionText({ ...snap, appVersion: '0.6.1' }).text
    await ctl.copy(snap)
    assert.deepEqual(saves, [])
    assert.deepEqual(writes, [expected])
    assert.equal(writes[0]?.length, COPY_SESSION_CHAR_LIMIT)
    assert.equal(writes[0]?.includes('已截断'), false)
    assert.equal(writes[0]?.includes('全文已保存'), false)
    assert.deepEqual(toasts, [{ message: COPY_OK, tone: 'success' }])
  })

  it('saves the full text when N=200001 and puts only the path line on the clipboard', async () => {
    const writes: string[] = []
    const saves: SaveTextToDownloadsInput[] = []
    const toasts: Array<{ message: string; tone?: string }> = []
    const savedPath = 'D:\\Users\\me\\Downloads\\ftcs-session-20261101-153045-1.txt'
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        return true
      },
      saveTextToDownloads: async (input) => {
        saves.push({ suggestedName: input.suggestedName, content: input.content })
        return { ok: true, path: savedPath }
      },
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    const snap = sourceOfLength(200_001, 'ENDMARK')
    const full = buildCopySessionText({ ...snap, appVersion: '0.6.1' }).text
    await ctl.copy(snap)
    assert.equal(saves.length, 1)
    assert.equal(saves[0]?.suggestedName, 'ftcs-session-20261101-153045.txt')
    assert.equal(saves[0]?.content, full)
    assert.equal(saves[0]?.content.length, 200_001)
    assert.equal(saves[0]?.content.endsWith('ENDMARK'), true)
    assert.equal(saves[0]?.content.includes('已截断'), false)
    assert.equal(saves[0]?.content.includes('sk-test-FAKEKEY123456'), false)
    assert.deepEqual(writes, [clipSavedLine(savedPath)])
    assert.equal(writes[0], `会话过长，全文已保存到：${savedPath}`)
    assert.equal(writes[0]?.includes('\n'), false)
    assert.equal(writes[0]?.includes('应用版本'), false)
    assert.equal(writes[0]?.includes('ENDMARK'), false)
    assert.equal(writes[0]?.includes('已截断'), false)
    assert.notEqual(writes[0]?.length, COPY_SESSION_CHAR_LIMIT)
    assert.deepEqual(toasts, [{ message: copySavedToast(savedPath), tone: 'success' }])
    assert.equal(toasts[0]?.message, `内容过长，已保存全文到 ${savedPath}`)
  })

  it('keeps the success toast when the one-line clipboard write fails', async () => {
    const writes: string[] = []
    const savedPath = '/home/me/Downloads/ftcs-session-20261101-153045.txt'
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        return false
      },
      saveTextToDownloads: async () => ({ ok: true, path: savedPath }),
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    await ctl.copy(sourceOfLength(200_001))
    assert.deepEqual(writes, [clipSavedLine(savedPath)])
    assert.deepEqual(toasts, [{ message: copySavedToast(savedPath), tone: 'success' }])
    assert.equal(toasts.some((toast) => toast.message === COPY_FAIL), false)
  })

  it('toasts the save error and copies only the failure line', async () => {
    const writes: string[] = []
    const saves: SaveTextToDownloadsInput[] = []
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        return true
      },
      saveTextToDownloads: async (input) => {
        saves.push(input)
        return { ok: false, error: '磁盘已满' }
      },
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    const snap = sourceOfLength(200_001, 'ENDMARK')
    const before = JSON.stringify(snap)
    await ctl.copy(snap)
    assert.equal(saves[0]?.content.length, 200_001)
    assert.equal(saves[0]?.content.includes('已截断'), false)
    assert.deepEqual(writes, [CLIP_SAVE_FAIL])
    assert.equal(writes[0], '会话过长，全文保存失败')
    assert.equal(writes[0]?.includes('\n'), false)
    assert.equal(writes[0]?.includes('ENDMARK'), false)
    assert.deepEqual(toasts, [{ message: copySaveFailToast('磁盘已满'), tone: 'error' }])
    assert.equal(toasts[0]?.message, '保存全文失败：磁盘已满')
    assert.equal(toasts.some((toast) => toast.message === COPY_FAIL), false)
    assert.equal(JSON.stringify(snap), before)
  })

  it('keeps the save-failure toast when the failure line cannot be copied', async () => {
    const writes: string[] = []
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        return false
      },
      saveTextToDownloads: async () => ({ ok: false, error: '权限不足' }),
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    await ctl.copy(sourceOfLength(200_001))
    assert.deepEqual(writes, [CLIP_SAVE_FAIL])
    assert.deepEqual(toasts, [{ message: '保存全文失败：权限不足', tone: 'error' }])
  })

  it('uses the first line of a thrown save error and does not copy the long text', async () => {
    const writes: string[] = []
    const toasts: Array<{ message: string; tone?: string }> = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        throw new Error('clipboard down')
      },
      saveTextToDownloads: async () => {
        throw new Error(`${'错'.repeat(150)}\n    at saveTextToDownloads`)
      },
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    await ctl.copy(sourceOfLength(200_001))
    const reason = '错'.repeat(120)
    assert.deepEqual(toasts, [{ message: `保存全文失败：${reason}`, tone: 'error' }])
    assert.equal(toasts[0]?.message.includes('\n'), false)
    assert.equal(toasts[0]?.message.includes('at saveTextToDownloads'), false)
    assert.deepEqual(writes, [CLIP_SAVE_FAIL])
    assert.equal(ctl.isCopying(), false)
  })

  it('redacts secrets in the saved text and leaves them off the one-line clipboard', async () => {
    const secret = 'sk-test-FAKEKEY123456'
    const writes: string[] = []
    let saved = ''
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async (text) => {
        writes.push(text)
        return true
      },
      saveTextToDownloads: async (input) => {
        saved = input.content
        return { ok: true, path: '/tmp/ftcs-session-20261101-153045.txt' }
      },
      showToast: () => {},
    })
    const base = sourceOfLength(200_001 + secret.length)
    const body = base.items[0]?.body ?? ''
    base.items[0]!.body = `${secret}\n${body.slice(secret.length + 1)}`
    await ctl.copy(base)
    assert.equal(saved.includes(secret), false)
    assert.equal(saved.includes('[REDACTED]'), true)
    assert.equal(saved.length > COPY_SESSION_CHAR_LIMIT, true)
    assert.equal(writes[0]?.includes(secret), false)
    assert.equal(writes[0]?.includes('[REDACTED]'), false)
    assert.equal(writes[0]?.includes('\n'), false)
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
      saveTextToDownloads: refuseSave,
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

  it('ignores a second click while an over-limit save is in flight', async () => {
    let release: (result: SaveTextToDownloadsResult) => void = () => {}
    const gate = new Promise<SaveTextToDownloadsResult>((resolve) => {
      release = resolve
    })
    const saves: string[] = []
    const toasts: string[] = []
    const ctl = createCopySessionController({
      readAppVersion: async () => '0.6.1',
      writeClipboard: async () => true,
      saveTextToDownloads: async (input) => {
        saves.push(input.suggestedName)
        return gate
      },
      showToast: (message) => {
        toasts.push(message)
      },
    })
    const first = ctl.copy(sourceOfLength(200_001))
    const second = ctl.copy(sourceOfLength(200_001))
    await Promise.resolve()
    assert.equal(ctl.isCopying(), true)
    assert.equal(saves.length, 1)
    release({ ok: true, path: '/tmp/ftcs-session-20261101-153045.txt' })
    await first
    await second
    assert.deepEqual(saves, ['ftcs-session-20261101-153045.txt'])
    assert.deepEqual(toasts, [copySavedToast('/tmp/ftcs-session-20261101-153045.txt')])
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
      saveTextToDownloads: refuseSave,
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
      saveTextToDownloads: refuseSave,
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
        saveTextToDownloads: refuseSave,
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
      saveTextToDownloads: refuseSave,
      showToast: (message, options) => {
        toasts.push({ message, tone: options?.tone })
      },
    })
    await ctl.copy(snap)
    assert.deepEqual(toasts, [{ message: COPY_FAIL, tone: 'error' }])
    assert.equal(JSON.stringify(snap.items), before)
  })
})
