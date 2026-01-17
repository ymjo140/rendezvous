'use client'

import * as React from 'react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { 
  X, Check, RotateCw, FlipHorizontal, FlipVertical, 
  Type, Palette, Sun, Contrast, Droplets,
  Crop, Wand2, ChevronLeft, ChevronRight
} from 'lucide-react'

// === 필터 프리셋 정의 ===
const FILTER_PRESETS = [
  { id: 'original', name: 'Original', filter: '' },
  { id: 'clarendon', name: 'Clarendon', filter: 'brightness(1.1) contrast(1.2) saturate(1.35)' },
  { id: 'gingham', name: 'Gingham', filter: 'brightness(1.05) hue-rotate(-10deg) saturate(0.9)' },
  { id: 'moon', name: 'Moon', filter: 'grayscale(1) brightness(1.1) contrast(1.1)' },
  { id: 'lark', name: 'Lark', filter: 'brightness(1.1) contrast(0.9) saturate(1.1)' },
  { id: 'reyes', name: 'Reyes', filter: 'brightness(1.1) contrast(0.85) saturate(0.75) sepia(0.22)' },
  { id: 'juno', name: 'Juno', filter: 'brightness(1.05) contrast(1.1) saturate(1.4)' },
  { id: 'slumber', name: 'Slumber', filter: 'brightness(1.05) saturate(0.66) contrast(0.9) sepia(0.1)' },
  { id: 'aden', name: 'Aden', filter: 'brightness(1.2) contrast(0.9) saturate(0.85) hue-rotate(20deg)' },
  { id: 'valencia', name: 'Valencia', filter: 'brightness(1.08) contrast(1.08) saturate(1.25) sepia(0.08)' },
] as const

// === 비율 프리셋 ===
const ASPECT_RATIOS = [
  { id: 'free', name: '자유', ratio: null },
  { id: '1:1', name: '1:1', ratio: 1 },
  { id: '4:5', name: '4:5', ratio: 4/5 },
  { id: '16:9', name: '16:9', ratio: 16/9 },
] as const

// === 편집 탭 ===
type EditorTab = 'filter' | 'adjust' | 'crop' | 'text'

interface TextOverlay {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  isDragging?: boolean
}

interface PhotoEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageSrc: string
  onSave: (editedImageDataUrl: string) => void
}

export function PhotoEditor({ open, onOpenChange, imageSrc, onSave }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [activeTab, setActiveTab] = useState<EditorTab>('filter')
  
  // 필터 상태
  const [selectedFilter, setSelectedFilter] = useState('original')
  
  // 조정 상태
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  
  // 회전/반전 상태
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string>('free')
  
  // 텍스트 오버레이 상태
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([])
  const [newText, setNewText] = useState('')
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(24)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  
  // 이미지 로드
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)
  
  useEffect(() => {
    if (imageSrc && open) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        setLoadedImage(img)
      }
      img.src = imageSrc
    }
  }, [imageSrc, open])
  
  // 캔버스에 이미지 그리기
  const drawCanvas = useCallback(() => {
    if (!loadedImage || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // 캔버스 크기 설정
    const maxSize = 400
    let width = loadedImage.width
    let height = loadedImage.height
    
    if (width > height) {
      if (width > maxSize) {
        height = (height * maxSize) / width
        width = maxSize
      }
    } else {
      if (height > maxSize) {
        width = (width * maxSize) / height
        height = maxSize
      }
    }
    
    // 회전된 경우 크기 조정
    const isRotated = rotation === 90 || rotation === 270
    canvas.width = isRotated ? height : width
    canvas.height = isRotated ? width : height
    
    // 변환 적용
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    
    // 필터 적용
    const filterPreset = FILTER_PRESETS.find(f => f.id === selectedFilter)
    const baseFilter = filterPreset?.filter || ''
    const adjustFilter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`
    ctx.filter = `${baseFilter} ${adjustFilter}`.trim()
    
    // 이미지 그리기
    ctx.drawImage(
      loadedImage,
      -width / 2,
      -height / 2,
      width,
      height
    )
    
    ctx.restore()
    
    // 텍스트 오버레이 그리기
    textOverlays.forEach(overlay => {
      ctx.save()
      ctx.font = `bold ${overlay.fontSize}px Arial`
      ctx.fillStyle = overlay.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // 텍스트 그림자
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 4
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2
      
      const x = (overlay.x / 100) * canvas.width
      const y = (overlay.y / 100) * canvas.height
      ctx.fillText(overlay.text, x, y)
      
      // 선택된 텍스트 표시
      if (selectedTextId === overlay.id) {
        const metrics = ctx.measureText(overlay.text)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.strokeRect(
          x - metrics.width / 2 - 5,
          y - overlay.fontSize / 2 - 5,
          metrics.width + 10,
          overlay.fontSize + 10
        )
      }
      
      ctx.restore()
    })
  }, [loadedImage, selectedFilter, brightness, contrast, saturation, rotation, flipH, flipV, textOverlays, selectedTextId])
  
  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])
  
  // 텍스트 추가
  const addText = () => {
    if (!newText.trim()) return
    
    const overlay: TextOverlay = {
      id: Date.now().toString(),
      text: newText,
      x: 50,
      y: 50,
      fontSize: textSize,
      color: textColor
    }
    
    setTextOverlays(prev => [...prev, overlay])
    setNewText('')
    setSelectedTextId(overlay.id)
  }
  
  // 선택된 텍스트 삭제
  const deleteSelectedText = () => {
    if (selectedTextId) {
      setTextOverlays(prev => prev.filter(t => t.id !== selectedTextId))
      setSelectedTextId(null)
    }
  }
  
  // 텍스트 드래그
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'text' || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    
    // 클릭한 위치에 텍스트가 있는지 확인
    const clickedText = textOverlays.find(overlay => {
      const dx = Math.abs(overlay.x - x)
      const dy = Math.abs(overlay.y - y)
      return dx < 10 && dy < 10
    })
    
    if (clickedText) {
      setSelectedTextId(clickedText.id)
    } else if (selectedTextId) {
      // 선택된 텍스트 이동
      setTextOverlays(prev => prev.map(t => 
        t.id === selectedTextId ? { ...t, x, y } : t
      ))
    }
  }
  
  // 회전
  const rotate90 = () => {
    setRotation(prev => (prev + 90) % 360)
  }
  
  // 저장
  const handleSave = () => {
    if (!canvasRef.current) return
    
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9)
    onSave(dataUrl)
    onOpenChange(false)
    resetState()
  }
  
  // 상태 초기화
  const resetState = () => {
    setSelectedFilter('original')
    setBrightness(100)
    setContrast(100)
    setSaturation(100)
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setTextOverlays([])
    setNewText('')
    setActiveTab('filter')
    setSelectedTextId(null)
  }
  
  const handleClose = () => {
    onOpenChange(false)
    resetState()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden p-0 bg-black text-white">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </Button>
          <DialogTitle className="text-lg font-semibold">사진 편집</DialogTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleSave}
            className="text-blue-400 hover:text-blue-300 hover:bg-gray-800 font-semibold"
          >
            <Check className="w-5 h-5 mr-1" />
            완료
          </Button>
        </div>
        
        {/* 캔버스 미리보기 */}
        <div className="flex justify-center items-center p-4 bg-gray-900 min-h-[300px]">
          <canvas 
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={cn(
              "max-w-full max-h-[300px] rounded-lg",
              activeTab === 'text' && "cursor-crosshair"
            )}
          />
        </div>
        
        {/* 탭 네비게이션 */}
        <div className="flex border-b border-gray-800">
          {[
            { id: 'filter', icon: Wand2, label: '필터' },
            { id: 'adjust', icon: Sun, label: '조정' },
            { id: 'crop', icon: Crop, label: '자르기' },
            { id: 'text', icon: Type, label: '텍스트' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as EditorTab)}
              className={cn(
                "flex-1 flex flex-col items-center py-3 transition-colors",
                activeTab === tab.id
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              )}
            >
              <tab.icon className="w-5 h-5 mb-1" />
              <span className="text-xs">{tab.label}</span>
            </button>
          ))}
        </div>
        
        {/* 편집 컨트롤 */}
        <div className="p-4 max-h-[250px] overflow-y-auto">
          {/* 필터 탭 */}
          {activeTab === 'filter' && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {FILTER_PRESETS.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setSelectedFilter(filter.id)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center gap-2",
                    selectedFilter === filter.id && "opacity-100",
                    selectedFilter !== filter.id && "opacity-60 hover:opacity-80"
                  )}
                >
                  <div 
                    className={cn(
                      "w-16 h-16 rounded-lg overflow-hidden border-2",
                      selectedFilter === filter.id 
                        ? "border-blue-400" 
                        : "border-transparent"
                    )}
                  >
                    {loadedImage && (
                      <img
                        src={imageSrc}
                        alt={filter.name}
                        className="w-full h-full object-cover"
                        style={{ filter: filter.filter }}
                      />
                    )}
                  </div>
                  <span className="text-xs text-gray-300">{filter.name}</span>
                </button>
              ))}
            </div>
          )}
          
          {/* 조정 탭 */}
          {activeTab === 'adjust' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Sun className="w-4 h-4" />
                    <span>밝기</span>
                  </div>
                  <span className="text-sm text-gray-400">{brightness}%</span>
                </div>
                <Slider
                  value={[brightness]}
                  onValueChange={([v]) => setBrightness(v)}
                  min={0}
                  max={200}
                  step={1}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Contrast className="w-4 h-4" />
                    <span>대비</span>
                  </div>
                  <span className="text-sm text-gray-400">{contrast}%</span>
                </div>
                <Slider
                  value={[contrast]}
                  onValueChange={([v]) => setContrast(v)}
                  min={0}
                  max={200}
                  step={1}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Droplets className="w-4 h-4" />
                    <span>채도</span>
                  </div>
                  <span className="text-sm text-gray-400">{saturation}%</span>
                </div>
                <Slider
                  value={[saturation]}
                  onValueChange={([v]) => setSaturation(v)}
                  min={0}
                  max={200}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          )}
          
          {/* 자르기/회전 탭 */}
          {activeTab === 'crop' && (
            <div className="space-y-6">
              {/* 회전/반전 버튼 */}
              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={rotate90}
                  className="bg-gray-800 border-gray-700 hover:bg-gray-700"
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  90° 회전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFlipH(!flipH)}
                  className={cn(
                    "bg-gray-800 border-gray-700 hover:bg-gray-700",
                    flipH && "bg-blue-900 border-blue-500"
                  )}
                >
                  <FlipHorizontal className="w-4 h-4 mr-2" />
                  좌우 반전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFlipV(!flipV)}
                  className={cn(
                    "bg-gray-800 border-gray-700 hover:bg-gray-700",
                    flipV && "bg-blue-900 border-blue-500"
                  )}
                >
                  <FlipVertical className="w-4 h-4 mr-2" />
                  상하 반전
                </Button>
              </div>
              
              {/* 비율 선택 */}
              <div>
                <p className="text-sm text-gray-400 mb-2">비율</p>
                <div className="flex gap-2">
                  {ASPECT_RATIOS.map(ratio => (
                    <Button
                      key={ratio.id}
                      variant="outline"
                      size="sm"
                      onClick={() => setAspectRatio(ratio.id)}
                      className={cn(
                        "flex-1 bg-gray-800 border-gray-700 hover:bg-gray-700",
                        aspectRatio === ratio.id && "bg-blue-900 border-blue-500"
                      )}
                    >
                      {ratio.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* 텍스트 탭 */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              {/* 텍스트 입력 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="텍스트 입력..."
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && addText()}
                />
                <Button
                  onClick={addText}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  추가
                </Button>
              </div>
              
              {/* 텍스트 설정 */}
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-gray-400" />
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                </div>
                
                <div className="flex-1 flex items-center gap-2">
                  <Type className="w-4 h-4 text-gray-400" />
                  <Slider
                    value={[textSize]}
                    onValueChange={([v]) => setTextSize(v)}
                    min={12}
                    max={72}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-400 w-8">{textSize}</span>
                </div>
              </div>
              
              {/* 추가된 텍스트 목록 */}
              {textOverlays.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">추가된 텍스트 (클릭해서 이동)</p>
                  <div className="flex flex-wrap gap-2">
                    {textOverlays.map(overlay => (
                      <div
                        key={overlay.id}
                        onClick={() => setSelectedTextId(overlay.id)}
                        className={cn(
                          "px-3 py-1 rounded-full text-sm cursor-pointer flex items-center gap-2",
                          selectedTextId === overlay.id
                            ? "bg-blue-500"
                            : "bg-gray-700 hover:bg-gray-600"
                        )}
                      >
                        <span style={{ color: overlay.color }}>{overlay.text}</span>
                        {selectedTextId === overlay.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteSelectedText()
                            }}
                            className="hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="text-xs text-gray-500">
                팁: 텍스트를 선택한 후 캔버스를 클릭하면 해당 위치로 이동합니다.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PhotoEditor
