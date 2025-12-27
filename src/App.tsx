import { useState, useEffect } from 'react';
import { FilmStrip } from './components/FilmStrip';
import { MainPreview } from './components/MainPreview';
import { EditPanel } from './components/EditPanel';
import { RatingBar } from './components/RatingBar';
import { ExportDialog } from './components/ExportDialog';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppStore } from './store';
import { openFolderDialog, openFolder } from './lib/api';

function App() {
  const { files, folderPath, setFolder, setLoading, setError, error } = useAppStore();
  const [exportOpen, setExportOpen] = useState(false);

  useKeyboardShortcuts();

  const handleOpenFolder = async () => {
    try {
      const path = await openFolderDialog();
      if (!path) return;

      setLoading(true);
      setError(null);

      const contents = await openFolder(path);
      setFolder(contents.path, contents.files, contents.editStates);
    } catch (e) {
      console.error('Open folder failed:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        handleOpenFolder();
      }
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        if (files.length > 0) setExportOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files.length]);

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-white select-none">
      <header className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">PhotoCull</h1>
          {folderPath && (
            <span className="text-sm text-surface-400 truncate max-w-md">{folderPath}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenFolder}
            className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 rounded text-sm"
          >
            Open Folder
          </button>
          <button
            onClick={() => setExportOpen(true)}
            disabled={files.length === 0}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm"
          >
            Export
          </button>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-900/50 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <MainPreview />
        <EditPanel />
      </div>

      <RatingBar />
      <FilmStrip />

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

export default App;
