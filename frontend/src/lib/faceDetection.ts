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

// Minimum detection confidence and face size required before trusting landmark-based head pose.
const POSE_MIN_SCORE = 0.75
const POSE_MIN_FACE_FRACTION = 0.12 // face width must be ≥12% of video width

// Face bounding box edge within this fraction of the frame = partial face
const EDGE_MARGIN = 0.08

export async function detectFacesWithPose(videoEl: HTMLVideoElement): Promise<{
  count: number
  headPose: HeadPose | null
  partialFace: boolean
}> {
  if (!_faceapi || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    return { count: -1, headPose: null, partialFace: false }
  }

  const results = await _faceapi
    .detectAllFaces(videoEl, new _faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)

  if (results.length === 0) return { count: 0, headPose: null, partialFace: false }

  const frameW = videoEl.videoWidth
  const frameH = videoEl.videoHeight

  // Partial face: any detected face whose bounding box touches or crosses a frame edge.
  // Fires even at lower confidence — a half-in-frame face naturally scores lower.
  const partialFace = results.some(r => {
    const { x, y, width, height } = r.detection.box
    return (
      x < frameW * EDGE_MARGIN ||
      y < frameH * EDGE_MARGIN ||
      x + width > frameW * (1 - EDGE_MARGIN) ||
      y + height > frameH * (1 - EDGE_MARGIN)
    )
  })

  // Head pose: only from the primary face if it meets quality thresholds.
  // Below these thresholds the landmark geometry is too noisy for reliable yaw/pitch.
  const best = results[0]
  const detectionScore: number = (best.detection as { score: number }).score ?? 1
  const faceBoxWidth: number = best.detection.box.width

  if (detectionScore < POSE_MIN_SCORE || faceBoxWidth < frameW * POSE_MIN_FACE_FRACTION) {
    return { count: results.length, headPose: null, partialFace }
  }

  const pts = best.landmarks.positions

  // Key landmark indices (68-point model):
  // 36: left eye outer, 45: right eye outer, 30: nose tip, 8: chin
  const leftEye  = pts[36]
  const rightEye = pts[45]
  const noseTip  = pts[30]
  const chin     = pts[8]

  const eyeCenterX = (leftEye.x + rightEye.x) / 2
  const eyeCenterY = (leftEye.y + rightEye.y) / 2
  const faceWidth  = rightEye.x - leftEye.x
  const faceHeight = chin.y - eyeCenterY

  // Guard against degenerate geometry (collapsed box, extreme profile view)
  if (faceWidth < 10 || faceHeight < 10) {
    return { count: results.length, headPose: null, partialFace }
  }

  // Yaw: nose horizontal offset from eye center, normalized by face width
  const yaw = (noseTip.x - eyeCenterX) / (faceWidth * 0.6)

  // Pitch: normalized nose position between eye center and chin (0 = straight, ±1 = extreme)
  const rawPitch = (noseTip.y - eyeCenterY) / faceHeight
  const pitch = (rawPitch - 0.5) * 2

  return { count: results.length, headPose: { yaw, pitch }, partialFace }
}
