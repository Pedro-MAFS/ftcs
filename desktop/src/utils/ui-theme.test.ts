import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  oppositeExplicitTheme,
  resolveEffectiveTheme,
  resolveUiThemeMode,
} from '../utils/ui-theme.ts'

describe('ui-theme', () => {
  it('resolves mode with dark default', () => {
    assert.equal(resolveUiThemeMode(undefined), 'dark')
    assert.equal(resolveUiThemeMode('light'), 'light')
    assert.equal(resolveUiThemeMode('system'), 'system')
    assert.equal(resolveUiThemeMode('nope'), 'dark')
  })

  it('resolves effective theme', () => {
    assert.equal(resolveEffectiveTheme('dark', false), 'dark')
    assert.equal(resolveEffectiveTheme('light', true), 'light')
    assert.equal(resolveEffectiveTheme('system', true), 'dark')
    assert.equal(resolveEffectiveTheme('system', false), 'light')
  })

  it('title-bar toggle flips the theme on screen', () => {
    assert.equal(oppositeExplicitTheme('dark'), 'light')
    assert.equal(oppositeExplicitTheme('light'), 'dark')
  })
})
