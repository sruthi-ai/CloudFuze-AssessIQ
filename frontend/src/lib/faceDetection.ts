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

// Minimum detection confidence and face size (relative to frame width) required
// before we trust landmark-based head pose. Below these thresholds the landmark
// geometry is too noisy to produce reliable yaw/pitch values.
const POSE_MIN_SCORE = 0.75
const POSE_MIN_FACE_FRACTION = 0.12 // face width must be ≥12% of video width

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

  // Use first face for head pose, but only when detection is high-confidence
  // and the face is large enough that landmark geometry is reliable.
  const best = results[0]
  const detectionScore: number = (best.detection as { score: number }).score ?? 1
  const faceBoxWidth: number = best.detection.box.width
  const minFacePixels = videoEl.videoWidth * POSE_MIN_FACE_FRACTION

  if (detectionScore < POSE_MIN_SCORE || faceBoxWidth < minFacePixels) {
    return { count: results.length, headPose: null }
  }

  const pts = best.landmarks.positions

  // Key landmark indices (68-point model):
  // 36: left eye outer, 45: right eye outer, 30: nose tip, 8: chin
  const leftEye = pts[36]
  const rightEye = pts[45]
  const noseTip = pts[30]
  const chin = pts[8]

  const eyeCenterX = (leftEye.x + rightEye.x) / 2
  const eyeCenterY = (leftEye.y + rightEye.y) / 2
  const faceWidth = rightEye.x - leftEye.x
  const faceHeight = chin.y - eyeCenterY

  // Guard against degenerate geometry (collapsed face box, profile view)
  if (faceWidth < 10 || faceHeight < 10) {
    return { count: results.length, headPose: null }
  }

  // Yaw: how far nose is horizontally offset from eye center, normalized by face width
  const yaw = (noseTip.x - eyeCenterX) / (faceWidth * 0.6)

  // Pitch: vertical position of nose relative to face height
  // When looking straight: nose is ~0.5 down from eye center to chin
  const rawPitch = (noseTip.y - eyeCenterY) / faceHeight
  const pitch = (rawPitch - 0.5) * 2 // normalize around 0

  return {
    count: results.length,
    headPose: { yaw, pitch },
  }
}
