import * as Slider from '@radix-ui/react-slider';
import { useAppStore } from '../store';
import { saveEdits, aiAnalyze, aiAutoEnhance, AiSuggestion } from '../lib/api';
import { useCallback, useRef, useState } from 'react';
import { EditState, DEFAULT_EDIT_STATE } from '../types';

interface SliderControlProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function SliderControl({ label, value, defaultValue, min, max, step = 1, unit = '', onChange }: SliderControlProps) {
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-surface-300">{label}</span>
        <span className="text-surface-400">{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
      </div>
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        onDoubleClick={() => onChange(defaultValue)}
      >
        <Slider.Track className="bg-surface-700 relative grow rounded-full h-1">
          <Slider.Range className="absolute bg-blue-500 rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </Slider.Root>
    </div>
  );
}

export function EditPanel() {
  const { selectedFile, selectedEditState, updateEdit, setCropMode, cropMode } = useAppStore();
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [aiStrength, setAiStrength] = useState(0.8);

  const file = selectedFile();
  const edits = selectedEditState();

  const handleChange = useCallback(
    (field: keyof EditState, value: number | 0 | 90 | 180 | 270) => {
      if (!file) return;
      updateEdit(file.id, { [field]: value });

      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        try {
          await saveEdits(file.id, { ...edits, [field]: value });
        } catch (e) {
          console.error('Save failed:', e);
        }
      }, 500);
    },
    [file, edits, updateEdit]
  );

  const handleRotateLeft = useCallback(() => {
    if (!file) return;
    const newRotation = ((edits.rotation - 90 + 360) % 360) as 0 | 90 | 180 | 270;
    handleChange('rotation', newRotation);
  }, [file, edits.rotation, handleChange]);

  const handleRotateRight = useCallback(() => {
    if (!file) return;
    const newRotation = ((edits.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    handleChange('rotation', newRotation);
  }, [file, edits.rotation, handleChange]);

  const handleAiAnalyze = useCallback(async () => {
    if (!file) return;
    setIsAiProcessing(true);
    try {
      const suggestion = await aiAnalyze(file.id);
      setAiSuggestion(suggestion);
    } catch (e) {
      console.error('AI analyze failed:', e);
    } finally {
      setIsAiProcessing(false);
    }
  }, [file]);

  const handleAiEnhance = useCallback(async () => {
    if (!file) return;
    setIsAiProcessing(true);
    try {
      const newEdits = await aiAutoEnhance(file.id, aiStrength);
      updateEdit(file.id, newEdits);
      setAiSuggestion(null);
    } catch (e) {
      console.error('AI enhance failed:', e);
    } finally {
      setIsAiProcessing(false);
    }
  }, [file, aiStrength, updateEdit]);

  const handleResetAll = useCallback(async () => {
    if (!file) return;
    updateEdit(file.id, DEFAULT_EDIT_STATE);
    setAiSuggestion(null);
    try {
      await saveEdits(file.id, DEFAULT_EDIT_STATE);
    } catch (e) {
      console.error('Reset save failed:', e);
    }
  }, [file, updateEdit]);

  if (!file) {
    return (
      <div className="w-72 bg-surface-800 p-4 text-surface-500 text-sm">
        No image selected
      </div>
    );
  }

  return (
    <div className="w-72 bg-surface-800 p-4 overflow-y-auto">
      <div className="mb-4 p-3 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg border border-purple-500/30">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-purple-400 text-lg">✨</span>
          <h3 className="text-sm font-semibold text-purple-200">AI Enhance</h3>
        </div>
        
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleAiAnalyze}
            disabled={isAiProcessing}
            className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white text-sm font-medium rounded transition-colors"
          >
            {isAiProcessing ? 'Analyzing...' : 'Analyze'}
          </button>
          <button
            onClick={handleAiEnhance}
            disabled={isAiProcessing}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm font-medium rounded transition-colors"
          >
            {isAiProcessing ? 'Processing...' : 'Apply'}
          </button>
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-surface-400">Strength</span>
            <span className="text-surface-400">{Math.round(aiStrength * 100)}%</span>
          </div>
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-4"
            value={[aiStrength]}
            min={0}
            max={1}
            step={0.1}
            onValueChange={([v]) => setAiStrength(v)}
          >
            <Slider.Track className="bg-surface-700 relative grow rounded-full h-1">
              <Slider.Range className="absolute bg-purple-500 rounded-full h-full" />
            </Slider.Track>
            <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow" />
          </Slider.Root>
        </div>

        {aiSuggestion && (
          <div className="mt-3 p-2 bg-surface-900/50 rounded text-xs">
            <div className="flex justify-between text-surface-400 mb-1">
              <span>Scene: {aiSuggestion.sceneType}</span>
              <span>Confidence: {Math.round(aiSuggestion.confidence * 100)}%</span>
            </div>
            <div className="text-surface-500 text-[10px] space-y-0.5">
              <div>Exposure: {aiSuggestion.exposure.toFixed(2)} EV</div>
              <div>Contrast: {aiSuggestion.contrast.toFixed(0)}</div>
              <div>Temp: {aiSuggestion.whiteBalanceTemp.toFixed(0)}K</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleResetAll}
          className="flex-1 px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-300 text-sm rounded transition-colors"
        >
          Reset All
        </button>
      </div>

      <h3 className="text-sm font-semibold text-surface-200 mb-4 border-b border-surface-700 pb-2">
        Transform
      </h3>

      <div className="mb-4">
        <button
          onClick={() => setCropMode(!cropMode)}
          className={`w-full px-3 py-2 text-sm rounded transition-colors ${cropMode ? 'bg-blue-600 text-white' : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}`}
        >
          {cropMode ? 'Done Cropping' : 'Crop'}
        </button>
      </div>

      <SliderControl
        label="Straighten"
        value={edits.straightenAngle}
        defaultValue={DEFAULT_EDIT_STATE.straightenAngle}
        min={-45}
        max={45}
        step={0.1}
        unit="°"
        onChange={(v) => handleChange('straightenAngle', v)}
      />

      <div className="mb-4">
        <span className="text-sm text-surface-300 block mb-2">Rotate</span>
        <div className="flex gap-2">
          <button
            onClick={handleRotateLeft}
            className="flex-1 px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-300 text-sm rounded transition-colors"
            title="Rotate Left 90°"
          >
            ↺ Left
          </button>
          <button
            onClick={handleRotateRight}
            className="flex-1 px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-300 text-sm rounded transition-colors"
            title="Rotate Right 90°"
          >
            ↻ Right
          </button>
        </div>
        <div className="text-center text-xs text-surface-500 mt-1">
          Current: {edits.rotation}°
        </div>
      </div>

      <h3 className="text-sm font-semibold text-surface-200 mb-4 mt-6 border-b border-surface-700 pb-2">
        Light
      </h3>

      <SliderControl
        label="Exposure"
        value={edits.exposure}
        defaultValue={DEFAULT_EDIT_STATE.exposure}
        min={-5}
        max={5}
        step={0.1}
        unit=" EV"
        onChange={(v) => handleChange('exposure', v)}
      />

      <SliderControl
        label="Contrast"
        value={edits.contrast}
        defaultValue={DEFAULT_EDIT_STATE.contrast}
        min={-100}
        max={100}
        onChange={(v) => handleChange('contrast', v)}
      />

      <h3 className="text-sm font-semibold text-surface-200 mb-4 mt-6 border-b border-surface-700 pb-2">
        Color
      </h3>

      <SliderControl
        label="Temperature"
        value={edits.whiteBalanceTemp}
        defaultValue={DEFAULT_EDIT_STATE.whiteBalanceTemp}
        min={2000}
        max={12000}
        step={100}
        unit="K"
        onChange={(v) => handleChange('whiteBalanceTemp', v)}
      />

      <SliderControl
        label="Tint"
        value={edits.whiteBalanceTint}
        defaultValue={DEFAULT_EDIT_STATE.whiteBalanceTint}
        min={-150}
        max={150}
        onChange={(v) => handleChange('whiteBalanceTint', v)}
      />

      <SliderControl
        label="Saturation"
        value={edits.saturation}
        defaultValue={DEFAULT_EDIT_STATE.saturation}
        min={-100}
        max={100}
        onChange={(v) => handleChange('saturation', v)}
      />

      <SliderControl
        label="Vibrance"
        value={edits.vibrance}
        defaultValue={DEFAULT_EDIT_STATE.vibrance}
        min={-100}
        max={100}
        onChange={(v) => handleChange('vibrance', v)}
      />

      <h3 className="text-sm font-semibold text-surface-200 mb-4 mt-6 border-b border-surface-700 pb-2">
        Detail
      </h3>

      <SliderControl
        label="Sharpening"
        value={edits.sharpeningAmount}
        defaultValue={DEFAULT_EDIT_STATE.sharpeningAmount}
        min={0}
        max={150}
        onChange={(v) => handleChange('sharpeningAmount', v)}
      />

      <SliderControl
        label="Radius"
        value={edits.sharpeningRadius}
        defaultValue={DEFAULT_EDIT_STATE.sharpeningRadius}
        min={0.5}
        max={3}
        step={0.1}
        onChange={(v) => handleChange('sharpeningRadius', v)}
      />
    </div>
  );
}
