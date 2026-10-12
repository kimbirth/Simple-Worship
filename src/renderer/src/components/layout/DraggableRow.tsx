import React from 'react'

interface Props {
  children: React.ReactNode
  onDragStart: (e: React.DragEvent) => void
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  onDoubleClick?: () => void
  ariaLabel?: string
}

/**
 * Wraps a row/card to make it draggable into the Schedule panel.
 * The parent sets the drag data via onDragStart.
 */
export function DraggableRow({ children, onDragStart, className = '', style, onClick, onDoubleClick, ariaLabel }: Props) {
  return (
    <div
      className={`draggable-row ${className}`}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault()
          ;(onClick ?? onDoubleClick)?.()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      style={style}
    >
      <span className="drag-grip" aria-hidden="true">⋮⋮</span>
      {children}
    </div>
  )
}
