import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '../store';
import { selectExportFolder, exportImages } from '../lib/api';
import { ExportOptions } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ open, onOpenChange }: Props) {
  const { files, editStates } = useAppStore();
  const [destination, setDestination] = useState<string | null>(null);
  const [quality, setQuality] = useState(90);
  const [exporting, setExporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);

  const pickedFiles = files.filter((f) => editStates[f.id]?.flag === 'pick');
  const exportCount = pickedFiles.length || files.length;
  const filesToExport = pickedFiles.length > 0 ? pickedFiles : files;

  const handleSelectFolder = async () => {
    const folder = await selectExportFolder();
    if (folder) setDestination(folder);
  };

  const handleExport = async () => {
    if (!destination) return;

    setExporting(true);
    setResults(null);

    const options: ExportOptions = {
      format: 'jpeg',
      quality,
      resizeMode: 'original',
      resizeValue: null,
    };

    try {
      const fileIds = filesToExport.map((f) => f.id);
      const exportResults = await exportImages(fileIds, destination, options);

      const success = exportResults.filter((r) => r.success).length;
      const failed = exportResults.filter((r) => !r.success).length;
      setResults({ success, failed });
    } catch (e) {
      console.error('Export failed:', e);
      setResults({ success: 0, failed: exportCount });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-800 rounded-lg p-6 w-96 shadow-xl">
          <Dialog.Title className="text-lg font-semibold mb-4">
            Export Images
          </Dialog.Title>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-surface-400 mb-2">
                {pickedFiles.length > 0
                  ? `Exporting ${exportCount} picked images`
                  : `Exporting all ${exportCount} images`}
              </p>
            </div>

            <div>
              <label className="block text-sm text-surface-300 mb-1">Destination</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={destination || ''}
                  placeholder="Select folder..."
                  className="flex-1 bg-surface-700 rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSelectFolder}
                  className="px-3 py-2 bg-surface-600 hover:bg-surface-500 rounded text-sm"
                >
                  Browse
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-surface-300 mb-1">
                Quality: {quality}%
              </label>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {results && (
              <div className={`text-sm p-2 rounded ${results.failed > 0 ? 'bg-red-900/50' : 'bg-green-900/50'}`}>
                Exported {results.success} images
                {results.failed > 0 && `, ${results.failed} failed`}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm text-surface-300 hover:text-white">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleExport}
              disabled={!destination || exporting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
