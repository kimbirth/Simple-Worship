import { useRef, useCallback } from 'react'

export function usePanelResize(onResize: (delta: number) => void, horizontal = true) {
  const dragging = useRef(false)
  const lastPos  = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastPos.current  = horizontal ? e.clientX : e.clientY

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const pos   = horizontal ? ev.clientX : ev.clientY
      const delta = pos - lastPos.current
      lastPos.current = pos
      onResize(delta)
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [onResize, horizontal])

  return onMouseDown
}
