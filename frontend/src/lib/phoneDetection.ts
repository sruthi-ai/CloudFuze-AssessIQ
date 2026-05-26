// Lazy singleton — loads COCO-SSD model once per session
import type * as cocoSsdType from '@tensorflow-models/coco-ssd'

let initPromise: Promise<boolean> | null = null
let model: cocoSsdType.ObjectDetection | null = null

export async function initPhoneDetection(): Promise<boolean> {
  if (model) return true
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      // Ensure a TF.js backend is registered before loading the model
      await import('@tensorflow/tfjs-backend-webgl')
      const cocoSsd = await import('@tensorflow-models/coco-ssd')
      model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
      return true
    } catch {
      initPromise = null
      return false
    }
  })()
  return initPromise
}

// Returns true if a cell phone is detected in the current video frame
export async function detectPhone(videoEl: HTMLVideoElement): Promise<boolean> {
  if (!model || videoEl.readyState < 2 || videoEl.videoWidth === 0) return false
  try {
    const predictions = await model.detect(videoEl)
    return predictions.some(p => p.class === 'cell phone' && p.score >= 0.5)
  } catch {
    return false
  }
}
