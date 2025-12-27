import { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store';
import { getPreview } from '../lib/api';
import { DEFAULT_EDIT_STATE } from '../types';

const ASPECT_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4/3 },
  { label: '3:2', value: 3/2 },
  { label: '16:9', value: 16/9 },
  { label: '9:16', value: 9/16 },
  { label: '3:4', value: 3/4 },
  { label: '2:3', value: 2/3 },
];

type CompareMode = 'off' | 'split' | 'toggle';

export function MainPreview() {
  const { selectedFile, selectedEditState, previewUrl, setPreviewUrl, isLoading, cropMode, setCropMode, updateEdit } = useAppStore();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropDragMode, setCropDragMode] = useState<'create' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | null>(null);
  const [cropDragOffset, setCropDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [compareMode, setCompareMode] = useState<CompareMode>('off');
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const requestIdRef = useRef(0);

  const file = selectedFile();
  const edits = selectedEditState();

  // Load edited preview
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    let cancelled = false;

    const loadPreview = async () => {
      setLocalLoading(true);
      try {
        const bytes = await getPreview(file.id, edits, 1600);
        if (cancelled || currentRequestId !== requestIdRef.current) return;

        const uint8 = new Uint8Array(bytes);
        const blob = new Blob([uint8], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
      } catch (e) {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          console.error('Preview failed:', e);
          setPreviewUrl(null);
        }
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLocalLoading(false);
        }
      }
    };

    const debounce = setTimeout(loadPreview, 150);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [file?.id, edits.exposure, edits.contrast, edits.highlights, edits.shadows,
      edits.whiteBalanceTemp, edits.whiteBalanceTint, edits.saturation, edits.vibrance,
      edits.sharpeningAmount, edits.noiseReduction, edits.rotation, edits.straightenAngle, edits.crop]);

  // Load original (before) preview when compare mode is enabled
  useEffect(() => {
    if (!file || compareMode === 'off') {
      if (beforeUrl) {
        URL.revokeObjectURL(beforeUrl);
        setBeforeUrl(null);
      }
      return;
    }

    let cancelled = false;

    const loadBefore = async () => {
      try {
        const bytes = await getPreview(file.id, DEFAULT_EDIT_STATE, 1600);
        if (cancelled) return;

        const uint8 = new Uint8Array(bytes);
        const blob = new Blob([uint8], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        if (beforeUrl) URL.revokeObjectURL(beforeUrl);
        setBeforeUrl(url);
      } catch (e) {
        console.error('Before preview failed:', e);
      }
    };

    loadBefore();
    return () => { cancelled = true; };
  }, [file?.id, compareMode]);

  // Handle toggle mode key press
  useEffect(() => {
    if (compareMode !== 'toggle') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setShowBefore(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setShowBefore(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [compareMode]);

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingSplit(true);
  }, []);

  const handleSplitMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingSplit || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    setSplitPosition(Math.max(5, Math.min(95, percent)));
  }, [isDraggingSplit]);

  const handleSplitMouseUp = useCallback(() => {
    setIsDraggingSplit(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (cropMode) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomLevel(z => Math.max(0.5, Math.min(5, z * delta)));
  }, [cropMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (cropMode) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if clicking on existing crop box
      if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
        const handleSize = 15;
        const inLeft = x >= cropRect.x - handleSize && x <= cropRect.x + handleSize;
        const inRight = x >= cropRect.x + cropRect.width - handleSize && x <= cropRect.x + cropRect.width + handleSize;
        const inTop = y >= cropRect.y - handleSize && y <= cropRect.y + handleSize;
        const inBottom = y >= cropRect.y + cropRect.height - handleSize && y <= cropRect.y + cropRect.height + handleSize;
        const inBoxX = x >= cropRect.x && x <= cropRect.x + cropRect.width;
        const inBoxY = y >= cropRect.y && y <= cropRect.y + cropRect.height;

        // Check corners first for resize
        if (inLeft && inTop) {
          setCropDragMode('resize-nw');
          setIsDraggingCrop(true);
          return;
        } else if (inRight && inTop) {
          setCropDragMode('resize-ne');
          setIsDraggingCrop(true);
          return;
        } else if (inLeft && inBottom) {
          setCropDragMode('resize-sw');
          setIsDraggingCrop(true);
          return;
        } else if (inRight && inBottom) {
          setCropDragMode('resize-se');
          setIsDraggingCrop(true);
          return;
        } else if (inBoxX && inBoxY) {
          // Click inside box - move it
          setCropDragMode('move');
          setCropDragOffset({ x: x - cropRect.x, y: y - cropRect.y });
          setIsDraggingCrop(true);
          return;
        }
      }

      // Click outside - create new crop
      setCropStart({ x, y });
      setCropDragMode('create');
      setIsDraggingCrop(true);
      setCropRect({ x, y, width: 0, height: 0 });
    } else if (zoomLevel > 1) {
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    }
  }, [cropMode, zoomLevel, cropRect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingCrop && cropMode) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (cropDragMode === 'create' && cropStart) {
        let x = cropStart.x;
        let y = cropStart.y;
        let width = mouseX - cropStart.x;
        let height = mouseY - cropStart.y;

        if (width < 0) { x += width; width = -width; }
        if (height < 0) { y += height; height = -height; }

        if (aspectRatio) {
          height = width / aspectRatio;
        }

        setCropRect({ x, y, width, height });
      } else if (cropDragMode === 'move' && cropRect) {
        const newX = Math.max(0, Math.min(rect.width - cropRect.width, mouseX - cropDragOffset.x));
        const newY = Math.max(0, Math.min(rect.height - cropRect.height, mouseY - cropDragOffset.y));
        setCropRect({ ...cropRect, x: newX, y: newY });
      } else if (cropDragMode?.startsWith('resize') && cropRect) {
        let newRect = { ...cropRect };

        if (cropDragMode === 'resize-se') {
          newRect.width = Math.max(20, mouseX - cropRect.x);
          newRect.height = aspectRatio ? newRect.width / aspectRatio : Math.max(20, mouseY - cropRect.y);
        } else if (cropDragMode === 'resize-sw') {
          const newWidth = Math.max(20, cropRect.x + cropRect.width - mouseX);
          newRect.x = cropRect.x + cropRect.width - newWidth;
          newRect.width = newWidth;
          newRect.height = aspectRatio ? newRect.width / aspectRatio : Math.max(20, mouseY - cropRect.y);
        } else if (cropDragMode === 'resize-ne') {
          newRect.width = Math.max(20, mouseX - cropRect.x);
          const newHeight = aspectRatio ? newRect.width / aspectRatio : Math.max(20, cropRect.y + cropRect.height - mouseY);
          newRect.y = cropRect.y + cropRect.height - newHeight;
          newRect.height = newHeight;
        } else if (cropDragMode === 'resize-nw') {
          const newWidth = Math.max(20, cropRect.x + cropRect.width - mouseX);
          const newHeight = aspectRatio ? newWidth / aspectRatio : Math.max(20, cropRect.y + cropRect.height - mouseY);
          newRect.x = cropRect.x + cropRect.width - newWidth;
          newRect.y = cropRect.y + cropRect.height - newHeight;
          newRect.width = newWidth;
          newRect.height = newHeight;
        }

        setCropRect(newRect);
      }
    } else if (isPanning) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      setPanOffset(p => ({ x: p.x + dx, y: p.y + dy }));
    }
  }, [isDraggingCrop, cropStart, aspectRatio, isPanning, cropDragMode, cropRect, cropDragOffset, cropMode]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    if (isDraggingCrop && cropRect && cropRect.width > 10 && cropRect.height > 10) {
      // Keep cropRect for display
    } else if (cropDragMode === 'create') {
      setCropRect(null);
    }
    setIsDraggingCrop(false);
    setCropStart(null);
    setCropDragMode(null);
  }, [isDraggingCrop, cropRect, cropDragMode]);

  const handleDoubleClick = useCallback(() => {
    if (!cropMode) {
      if (zoomLevel === 1) {
        setZoomLevel(2);
      } else {
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
      }
    }
  }, [cropMode, zoomLevel]);

  const applyCrop = useCallback(() => {
    if (!cropRect || !imageRef.current || !containerRef.current || !file) return;
    
    const imgRect = imageRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    
    const imgOffsetX = imgRect.left - containerRect.left;
    const imgOffsetY = imgRect.top - containerRect.top;
    
    const scaleX = imageRef.current.naturalWidth / imgRect.width;
    const scaleY = imageRef.current.naturalHeight / imgRect.height;
    
    const cropX = Math.max(0, (cropRect.x - imgOffsetX) * scaleX);
    const cropY = Math.max(0, (cropRect.y - imgOffsetY) * scaleY);
    const cropW = cropRect.width * scaleX;
    const cropH = cropRect.height * scaleY;
    
    updateEdit(file.id, {
      crop: { x: cropX, y: cropY, width: cropW, height: cropH }
    });
    
    setCropRect(null);
    setCropMode(false);
  }, [cropRect, file, updateEdit, setCropMode]);

  const cancelCrop = useCallback(() => {
    setCropRect(null);
    setCropMode(false);
  }, [setCropMode]);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-900 text-surface-500">
        Open a folder to start (Ctrl+O)
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-surface-900 overflow-hidden">
      {/* Zoom controls */}
      <div className="absolute top-4 right-80 z-20 flex gap-2 bg-surface-800/90 rounded-lg p-2">
        <button
          onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
          className="w-8 h-8 flex items-center justify-center text-surface-300 hover:bg-surface-700 rounded"
          title="Zoom Out"
        >
          −
        </button>
        <span className="text-sm text-surface-300 flex items-center min-w-[50px] justify-center">
          {Math.round(zoomLevel * 100)}%
        </span>
        <button
          onClick={() => setZoomLevel(z => Math.min(5, z + 0.25))}
          className="w-8 h-8 flex items-center justify-center text-surface-300 hover:bg-surface-700 rounded"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={resetZoom}
          className="px-2 h-8 flex items-center justify-center text-surface-300 hover:bg-surface-700 rounded text-xs"
          title="Reset Zoom"
        >
          Fit
        </button>
        <div className="w-px bg-surface-600 mx-1" />
        <button
          onClick={() => setCompareMode(m => m === 'off' ? 'split' : m === 'split' ? 'toggle' : 'off')}
          className={`px-2 h-8 flex items-center justify-center rounded text-xs ${
            compareMode !== 'off' ? 'bg-blue-600 text-white' : 'text-surface-300 hover:bg-surface-700'
          }`}
          title={compareMode === 'off' ? 'Compare: Off' : compareMode === 'split' ? 'Compare: Split' : 'Compare: Toggle (Space)'}
        >
          {compareMode === 'off' ? 'B/A' : compareMode === 'split' ? 'Split' : 'Hold'}
        </button>
      </div>

      {/* Compare mode indicator */}
      {compareMode === 'toggle' && (
        <div className="absolute top-16 right-80 z-20 text-xs text-surface-400 bg-surface-800/90 rounded px-2 py-1">
          Hold Space to see before
        </div>
      )}

      {/* Crop aspect ratio selector */}
      {cropMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-surface-800/90 rounded-lg p-2">
          {ASPECT_RATIOS.map(ar => (
            <button
              key={ar.label}
              onClick={() => setAspectRatio(ar.value)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                aspectRatio === ar.value
                  ? 'bg-blue-600 text-white'
                  : 'text-surface-300 hover:bg-surface-700'
              }`}
            >
              {ar.label}
            </button>
          ))}
          <div className="w-px bg-surface-600 mx-2" />
          <button
            onClick={applyCrop}
            disabled={!cropRect}
            className="px-3 py-1 text-xs rounded bg-green-600 hover:bg-green-700 disabled:bg-surface-700 disabled:text-surface-500 text-white"
          >
            Apply
          </button>
          <button
            onClick={cancelCrop}
            className="px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white"
          >
            Cancel
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className={`flex-1 flex items-center justify-center overflow-hidden relative ${
          cropMode ? 'cursor-crosshair' : isDraggingSplit ? 'cursor-ew-resize' : zoomLevel > 1 ? 'cursor-grab' : 'cursor-zoom-in'
        } ${isPanning ? 'cursor-grabbing' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => { handleMouseMove(e); handleSplitMouseMove(e); }}
        onMouseUp={() => { handleMouseUp(); handleSplitMouseUp(); }}
        onMouseLeave={() => { handleMouseUp(); handleSplitMouseUp(); }}
        onDoubleClick={handleDoubleClick}
      >
        {(localLoading || isLoading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-10">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {/* Toggle mode - show before when holding space */}
        {compareMode === 'toggle' && showBefore && beforeUrl ? (
          <img
            src={beforeUrl}
            alt="Before"
            className="max-w-full max-h-full select-none"
            draggable={false}
            style={{
              transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
              transformOrigin: 'center center',
            }}
          />
        ) : compareMode === 'split' && beforeUrl && previewUrl ? (
          /* Split view */
          <div className="relative max-w-full max-h-full">
            <img
              ref={imageRef}
              src={previewUrl}
              alt="After"
              className="max-w-full max-h-full select-none"
              draggable={false}
              style={{
                transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px) rotate(${edits.straightenAngle}deg)`,
                transformOrigin: 'center center',
              }}
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
            >
              <img
                src={beforeUrl}
                alt="Before"
                className="max-w-full max-h-full select-none"
                draggable={false}
                style={{
                  transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                  transformOrigin: 'center center',
                }}
              />
            </div>
            {/* Split line */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-20"
              style={{ left: `${splitPosition}%`, transform: 'translateX(-50%)' }}
              onMouseDown={handleSplitMouseDown}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-surface-900 text-xs font-bold">||</span>
              </div>
            </div>
            {/* Labels */}
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">Before</div>
            <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">After</div>
          </div>
        ) : previewUrl ? (
          <img
            ref={imageRef}
            src={previewUrl}
            alt={file.filename}
            className="max-w-full max-h-full select-none"
            draggable={false}
            style={{
              transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px) rotate(${edits.straightenAngle}deg)`,
              transformOrigin: 'center center',
            }}
          />
        ) : (
          <div className="text-surface-500">Loading...</div>
        )}

        {/* Crop overlay */}
        {cropMode && cropRect && cropRect.width > 0 && cropRect.height > 0 && (
          <>
            <div className="absolute inset-0 bg-black/50 pointer-events-none" />
            <div
              className="absolute border-2 border-blue-500 bg-transparent"
              style={{
                left: cropRect.x,
                top: cropRect.y,
                width: cropRect.width,
                height: cropRect.height,
                boxShadow: `0 0 0 9999px rgba(0,0,0,0.5)`,
                cursor: 'move',
              }}
            >
              {/* Rule of thirds grid */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="border border-white/30" />
                ))}
              </div>
              {/* Corner resize handles */}
              <div className="absolute -left-2 -top-2 w-4 h-4 bg-blue-500 border-2 border-white cursor-nwse-resize" />
              <div className="absolute -right-2 -top-2 w-4 h-4 bg-blue-500 border-2 border-white cursor-nesw-resize" />
              <div className="absolute -left-2 -bottom-2 w-4 h-4 bg-blue-500 border-2 border-white cursor-nesw-resize" />
              <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-blue-500 border-2 border-white cursor-nwse-resize" />
            </div>
          </>
        )}

        {/* Crop instructions */}
        {cropMode && !cropRect && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70 text-center pointer-events-none">
            <div className="text-lg">Click and drag to create crop area</div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 text-sm text-surface-400 bg-surface-900/80 px-2 py-1 rounded">
          {file.filename}
        </div>
      </div>
    </div>
  );
}
