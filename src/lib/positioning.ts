export interface Pos { x: number; y: number }

const RADIUS = 230

/**
 * Place a new node radially: fan out from parentPos in the direction away from
 * grandparentPos. Siblings spread in an arc up to ~135 degrees.
 */
export function seedPosition(
  parentPos: Pos,
  grandparentPos: Pos | null,
  siblingIndex: number,
  siblingCount: number,
): Pos {
  let baseAngle = 0
  if (grandparentPos) {
    baseAngle = Math.atan2(
      parentPos.y - grandparentPos.y,
      parentPos.x - grandparentPos.x,
    )
  }
  const maxSpread = siblingCount <= 1 ? 0 : Math.min(Math.PI * 0.75, (siblingCount - 1) * 0.42)
  const step = siblingCount > 1 ? maxSpread / (siblingCount - 1) : 0
  const angle = baseAngle - maxSpread / 2 + step * siblingIndex
  return {
    x: Math.round(parentPos.x + Math.cos(angle) * RADIUS),
    y: Math.round(parentPos.y + Math.sin(angle) * RADIUS),
  }
}
