// Lazy singleton — loads COCO-SSD model once per session
import type * as cocoSsdType from '@tensorflow-models/coco-ssd'

let initPromise: Promise<boolean> | null = null
let model: cocoSsdType.ObjectDetection | null = null

export async function initPhoneDetection(): Promise<boolean> {
  if (model) return true
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      // Try WebGL first (GPU-accelerated); fall back to WASM/CPU if unavailable
      try {
        await import('@tensorflow/tfjs-backend-webgl')
      } catch {
        // WebGL unavailable — model will attempt whatever backend TF.js auto-selects
      }
      const cocoSsd = await import('@tensorflow-models/coco-ssd')
      model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
      return true
    } catch (e) {
      console.warn('[PhoneDetection] COCO-SSD failed to load:', e)
      initPromise = null
      return false
    }
  })()
  return initPromise
}

// Returns { detected, highConfidence }.
// highConfidence = true when score ≥ 0.75 — caller can flag immediately (no consecutive check needed).
export async function detectPhone(videoEl: HTMLVideoElement): Promise<{ detected: boolean; highConfidence: boolean }> {
  if (!model || videoEl.readyState < 2 || videoEl.videoWidth === 0) return { detected: false, highConfidence: false }
  try {
    const predictions = await model.detect(videoEl)
    const best = predictions.filter(p => p.class === 'cell phone').sort((a, b) => b.score - a.score)[0]
    if (!best) return { detected: false, highConfidence: false }
    return { detected: best.score >= 0.58, highConfidence: best.score >= 0.75 }
  } catch {
    return { detected: false, highConfidence: false }
  }
}
