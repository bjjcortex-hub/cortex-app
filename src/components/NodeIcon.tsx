export const ICON_COLOR: Record<string, string> = {
  position:   '#2E77FF',
  transition: '#8B5CF6',
  submission: '#EF4444',
  principle:  '#10B981',
  system:     '#7c3aed',
}
export function iconColor(type: string) { return ICON_COLOR[type] ?? '#8B5CF6' }

export function NodeIcon({ type, size = 12 }: { type: string; size?: number }) {
  const sw = size <= 10 ? 2.5 : 2
  const common = { stroke: '#fff', fill: 'none' as const, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'position') return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
  if (type === 'submission') return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )
  if (type === 'principle') return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  )
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}
