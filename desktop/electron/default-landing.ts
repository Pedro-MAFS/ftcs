let consumed = false

export function peekDefaultLanding(): boolean {
  return consumed
}

export function commitDefaultLanding(): boolean {
  consumed = true
  return true
}
