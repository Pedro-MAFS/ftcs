<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import { createDocument, Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import type { MailBody } from '../../../electron/mailbox/compose-types'

const props = defineProps<{ body: MailBody; expanded: boolean; disabled: boolean; label: string }>()
const emit = defineEmits<{ change: [body: MailBody] }>()
const host = ref<HTMLElement>()
const editor = shallowRef<Editor>()
let lastBody: MailBody | undefined
const formats = [
  ['bold', '加粗'],
  ['italic', '斜体'],
  ['underline', '下划线'],
  ['bulletList', '无序列表'],
  ['orderedList', '有序列表'],
] as const
function content(body: MailBody): string | JSONContent {
  return (
    body.html_body || {
      type: 'doc',
      content: body.text_body.split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      })),
    }
  )
}
function readBody(instance: Editor): MailBody {
  const lines: string[] = []
  let formatted = false
  instance.state.doc.descendants((node) => {
    if (node.isTextblock) lines.push(node.textBetween(0, node.content.size, '', '\n'))
    if (node.marks.length || node.type.name === 'bulletList' || node.type.name === 'orderedList')
      formatted = true
  })
  return { text_body: lines.join('\n'), html_body: formatted ? instance.getHTML() : undefined }
}
function format(kind: (typeof formats)[number][0]) {
  if (!props.expanded || props.disabled || !editor.value) return
  const chain = editor.value.chain().focus()
  if (kind === 'bulletList') chain.toggleBulletList().run()
  else if (kind === 'orderedList') chain.toggleOrderedList().run()
  else chain.toggleMark(kind).run()
}
function focus() {
  editor.value?.commands.focus()
}
defineExpose({ focus })
onMounted(() => {
  editor.value = new Editor({
    element: host.value,
    content: content(props.body),
    parseOptions: { preserveWhitespace: 'full' },
    editable: !props.disabled,
    injectCSS: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        strike: false,
        trailingNode: false,
        dropcursor: false,
        gapcursor: false,
      }),
    ],
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': props.label,
        spellcheck: 'true',
      },
      handleDOMEvents: {
        paste(view, event) {
          if (props.disabled || props.expanded) return false
          event.preventDefault()
          const plain = event.clipboardData?.getData('text/plain')
          if (plain) view.pasteText(plain, event)
          return true
        },
        beforeinput(_view, event) {
          if (!props.expanded && /^(format|insertOrderedList|insertUnorderedList)/.test(event.inputType)) {
            event.preventDefault()
            return true
          }
          return false
        },
        keydown(_view, event) {
          if (
            !props.expanded &&
            (event.ctrlKey || event.metaKey) &&
            (/^[biu]$/i.test(event.key) || (event.shiftKey && ['Digit7', 'Digit8'].includes(event.code)))
          ) {
            event.preventDefault()
            return true
          }
          return false
        },
        drop(_view, event) {
          if (!props.expanded) {
            event.preventDefault()
            return true
          }
          return false
        },
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (!props.disabled) {
        lastBody = readBody(instance)
        emit('change', lastBody)
      }
    },
    onTransaction: () => triggerRef(editor),
  })
  if (props.expanded && !props.disabled) focus()
})
watch(
  () => [props.body.text_body, props.body.html_body],
  () => {
    const instance = editor.value
    if (!instance) return
    // Local edits already live in the document; replaying them interrupts composition and undo.
    if (
      lastBody &&
      props.body.text_body === lastBody.text_body &&
      props.body.html_body === lastBody.html_body
    )
      return
    lastBody = props.body
    const value = content(props.body)
    const doc = createDocument(value, instance.schema, { preserveWhitespace: 'full' })
    if (!doc.eq(instance.state.doc)) instance.commands.setContent(doc, { emitUpdate: false })
  },
)
watch(
  () => props.disabled,
  (disabled) => editor.value?.setEditable(!disabled, false),
)
onBeforeUnmount(() => editor.value?.destroy())
</script>
<template>
  <div class="body-editor" :class="{ large: expanded }">
    <div v-if="expanded" class="formats" role="group" aria-label="正文格式">
      <button
        v-for="[kind, name] in formats"
        :key="kind"
        type="button"
        :class="kind"
        :title="name"
        :disabled="disabled"
        :aria-pressed="editor?.isActive(kind) ?? false"
        @mousedown.prevent
        @click="format(kind)"
      >
        {{ name }}
      </button>
    </div>
    <div ref="host" class="editor-host" />
  </div>
</template>
<style scoped>
.body-editor {
  display: flex;
  flex-direction: column;
  min-height: 52px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  overflow: hidden;
}
.body-editor:focus-within {
  border-color: var(--border-focus);
}
.formats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}
.formats button {
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font: inherit;
  padding: 4px 8px;
  cursor: pointer;
}
.formats button:hover,
.formats button[aria-pressed='true'] {
  background: var(--selected);
  color: var(--soft-blue);
}
.formats .bold {
  font-weight: 700;
}
.formats .italic {
  font-style: italic;
}
.formats .underline {
  text-decoration: underline;
}
.editor-host {
  overflow: auto;
  min-height: 0;
  max-height: 100px;
}
.large .editor-host {
  max-height: none;
  flex: 1;
  display: flex;
}
.editor-host :deep(.tiptap) {
  flex: 1;
  outline: 0;
  min-height: 48px;
  padding: 6px 9px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text);
  cursor: text;
  line-height: 1.55;
}
.large :deep(.tiptap) {
  padding: 14px 16px;
}
.editor-host :deep(p) {
  margin: 0;
}
.editor-host :deep(ul),
.editor-host :deep(ol) {
  margin: 0;
  padding-inline-start: 1.8em;
}
.editor-host :deep(ul) {
  list-style: disc;
}
.editor-host :deep(ol) {
  list-style: decimal;
}
.editor-host :deep(.tiptap p:only-child:has(> br:only-child)::before) {
  content: '写邮件…';
  color: var(--text-secondary);
  pointer-events: none;
  float: left;
  height: 0;
}
</style>
