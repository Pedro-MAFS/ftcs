import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  downloadingBannerText,
  resolveSettingsUpdateActions,
  resolveUpdateBannerMode,
  type UpdateUiInput,
} from './update-banner-model.ts'

function input(patch: Partial<UpdateUiInput> = {}): UpdateUiInput {
  return {
    platform: 'win32',
    check: {
      ok: true,
      message: '发现新版本 1.2.0',
      hasUpdate: true,
      latestVersion: '1.2.0',
      currentVersion: '1.1.0',
      mandatory: false,
    },
    download: {
      phase: 'idle',
      version: null,
      received: 0,
      total: null,
      message: '',
      deferred: false,
    },
    manualChecked: false,
    manualChecking: false,
    ...patch,
  }
}

describe('update banner model', () => {
  it('shows percent only when the total length is known', () => {
    const known = input({
      download: {
        phase: 'downloading',
        version: '1.2.0',
        received: 50,
        total: 100,
        message: '',
        deferred: false,
      },
    })
    assert.equal(resolveUpdateBannerMode(known), 'downloading')
    assert.deepEqual(downloadingBannerText(known), {
      title: '正在下载 1.2.0',
      percent: 50,
    })
    const unknown = input({
      download: {
        phase: 'downloading',
        version: '1.2.0',
        received: 50,
        total: null,
        message: '',
        deferred: false,
      },
    })
    assert.deepEqual(downloadingBannerText(unknown), {
      title: '正在下载',
      percent: null,
    })
  })

  it('uses install and later after the package is ready, including the collapsed line', () => {
    const ready = input({
      download: {
        phase: 'ready',
        version: '1.2.0',
        received: 10,
        total: 10,
        message: '已下载 1.2.0',
        deferred: false,
      },
    })
    assert.equal(resolveUpdateBannerMode(ready), 'ready')
    const later = input({
      download: { ...ready.download, deferred: true },
    })
    assert.equal(resolveUpdateBannerMode(later), 'ready-deferred')
    const actions = resolveSettingsUpdateActions(ready)
    assert.equal(actions.showInstall, true)
    assert.equal(actions.showGoDownload, false)
    assert.equal(actions.line, '已下载 1.2.0')
  })

  it('keeps failure distinct from already up to date and offers the website', () => {
    const failed = input({
      check: {
        ok: false,
        message: '检查更新失败：HTTP 500',
        hasUpdate: false,
        latestVersion: null,
        currentVersion: '1.1.0',
        mandatory: false,
      },
    })
    assert.equal(resolveUpdateBannerMode(failed), 'check-error')
    const actions = resolveSettingsUpdateActions(failed)
    assert.equal(actions.line, '检查更新失败：HTTP 500')
    assert.equal(actions.line.includes('已是最新'), false)
    assert.equal(actions.showRetryCheck, true)
    assert.equal(actions.showOfficial, true)
    assert.equal(actions.showInstall, false)
  })

  it('shows download failure with retry and the website, not the latest sentence', () => {
    const failed = input({
      download: {
        phase: 'failed',
        version: '1.2.0',
        received: 0,
        total: null,
        message: '下载失败：HTTP 404',
        deferred: false,
      },
    })
    assert.equal(resolveUpdateBannerMode(failed), 'download-failed')
    const actions = resolveSettingsUpdateActions(failed)
    assert.equal(actions.line, '下载失败：HTTP 404')
    assert.equal(actions.showRetryDownload, true)
    assert.equal(actions.showOfficial, true)
    assert.equal(actions.showGoDownload, false)
  })

  it('tells a manual windows check that the download already started', () => {
    const actions = resolveSettingsUpdateActions(
      input({
        manualChecked: true,
        download: {
          phase: 'downloading',
          version: '1.2.0',
          received: 0,
          total: null,
          message: '',
          deferred: false,
        },
      }),
    )
    assert.equal(actions.line, '发现新版本 1.2.0，正在后台下载')
    assert.equal(actions.showGoDownload, false)
  })

  it('shows already latest only after a manual check and hides the auto banner', () => {
    const latest = input({
      check: {
        ok: true,
        message: '已是最新版本（1.1.0）',
        hasUpdate: false,
        latestVersion: '1.1.0',
        currentVersion: '1.1.0',
        mandatory: false,
      },
    })
    assert.equal(resolveUpdateBannerMode(latest), 'hidden')
    assert.equal(resolveSettingsUpdateActions(latest).line, '')
    assert.equal(
      resolveSettingsUpdateActions(input({ ...latest, manualChecked: true })).line,
      '已是最新版本（1.1.0）',
    )
  })

  it('keeps the download page as the main action off Windows and does not download', () => {
    const external = input({
      platform: 'darwin',
      manualChecked: true,
    })
    assert.equal(resolveUpdateBannerMode(external), 'external')
    const actions = resolveSettingsUpdateActions(external)
    assert.equal(actions.showGoDownload, true)
    assert.equal(actions.showInstall, false)
    assert.equal(actions.showRetryDownload, false)
    assert.equal(actions.line.includes('前往下载页'), true)
  })
})
