import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'

type BarcodeScannerProps = {
  onScan: (barcode: string) => void
  children: (openScanner: () => void) => ReactNode
}

export default function BarcodeScanner({ onScan, children }: BarcodeScannerProps) {
  const [open, setOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const openScanner = () => {
    setCameraError(!navigator.mediaDevices?.getUserMedia || !window.isSecureContext
      ? 'Camera scanning requires camera permission and a secure HTTPS connection.'
      : '')
    setOpen(true)
  }

  useEffect(() => {
    if (!open || !videoRef.current || !navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return

    const video = videoRef.current
    let cancelled = false
    let scanned = false
    let controls: IScannerControls | undefined

    const startCamera = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        const startedControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (!result || cancelled || scanned) return
          scanned = true
          onScanRef.current(result.getText())
          setOpen(false)
        })
        if (cancelled) startedControls.stop()
        else controls = startedControls
      } catch (error: unknown) {
        if (cancelled) return
        setCameraError(error instanceof Error ? error.message : 'Could not start the camera. Check browser permissions.')
      }
    }

    void startCamera()
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [open])

  return (
    <>
      {children(openScanner)}
      {open && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="modal scanner-modal">
            <div className="modal-header"><div><small>Barcode scanner</small><h2>Scan a barcode</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close camera"><X size={20}/></button></div>
            <video ref={videoRef} autoPlay playsInline muted/>
            <p>Allow camera access and hold the barcode inside the camera view.</p>
            {cameraError && <div className="login-error">{cameraError}</div>}
            <button type="button" className="secondary wide" onClick={() => setOpen(false)}>Close scanner</button>
          </div>
        </div>
      )}
    </>
  )
}
