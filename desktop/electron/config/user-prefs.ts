import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { OnboardingState } from '../ipc/types'

interface UserPrefs {
  workspaceRoot?: string
  onboarding?: OnboardingState
}

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'ftcs-prefs.json')
}

export function readUserPrefs(): UserPrefs {
  const file = prefsPath()
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as UserPrefs
  } catch {
    return {}
  }
}

export function writeUserPrefs(patch: UserPrefs): UserPrefs {
  const next = { ...readUserPrefs(), ...patch }
  fs.mkdirSync(path.dirname(prefsPath()), { recursive: true })
  fs.writeFileSync(prefsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}
