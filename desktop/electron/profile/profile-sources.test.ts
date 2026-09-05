import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeSourceInputs, type SourcesManifest } from './profile-sources.ts'

const manifest: SourcesManifest = {
  product_id: 'prod_20260818_001',
  created_at: '2026-08-18T00:00:00.000Z',
  files: ['data/products/prod_20260818_001/inputs/绿森/地板/说明.md'],
  source_inputs: [
    {
      type: 'website',
      library_path: '绿森/地板/www.example.com.md',
      url: 'https://www.example.com',
    },
    { type: 'file', library_path: '绿森/地板/说明.md' },
  ],
}

describe('mergeSourceInputs', () => {
  it('fills missing website and file entries from _sources.json', () => {
    const merged = mergeSourceInputs([], manifest)
    assert.deepEqual(merged, [
      {
        type: 'website',
        url: 'https://www.example.com',
        crawled_at: '2026-08-18T00:00:00.000Z',
      },
      {
        type: 'file',
        path: 'data/products/prod_20260818_001/inputs/绿森/地板/说明.md',
        uploaded_at: '2026-08-18T00:00:00.000Z',
      },
    ])
  })

  it('drops bookmark markdown recorded as a file and keeps extra crawled URLs', () => {
    const merged = mergeSourceInputs(
      [
        { type: 'website', url: 'https://www.example.com', crawled_at: 'keep-me' },
        { type: 'website', url: 'https://www.example.com/about', crawled_at: 'inner' },
        {
          type: 'file',
          path: 'data/products/prod_20260818_001/inputs/绿森/地板/www.example.com.md',
        },
      ],
      manifest,
    )
    assert.deepEqual(merged, [
      { type: 'website', url: 'https://www.example.com', crawled_at: 'keep-me' },
      { type: 'website', url: 'https://www.example.com/about', crawled_at: 'inner' },
      {
        type: 'file',
        path: 'data/products/prod_20260818_001/inputs/绿森/地板/说明.md',
        uploaded_at: '2026-08-18T00:00:00.000Z',
      },
    ])
  })

  it('leaves manual drafts unchanged', () => {
    const manual = [{ type: 'manual', note: '手工创建草稿' }]
    assert.deepEqual(mergeSourceInputs(manual, manifest), manual)
  })

  it('maps office library_path to sidecar .txt path', () => {
    const officeManifest: SourcesManifest = {
      product_id: 'prod_1',
      created_at: '2026-08-18T00:00:00.000Z',
      files: ['data/products/prod_1/inputs/绿森/地板/说明.docx.txt'],
      source_inputs: [{ type: 'file', library_path: '绿森/地板/说明.docx' }],
    }
    const merged = mergeSourceInputs([], officeManifest)
    assert.deepEqual(merged, [
      {
        type: 'file',
        path: 'data/products/prod_1/inputs/绿森/地板/说明.docx.txt',
        uploaded_at: '2026-08-18T00:00:00.000Z',
      },
    ])
  })

  it('maps image library_path to original image path', () => {
    const imageManifest: SourcesManifest = {
      product_id: 'prod_1',
      created_at: '2026-08-18T00:00:00.000Z',
      files: ['data/products/prod_1/inputs/绿森/样品图.jpg'],
      source_inputs: [{ type: 'file', library_path: '绿森/样品图.jpg' }],
    }
    const merged = mergeSourceInputs([], imageManifest)
    assert.deepEqual(merged, [
      {
        type: 'file',
        path: 'data/products/prod_1/inputs/绿森/样品图.jpg',
        uploaded_at: '2026-08-18T00:00:00.000Z',
      },
    ])
  })
})
