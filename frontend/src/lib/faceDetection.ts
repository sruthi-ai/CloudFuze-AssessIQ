// Lazy singleton — loads TinyFaceDetector model from jsDelivr CDN once per session
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

let initPromise: Promise<boolean> | null = null
let _detect: ((el: HTMLVideoElement) => Promise<number>) | null = null

export async function initFaceDetection(): Promise<boolean> {
  if (_detect) return true
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const faceapi = await import('@vladmandic/face-api')
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
        _detect = async (el) => {
          if (el.readyState < 2 || el.videoWidth === 0) return -1
          const dets = await faceapi.detectAllFaces(
            el,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          )
          return dets.length
        }
        return true
      } catch {
        initPromise = null
        return false
      }
    })()
  }
  return initPromise
}

export async function countFaces(videoEl: HTMLVideoElement): Promise<number> {
  if (!_detect) return -1
  return _detect(videoEl)
}
