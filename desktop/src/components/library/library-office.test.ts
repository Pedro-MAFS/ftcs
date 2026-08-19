import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasOfficeGateFiles,
  isOfficeGateFile,
  listOfficeGateFiles,
  stripOfficeGateFiles,
} from './library-office'

describe('library-office', () => {
  it('detects docx/xlsx/pptx case-insensitively', () => {
    assert.equal(isOfficeGateFile('绿森/说明.DOCX'), true)
    assert.equal(isOfficeGateFile('a/报价.Xlsx'), true)
    assert.equal(isOfficeGateFile('deck.Pptx'), true)
    assert.equal(isOfficeGateFile('说明.pdf'), false)
    assert.equal(isOfficeGateFile('老.doc'), false)
    assert.equal(isOfficeGateFile('表.xls'), false)
    assert.equal(isOfficeGateFile('说明.md'), false)
  })

  it('lists and strips mixed paths with Chinese names', () => {
    const paths = [
      '绿森/地板/说明.docx',
      '绿森/地板/readme.md',
      '绿森/地板/报价 xlsx.xlsx',
      '绿森/地板/图.jpg',
    ]
    assert.deepEqual(listOfficeGateFiles(paths), [
      '绿森/地板/说明.docx',
      '绿森/地板/报价 xlsx.xlsx',
    ])
    assert.equal(hasOfficeGateFiles(paths), true)
    assert.deepEqual(stripOfficeGateFiles(paths), [
      '绿森/地板/readme.md',
      '绿森/地板/图.jpg',
    ])
    assert.equal(hasOfficeGateFiles(stripOfficeGateFiles(paths)), false)
  })
})
