import { useAppStore } from '../store';
import { setRating as apiSetRating, setFlag as apiSetFlag } from '../lib/api';

export function RatingBar() {
  const { selectedFile, selectedEditState, setRating, setFlag } = useAppStore();

  const file = selectedFile();
  const edits = selectedEditState();

  if (!file) return null;

  const handleRating = async (rating: number) => {
    setRating(file.id, rating);
    try {
      await apiSetRating(file.id, rating);
    } catch (e) {
      console.error('Rating save failed:', e);
    }
  };

  const handleFlag = async (flag: 'none' | 'pick' | 'reject') => {
    setFlag(file.id, flag);
    try {
      await apiSetFlag(file.id, flag);
    } catch (e) {
      console.error('Flag save failed:', e);
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-surface-800 border-t border-surface-700">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRating(edits.rating === star ? 0 : star)}
            className={`text-xl transition-colors ${
              star <= edits.rating ? 'text-yellow-400' : 'text-surface-600 hover:text-surface-400'
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-surface-600" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleFlag(edits.flag === 'pick' ? 'none' : 'pick')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            edits.flag === 'pick'
              ? 'bg-green-600 text-white'
              : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
          }`}
        >
          Pick (P)
        </button>
        <button
          onClick={() => handleFlag(edits.flag === 'reject' ? 'none' : 'reject')}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            edits.flag === 'reject'
              ? 'bg-red-600 text-white'
              : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
          }`}
        >
          Reject (X)
        </button>
      </div>

      <div className="ml-auto text-sm text-surface-400">
        {edits.rotation !== 0 && <span className="mr-4">↻ {edits.rotation}°</span>}
        <span>Press R to rotate</span>
      </div>
    </div>
  );
}
