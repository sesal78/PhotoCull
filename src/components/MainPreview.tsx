import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { getPreview } from '../lib/api';

export function MainPreview() {
  const { selectedFile, selectedEditState, previewUrl, setPreviewUrl, isLoading, cropMode } = useAppStore();
  const [zoom, setZoom] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const file = selectedFile();
  const edits = selectedEditState();

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    setLocalLoading(true);

    const loadPreview = async () => {
      try {
        const bytes = await getPreview(file.id, edits, 2048);
        if (cancelled) return;

        const uint8 = new Uint8Array(bytes);
        const blob = new Blob([uint8], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
      } catch (e) {
        console.error('Preview failed:', e);
        if (!cancelled) setPreviewUrl(null);
      } finally {
        if (!cancelled) setLocalLoading(false);
      }
    };

    const debounce = setTimeout(loadPreview, 100);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [file?.id, edits.exposure, edits.contrast, edits.whiteBalanceTemp, edits.whiteBalanceTint, 
      edits.saturation, edits.vibrance, edits.sharpeningAmount, edits.rotation, edits.straightenAngle, edits.crop]);

  const handleClick = () => {
    if (!cropMode) setZoom(!zoom);
  };

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-900 text-surface-500">
        Open a folder to start (Ctrl+O)
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex items-center justify-center bg-surface-900 overflow-hidden cursor-pointer relative"
      onClick={handleClick}
    >
      {(localLoading || isLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-10">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}

      {previewUrl ? (
        <img
          src={previewUrl}
          alt={file.filename}
          className={`max-w-full max-h-full transition-transform ${zoom ? 'scale-150' : ''}`}
          style={{
            transform: `rotate(${edits.straightenAngle}deg)`,
          }}
        />
      ) : (
        <div className="text-surface-500">Loading...</div>
      )}

      {cropMode && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-500 pointer-events-none m-8" />
      )}

      <div className="absolute bottom-4 left-4 text-sm text-surface-400 bg-surface-900/80 px-2 py-1 rounded">
        {file.filename}
      </div>
    </div>
  );
}
