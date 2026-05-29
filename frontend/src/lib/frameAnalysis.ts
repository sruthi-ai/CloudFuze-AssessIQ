/** Measures average luminance (0–255) of a video frame by downscaling to 64×36. */
export function measureFrameBrightness(video: HTMLVideoElement): number {
  if (video.readyState < 2 || video.videoWidth === 0) return 128
  const W = 64, H = 36
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return 128
  ctx.drawImage(video, 0, 0, W, H)
  const data = ctx.getImageData(0, 0, W, H).data
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return sum / (W * H)
}

/** Luminance threshold below which a frame is considered too dark for proctoring */
export const MIN_BRIGHTNESS = 45
