"use client"

import { useEffect } from "react"

interface Props {
  children: React.ReactNode
}

export default function ViewerSecurityWrapper({ children }: Props) {
  useEffect(() => {
    // Block copy / cut / paste
    const blockClipboard = (e: ClipboardEvent) => e.preventDefault()
    document.addEventListener("copy",  blockClipboard)
    document.addEventListener("cut",   blockClipboard)
    document.addEventListener("paste", blockClipboard)

    // Block keyboard shortcuts
    const blockKeys = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const blocked = ["c", "x", "a", "s", "p", "u"]
      if (blocked.includes(e.key.toLowerCase())) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener("keydown", blockKeys, true)

    // Block right-click
    const blockContextMenu = (e: MouseEvent) => e.preventDefault()
    document.addEventListener("contextmenu", blockContextMenu)

    // Block drag-select
    const blockDragStart = (e: DragEvent) => e.preventDefault()
    document.addEventListener("dragstart", blockDragStart)

    return () => {
      document.removeEventListener("copy",        blockClipboard)
      document.removeEventListener("cut",         blockClipboard)
      document.removeEventListener("paste",       blockClipboard)
      document.removeEventListener("keydown",     blockKeys, true)
      document.removeEventListener("contextmenu", blockContextMenu)
      document.removeEventListener("dragstart",   blockDragStart)
    }
  }, [])

  return (
    <div
      className="viewer-secure-zone relative"
      onCopy={e => e.preventDefault()}
      onCut={e => e.preventDefault()}
    >
      {/* Print blanker */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .viewer-print-block {
            visibility: visible !important;
            position: fixed; inset: 0; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            background: white; font-size: 24px; font-weight: 600; color: #1e293b;
          }
        }
        .viewer-secure-zone, .viewer-secure-zone * {
          user-select: none !important;
          -webkit-user-select: none !important;
        }
      `}</style>

      {/* Print block overlay (only shown when printing) */}
      <div className="viewer-print-block hidden">
        This content is protected and cannot be printed.
      </div>

      {children}
    </div>
  )
}
