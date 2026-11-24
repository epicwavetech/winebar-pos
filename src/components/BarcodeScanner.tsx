import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'

type BarcodeScannerProps = {
  onScan: (barcode: string) => void
  onOpenScannerReady?: (openScanner: () => void) => void
  buttonLabel?: string
}

export default function BarcodeScanner({ onScan, onOpenScannerReady, buttonLabel = 'Camera' }: BarcodeScannerProps) {
  const [open, setOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [cameraWarning, setCameraWarning] = useState('')
  const [soundError, setSoundError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const openScanner = useCallback(() => {
    setCameraError('')
    setCameraWarning('')
    setCameraError(!navigator.mediaDevices?.getUserMedia || !window.isSecureContext
      ? 'Camera scanning requires camera permission and a secure HTTPS connection.'
      : '')
    if (!window.AudioContext) {
      setSoundError('Scan beep is not supported by this browser.')
    } else {
      try {
        const audioContext = audioContextRef.current ?? new window.AudioContext()
        audioContextRef.current = audioContext
        if (audioContext.state === 'suspended') {
          void audioContext.resume()
            .then(() => setSoundError(''))
            .catch(() => setSoundError('The browser blocked the scan beep. Check device sound settings.'))
        } else {
          setSoundError('')
        }
      } catch (error: unknown) {
        setSoundError(error instanceof Error ? error.message : 'Scan beep is unavailable on this device.')
      }
    }
    setOpen(true)
  }, [])

  useEffect(() => {
    onOpenScannerReady?.(openScanner)
  }, [onOpenScannerReady, openScanner])

  const playScanBeep = useCallback(() => {
    const audioContext = audioContextRef.current
    if (!audioContext || audioContext.state !== 'running') {
      setSoundError('Barcode read, but the beep was blocked. Check device sound settings.')
      return
    }

    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.15)
    setSoundError('')
  }, [])

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
          playScanBeep()
          onScanRef.current(result.getText())
          setOpen(false)
        })
        if (cancelled) {
          startedControls.stop()
          return
        }
        controls = startedControls

        const stream = video.srcObject
        const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined
        if (!track) return

        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[]
          torch?: boolean
        }
        if (capabilities.focusMode?.includes('continuous')) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
          } catch {
            if (!cancelled) setCameraWarning('Could not enable continuous autofocus. The camera may still focus automatically.')
          }
        }
        if (capabilities.torch) {
          try {
            if (startedControls.switchTorch) await startedControls.switchTorch(true)
            else await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] })
          } catch {
            if (!cancelled) setCameraWarning((warning) => warning
              ? `${warning} The camera flash could not be turned on.`
              : 'Could not turn on the camera flash. You can continue scanning.')
          }
        }
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
  }, [open, playScanBeep])

  return (
    <>
      <button type="button" className="secondary camera-scan-button" onClick={openScanner}><Camera size={16}/>{buttonLabel}</button>
      {open && (
        <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
          <div className="modal scanner-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><small>Barcode scanner</small><h2>Scan a barcode</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close camera"><X size={20}/></button></div>
            <video ref={videoRef} autoPlay playsInline muted/>
            <p>Allow camera access and hold the barcode inside the camera view.</p>
            {cameraError && <div className="login-error">{cameraError}</div>}
            {cameraWarning && <p className="camera-sound-warning">{cameraWarning}</p>}
            {soundError && <p className="camera-sound-warning">{soundError}</p>}
            <button type="button" className="secondary wide" onClick={() => setOpen(false)}>Close scanner</button>
          </div>
        </div>
      )}
    </>
  )
}
