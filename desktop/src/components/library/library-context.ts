export type LibraryContextKind = 'blank' | 'root' | 'dir' | 'file' | 'website'

export type LibraryContextAction =
  | 'mkdir'
  | 'paste'
  | 'upload'
  | 'save-website'
  | 'import-folder'
  | 'open-website'
  | 'rename'
  | 'delete'

export interface LibraryContextItem {
  id: LibraryContextAction
  label: string
  danger?: boolean
  disabled?: boolean
  hint?: string
  separatorBefore?: boolean
}

export function libraryContextItems(kind: LibraryContextKind): LibraryContextItem[] {
  if (kind === 'file') {
    return [
      { id: 'rename', label: '重命名', disabled: true, hint: '后续版本' },
      { id: 'delete', label: '删除', danger: true, separatorBefore: true },
    ]
  }

  if (kind === 'website') {
    return [
      { id: 'open-website', label: '打开网站' },
      { id: 'rename', label: '重命名', disabled: true, hint: '后续版本' },
      { id: 'delete', label: '删除', danger: true, separatorBefore: true },
    ]
  }

  const mkdirLabel = kind === 'dir' ? '新建子文件夹' : '新建文件夹'
  const pasteLabel = kind === 'blank' ? '粘贴' : '粘贴到此'
  const uploadLabel = kind === 'blank' ? '上传文件' : '上传到此'

  const items: LibraryContextItem[] = [
    { id: 'mkdir', label: mkdirLabel },
    { id: 'paste', label: pasteLabel },
    { id: 'upload', label: uploadLabel },
    {
      id: 'save-website',
      label: '保存网站',
      separatorBefore: true,
    },
    {
      id: 'import-folder',
      label: '导入文件夹',
    },
  ]

  if (kind === 'dir') {
    items.push({ id: 'rename', label: '重命名', disabled: true, hint: '后续版本' })
    items.push({ id: 'delete', label: '删除', danger: true, separatorBefore: true })
  }

  return items
}
