import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { saveEdits, setRating as apiSetRating, setFlag as apiSetFlag } from '../lib/api';

export function useKeyboardShortcuts() {
  const {
    files,
    selectedIndex,
    setSelectedIndex,
    selectedFile,
    selectedEditState,
    updateEdit,
    setRating,
    setFlag,
  } = useAppStore();

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const file = selectedFile();
      if (!file) return;

      const edits = selectedEditState();

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (selectedIndex < files.length - 1) setSelectedIndex(selectedIndex + 1);
          break;

        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          e.preventDefault();
          const rating = parseInt(e.key);
          setRating(file.id, rating);
          await apiSetRating(file.id, rating).catch(console.error);
          break;

        case '0':
          e.preventDefault();
          setRating(file.id, 0);
          await apiSetRating(file.id, 0).catch(console.error);
          break;

        case 'p':
        case 'P':
          e.preventDefault();
          setFlag(file.id, 'pick');
          await apiSetFlag(file.id, 'pick').catch(console.error);
          break;

        case 'x':
        case 'X':
          e.preventDefault();
          setFlag(file.id, 'reject');
          await apiSetFlag(file.id, 'reject').catch(console.error);
          break;

        case 'u':
        case 'U':
          e.preventDefault();
          setFlag(file.id, 'none');
          await apiSetFlag(file.id, 'none').catch(console.error);
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          const newRotation = e.shiftKey
            ? (((edits.rotation - 90) % 360 + 360) % 360) as 0 | 90 | 180 | 270
            : ((edits.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          updateEdit(file.id, { rotation: newRotation });
          await saveEdits(file.id, { ...edits, rotation: newRotation }).catch(console.error);
          break;
      }
    },
    [files, selectedIndex, selectedFile, selectedEditState, setSelectedIndex, updateEdit, setRating, setFlag]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
