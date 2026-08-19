import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isOfficeExtractExtension,
  officeSidecarRelPath,
} from './profile-office-extract.ts'

describe('profile-office-extract helpers', () => {
  it('detects extract extensions', () => {
    assert.equal(isOfficeExtractExtension('绿森/说明.docx'), true)
    assert.equal(isOfficeExtractExtension('a.XLSX'), true)
    assert.equal(isOfficeExtractExtension('a.pptx'), true)
    assert.equal(isOfficeExtractExtension('a.pdf'), false)
    assert.equal(isOfficeExtractExtension('a.doc'), false)
  })

  it('builds sidecar relative path', () => {
    assert.equal(officeSidecarRelPath('绿森/地板/说明.docx'), '绿森/地板/说明.docx.txt')
    assert.equal(officeSidecarRelPath('报价 单.xlsx'), '报价 单.xlsx.txt')
  })
})
