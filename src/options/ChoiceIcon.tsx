import type { LucideIcon } from 'lucide-react'

export function ChoiceIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <span className="opt-card-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
}
