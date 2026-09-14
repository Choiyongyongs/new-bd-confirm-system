import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RefreshCw, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  FileImage
} from 'lucide-react';

interface ImageZoomModalProps {
  imageUrl?: string | null;
  images?: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export default function ImageZoomModal({
  imageUrl,
  images,
  initialIndex = 0,
  title = '사진 원본 보기',
  onClose
}: ImageZoomModalProps) {
  // Determine list of images
  const imageList = images && images.length > 0 ? images : (imageUrl ? [imageUrl] : []);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  const activeImage = imageList[currentIndex] || imageUrl || '';

  // Zoom, pan & rotation state
  const [scale, setScale] = useState(1.0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Reset transform when changing image
  const handleReset = useCallback(() => {
    setScale(1.0);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  useEffect(() => {
    handleReset();
  }, [currentIndex, handleReset]);

  // Handle keyboard navigation & ESC close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && imageList.length > 1) {
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : imageList.length - 1));
      } else if (e.key === 'ArrowRight' && imageList.length > 1) {
        setCurrentIndex(prev => (prev < imageList.length - 1 ? prev + 1 : 0));
      } else if (e.key === '+' || e.key === '=') {
        setScale(s => Math.min(6.0, Number((s + 0.25).toFixed(2))));
      } else if (e.key === '-') {
        setScale(s => Math.max(0.5, Number((s - 0.25).toFixed(2))));
      } else if (e.key === 'r' || e.key === 'R') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageList.length, onClose, handleReset]);

  // Non-passive wheel listener for smooth zooming centered on mouse or container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
      setScale(prevScale => {
        const nextScale = Math.min(6.0, Math.max(0.5, Number((prevScale + zoomFactor).toFixed(2))));
        return nextScale;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Mouse Drag / Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: positionStartRef.current.x + dx,
      y: positionStartRef.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile / tablet
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      positionStartRef.current = { ...position };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      setPosition({
        x: positionStartRef.current.x + dx,
        y: positionStartRef.current.y + dy
      });
    } else if (e.touches.length === 2 && touchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistRef.current;
      touchDistRef.current = dist;
      setScale(s => Math.min(6.0, Math.max(0.5, Number((s * factor).toFixed(2)))));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistRef.current = null;
  };

  // Controls
  const handleZoomIn = () => setScale(s => Math.min(6.0, Number((s + 0.25).toFixed(2))));
  const handleZoomOut = () => setScale(s => Math.max(0.5, Number((s - 0.25).toFixed(2))));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const handleDownload = () => {
    if (!activeImage) return;
    const a = document.createElement('a');
    a.href = activeImage;
    a.download = `clinical_photo_${currentIndex + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!activeImage) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Header Controls Bar */}
      <div 
        className="bg-slate-900/90 border-b border-slate-800 text-white px-5 py-3.5 flex justify-between items-center z-10 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
            <FileImage className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>{title}</span>
              {imageList.length > 1 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 border border-slate-700">
                  {currentIndex + 1} / {imageList.length}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              마우스 휠 스크롤로 확대/축소, 드래그하여 원본 정밀 확인
            </p>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl p-1 text-xs">
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="축소 (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-bold text-blue-400 min-w-[52px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="확대 (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleReset}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="초기화 (1:1)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleRotate}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="90도 회전 (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownload}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer hidden sm:flex"
            title="원본 사진 다운로드"
          >
            <Download className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-slate-800 mx-1"></div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-rose-600 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Zoom Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Navigation Arrows for Multiple Images */}
        {imageList.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(prev => (prev > 0 ? prev - 1 : imageList.length - 1));
              }}
              className="absolute left-4 z-20 p-3 bg-slate-900/80 hover:bg-blue-600 border border-slate-700/80 text-white rounded-full shadow-xl transition-all cursor-pointer backdrop-blur-sm hover:scale-105"
              title="이전 사진 (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(prev => (prev < imageList.length - 1 ? prev + 1 : 0));
              }}
              className="absolute right-4 z-20 p-3 bg-slate-900/80 hover:bg-blue-600 border border-slate-700/80 text-white rounded-full shadow-xl transition-all cursor-pointer backdrop-blur-sm hover:scale-105"
              title="다음 사진 (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* The Image Wrapper with 2D transform */}
        <div 
          className="transition-transform duration-75 ease-out flex items-center justify-center p-4 max-w-full max-h-full"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: 'center center'
          }}
        >
          <img
            src={activeImage}
            alt="Clinical Photo Original"
            className="max-w-[85vw] max-h-[80vh] object-contain rounded-lg shadow-2xl pointer-events-none select-none border border-slate-700/40 bg-slate-900"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Bottom Floating Hint & Thumbnail Bar */}
      <div 
        className="bg-slate-900/90 border-t border-slate-800 text-white px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 z-10 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Maximize2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong>마우스 휠</strong>을 위/아래로 스크롤하면 확대/축소되고, 클릭 후 <strong>드래그</strong>하여 자유롭게 이동할 수 있습니다.
          </span>
        </div>

        {/* Thumbnails if multiple images */}
        {imageList.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1">
            {imageList.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                  currentIndex === idx 
                    ? 'border-blue-500 scale-105 shadow-md shadow-blue-500/20 ring-2 ring-blue-500/30' 
                    : 'border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >
                <img 
                  src={img} 
                  alt={`Thumbnail ${idx + 1}`} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
