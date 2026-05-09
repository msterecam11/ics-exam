"use client"

import { useEffect, useRef } from "react"
import QRCodeLib from "qrcode"

interface Props {
  url: string
  size?: number
}

export default function QRCode({ url, size = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 1,
      color: { dark: "#1B4F8A", light: "#FFFFFF" },
    })
  }, [url, size])

  return <canvas ref={canvasRef} width={size} height={size} />
}
