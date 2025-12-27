import { useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { getThumbnail } from '../lib/api';
import { convertFileSrc } from '@tauri-apps/api/core';

export function FilmStrip() {
  const { files, selectedIndex, setSelectedIndex, thumbnails, setThumbnail, editStates } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    files.forEach(async (file) => {
      if (!thumbnails[file.id]) {
        try {
          const thumbPath = await getThumbnail(file.id);
          setThumbnail(file.id, thumbPath);
        } catch (e) {
          console.error('Thumbnail failed:', file.filename, e);
        }
      }
    });
  }, [files, thumbnails, setThumbnail]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedIndex]);

  const getFlag = (fileId: string) => editStates[fileId]?.flag || 'none';
  const getRating = (fileId: string) => editStates[fileId]?.rating || 0;

  const getThumbnailSrc = (fileId: string): string | null => {
    const path = thumbnails[fileId];
    if (!path) return null;
    return convertFileSrc(path);
  };

  return (
    <div
      ref={containerRef}
      className="flex gap-1 p-2 bg-surface-800 overflow-x-auto h-28 items-center"
    >
      {files.map((file, idx) => {
        const isSelected = idx === selectedIndex;
        const flag = getFlag(file.id);
        const rating = getRating(file.id);
        const thumbSrc = getThumbnailSrc(file.id);

        return (
          <div
            key={file.id}
            ref={isSelected ? selectedRef : null}
            onClick={() => setSelectedIndex(idx)}
            className={`
              relative flex-shrink-0 w-24 h-20 cursor-pointer rounded overflow-hidden
              ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-surface-600'}
              ${flag === 'pick' ? 'ring-green-500' : flag === 'reject' ? 'ring-red-500 opacity-50' : ''}
            `}
          >
            {thumbSrc ? (
              <img
                src={thumbSrc}
                alt={file.filename}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-surface-700 flex items-center justify-center">
                <span className="text-xs text-surface-400">...</span>
              </div>
            )}

            {rating > 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-xs py-0.5">
                {'★'.repeat(rating)}
              </div>
            )}

            {flag === 'pick' && (
              <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-xs">
                ✓
              </div>
            )}
            {flag === 'reject' && (
              <div className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-xs">
                ✕
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
