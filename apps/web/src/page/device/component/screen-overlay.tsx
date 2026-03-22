import { useCallback, useRef } from 'react'
import {
  tap,
  drag,
  doubleTap,
  touchAndHold,
  type WindowSize,
} from '@/api/wda-api'

interface ScreenOverlayProps {
  udid: string
  windowSize: WindowSize
  highlightRect?: { x: number; y: number; width: number; height: number }
}

export function ScreenOverlay({
  udid,
  windowSize,
  highlightRect,
}: ScreenOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const downRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTapRef = useRef<{ x: number; y: number } | null>(null)
  const dragActiveRef = useRef(false)

  // Compute the actual rendered image bounds within the container,
  // accounting for object-contain letterboxing.
  const getImageBounds = useCallback(() => {
    const el = overlayRef.current
    if (!el) return { imgLeft: 0, imgTop: 0, imgWidth: 1, imgHeight: 1 }
    const cw = el.offsetWidth
    const ch = el.offsetHeight
    const imgAspect = windowSize.width / windowSize.height
    const containerAspect = cw / ch
    let imgWidth: number, imgHeight: number
    if (containerAspect > imgAspect) {
      // Container is wider — image is height-constrained, letterboxed horizontally
      imgHeight = ch
      imgWidth = ch * imgAspect
    } else {
      // Container is taller — image is width-constrained, letterboxed vertically
      imgWidth = cw
      imgHeight = cw / imgAspect
    }
    return {
      imgLeft: (cw - imgWidth) / 2,
      imgTop: (ch - imgHeight) / 2,
      imgWidth,
      imgHeight,
    }
  }, [windowSize])

  const toWda = useCallback(
    (clientX: number, clientY: number) => {
      const el = overlayRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const { imgLeft, imgTop, imgWidth, imgHeight } = getImageBounds()
      return {
        x: ((clientX - rect.left - imgLeft) / imgWidth) * windowSize.width,
        y: ((clientY - rect.top - imgTop) / imgHeight) * windowSize.height,
      }
    },
    [windowSize, getImageBounds]
  )

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const pos = toWda(e.clientX, e.clientY)
      downRef.current = { x: pos.x, y: pos.y, time: Date.now() }
      dragActiveRef.current = false
    },
    [toWda]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!downRef.current) return
      const pos = toWda(e.clientX, e.clientY)
      const dx = pos.x - downRef.current.x
      const dy = pos.y - downRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 10) dragActiveRef.current = true
    },
    [toWda]
  )

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!downRef.current) return
      const start = downRef.current
      downRef.current = null

      const pos = toWda(e.clientX, e.clientY)

      // Drag: significant movement — use actual gesture duration for natural momentum
      if (dragActiveRef.current) {
        const elapsed = (Date.now() - start.time) / 1000
        const duration = Math.max(0.05, Math.min(elapsed, 2))
        drag(udid, start.x, start.y, pos.x, pos.y, duration).catch(() => {})
        dragActiveRef.current = false
        return
      }

      // Tap — delay to distinguish from double-tap
      if (pendingTapRef.current) {
        // Second click arrived quickly — cancel tap, dblclick will fire
        pendingTapRef.current = null
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
        return
      }
      pendingTapRef.current = { x: pos.x, y: pos.y }
      tapTimerRef.current = setTimeout(() => {
        const pt = pendingTapRef.current
        if (pt) {
          tap(udid, pt.x, pt.y).catch(() => {})
          pendingTapRef.current = null
        }
      }, 250)
    },
    [udid, toWda]
  )

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const pos = toWda(e.clientX, e.clientY)
      touchAndHold(udid, pos.x, pos.y, 1).catch(() => {})
    },
    [udid, toWda]
  )

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Cancel pending tap
      pendingTapRef.current = null
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current)

      const pos = toWda(e.clientX, e.clientY)
      doubleTap(udid, pos.x, pos.y).catch(() => {})
    },
    [udid, toWda]
  )

  // Compute highlight rect in overlay pixel coordinates (accounting for letterboxing)
  let highlightStyle: React.CSSProperties | undefined
  if (highlightRect && overlayRef.current) {
    const { imgLeft, imgTop, imgWidth, imgHeight } = getImageBounds()
    highlightStyle = {
      position: 'absolute',
      left: `${imgLeft + (highlightRect.x / windowSize.width) * imgWidth}px`,
      top: `${imgTop + (highlightRect.y / windowSize.height) * imgHeight}px`,
      width: `${(highlightRect.width / windowSize.width) * imgWidth}px`,
      height: `${(highlightRect.height / windowSize.height) * imgHeight}px`,
      background: 'rgba(59, 130, 246, 0.25)',
      border: '2px solid rgba(59, 130, 246, 0.6)',
      borderRadius: '2px',
      pointerEvents: 'none' as const,
    }
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseLeave={() => {
        downRef.current = null
        dragActiveRef.current = false
      }}
    >
      {highlightStyle && <div style={highlightStyle} />}
    </div>
  )
}
