import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Keep keyboard focus inside a mounted modal and restore it when the modal closes. */
export function useDialogFocusTrap<T extends HTMLElement>(active = true) {
  const dialogRef = useRef<T>(null)

  useEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const focusableElements = () => Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter(element => element.getClientRects().length > 0)

    const frame = requestAnimationFrame(() => {
      const initial = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
        ?? focusableElements()[0]
      initial?.focus()
    })

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusableElements()
      if (!elements.length) {
        event.preventDefault()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', trapTab)
    return () => {
      cancelAnimationFrame(frame)
      dialog.removeEventListener('keydown', trapTab)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [active])

  return dialogRef
}
