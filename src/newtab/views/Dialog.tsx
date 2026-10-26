import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'

export function Dialog({ label, onClose, children, className = '', style }: {
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return (
    <dialog ref={ref} aria-label={label} className={`nt-dialog ${className}`} style={style}
      onCancel={e => { e.preventDefault(); onClose() }}
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (e.target === e.currentTarget && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) onClose()
        e.stopPropagation()
      }}>
      {children}
    </dialog>
  )
}
