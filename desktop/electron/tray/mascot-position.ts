import type { Point, Rectangle } from 'electron'

export const mascotSize = 72

export function placeMascot(position: Point | undefined, areas: Rectangle[], fallback: Rectangle): Point {
  let area: Rectangle | undefined
  let bestOverlap = 0
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    for (const display of areas) {
      const width = Math.min(position.x + mascotSize, display.x + display.width) - Math.max(position.x, display.x)
      const height = Math.min(position.y + mascotSize, display.y + display.height) - Math.max(position.y, display.y)
      const overlap = Math.max(0, width) * Math.max(0, height)
      if (overlap > bestOverlap) { bestOverlap = overlap; area = display }
    }
  }
  const target = area || fallback
  const x = area && position ? position.x : target.x + target.width - mascotSize - 16
  const y = area && position ? position.y : target.y + target.height - mascotSize - 16
  return {
    x: Math.max(target.x, Math.min(Math.round(x), target.x + target.width - mascotSize)),
    y: Math.max(target.y, Math.min(Math.round(y), target.y + target.height - mascotSize)),
  }
}
