"use client"

// 클라이언트 이미지 압축 — 폰 원본(수 MB)을 업로드 가능한 크기로.
// canvas로 최대 변 1080px 리사이즈 + JPEG 재인코딩 → dataURL 반환.
// (백엔드가 base64 dataURL을 그대로 저장하므로, 압축이 실질적 업로드 안정성을 결정)

const MAX_DIMENSION = 1080
const JPEG_QUALITY = 0.82

export async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await readFileAsDataURL(file)
  // GIF 등 애니메이션은 압축 생략(첫 프레임만 남는 문제 방지)
  if (file.type === "image/gif") return dataUrl
  try {
    return await compressDataUrl(dataUrl)
  } catch {
    return dataUrl // 압축 실패 시 원본 폴백
  }
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("read_failed"))
    reader.readAsDataURL(file)
  })
}

export function compressDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        let { width, height } = img
        const maxSide = Math.max(width, height)
        if (maxSide > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / maxSide
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error("img_load_failed"))
    img.src = dataUrl
  })
}
