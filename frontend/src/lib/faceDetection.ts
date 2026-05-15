// Lazy singleton — loads face detection models from jsDelivr CDN once per session
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

let initPromise: Promise<boolean> | null = null
let _faceapi: typeof import('@vladmandic/face-api') | null = null

export interface HeadPose {
  yaw: number    // negative = looking left, positive = looking right (-1 to 1)
  pitch: number  // negative = looking up, positive = looking down (-1 to 1)
}

export async function initFaceDetection(): Promise<boolean> {
  if (_faceapi) return true
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const faceapi = await import('@vladmandic/face-api')
        // Load tiny face detector + 68-point landmark model for head pose
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ])
        _faceapi = faceapi
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
  if (!_faceapi || videoEl.readyState < 2 || videoEl.videoWidth === 0) return -1
  const dets = await _faceapi.detectAllFaces(
    videoEl,
    new _faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
  )
  return dets.length
}

export async function detectFacesWithPose(videoEl: HTMLVideoElement): Promise<{
  count: number
  headPose: HeadPose | null
}> {
  if (!_faceapi || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    return { count: -1, headPose: null }
  }

  const results = await _faceapi
    .detectAllFaces(videoEl, new _faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)

  if (results.length === 0) return { count: 0, headPose: null }

  // Use first face for head pose
  const landmarks = results[0].landmarks
  const pts = landmarks.positions

  // Key landmark indices (68-point model):
  // 0-16: jaw, 17-21: left brow, 22-26: right brow
  // 27-30: nose bridge, 31-35: nose bottom
  // 36-41: left eye, 42-47: right eye
  // 48-67: mouth
  const leftEye = pts[36]
  const rightEye = pts[45]
  const noseTip = pts[30]
  const chin = pts[8]

  const eyeCenterX = (leftEye.x + rightEye.x) / 2
  const eyeCenterY = (leftEye.y + rightEye.y) / 2
  const faceWidth = rightEye.x - leftEye.x
  const faceHeight = chin.y - eyeCenterY

  // Yaw: how far nose is horizontally offset from eye center, normalized by face width
  const yaw = faceWidth > 0 ? (noseTip.x - eyeCenterX) / (faceWidth * 0.6) : 0

  // Pitch: vertical position of nose relative to face height
  // When looking straight: nose is ~0.5 down from eye center to chin
  const rawPitch = faceHeight > 0 ? (noseTip.y - eyeCenterY) / faceHeight : 0
  const pitch = (rawPitch - 0.5) * 2 // normalize around 0

  return {
    count: results.length,
    headPose: { yaw, pitch },
  }
}
