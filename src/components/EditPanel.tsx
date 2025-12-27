import * as Slider from '@radix-ui/react-slider';
import { useAppStore } from '../store';
import { saveEdits, aiAnalyze, aiAutoEnhance, aiBatchEnhance, AiSuggestion } from '../lib/api';
import { useCallback, useRef, useState, useEffect } from 'react';
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

function blendEdits(base: EditState, suggestion: AiSuggestion, strength: number): Partial<EditState> {
  return {
    exposure: base.exposure + (suggestion.exposure - base.exposure) * strength,
    contrast: base.contrast + (suggestion.contrast - base.contrast) * strength,
    highlights: base.highlights + (suggestion.highlights - base.highlights) * strength,
    shadows: base.shadows + (suggestion.shadows - base.shadows) * strength,
    whiteBalanceTemp: base.whiteBalanceTemp + (suggestion.whiteBalanceTemp - base.whiteBalanceTemp) * strength,
    whiteBalanceTint: base.whiteBalanceTint + (suggestion.whiteBalanceTint - base.whiteBalanceTint) * strength,
    saturation: base.saturation + (suggestion.saturation - base.saturation) * strength,
    vibrance: base.vibrance + (suggestion.vibrance - base.vibrance) * strength,
    sharpeningAmount: base.sharpeningAmount + (suggestion.sharpeningAmount - base.sharpeningAmount) * strength,
    noiseReduction: base.noiseReduction + (suggestion.noiseReduction - base.noiseReduction) * strength,
  };
}

function SceneTag({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span className="px-1.5 py-0.5 bg-purple-600/50 text-purple-200 text-[10px] rounded">
      {label}
    </span>
  );
}

export function EditPanel() {
  const { selectedFile, selectedEditState, updateEdit, setCropMode, cropMode, files } = useAppStore();
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [baseEdits, setBaseEdits] = useState<EditState | null>(null);
  const [aiStrength, setAiStrength] = useState(0.8);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  const file = selectedFile();
  const edits = selectedEditState();

  useEffect(() => {
    if (aiSuggestion && baseEdits && file) {
      const blended = blendEdits(baseEdits, aiSuggestion, aiStrength);
      updateEdit(file.id, blended);
    }
  }, [aiStrength, aiSuggestion, baseEdits, file, updateEdit]);

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
      setBaseEdits({ ...edits });
      const suggestion = await aiAnalyze(file.id);
      setAiSuggestion(suggestion);
    } catch (e) {
      console.error('AI analyze failed:', e);
    } finally {
      setIsAiProcessing(false);
    }
  }, [file, edits]);

  const handleAutoEdit = useCallback(async () => {
    if (!file) return;
    setIsAiProcessing(true);
    try {
      const newEdits = await aiAutoEnhance(file.id, 1.0);
      updateEdit(file.id, newEdits);
      setAiSuggestion(null);
      setBaseEdits(null);
      await saveEdits(file.id, { ...edits, ...newEdits });
    } catch (e) {
      console.error('Auto edit failed:', e);
    } finally {
      setIsAiProcessing(false);
    }
  }, [file, edits, updateEdit]);

  const handleBatchEnhance = useCallback(async () => {
    if (files.length === 0) return;
    setIsAiProcessing(true);
    setBatchProgress(`Processing 0/${files.length}...`);
    try {
      const fileIds = files.map(f => f.id);
      const results = await aiBatchEnhance(fileIds, aiStrength);
      const successCount = results.filter(r => r.success).length;
      setBatchProgress(`Done: ${successCount}/${files.length} enhanced`);
      
      for (const result of results) {
        if (result.success && result.newEdits) {
          updateEdit(result.fileId, result.newEdits);
        }
      }
      
      setTimeout(() => setBatchProgress(null), 3000);
    } catch (e) {
      console.error('Batch enhance failed:', e);
      setBatchProgress('Batch failed');
      setTimeout(() => setBatchProgress(null), 3000);
    } finally {
      setIsAiProcessing(false);
    }
  }, [files, aiStrength, updateEdit]);

  const handleApplySuggestion = useCallback(async () => {
    if (!file || !aiSuggestion || !baseEdits) return;
    const blended = blendEdits(baseEdits, aiSuggestion, aiStrength);
    const finalEdits = { ...edits, ...blended };
    setAiSuggestion(null);
    setBaseEdits(null);
    try {
      await saveEdits(file.id, finalEdits);
    } catch (e) {
      console.error('Save failed:', e);
    }
  }, [file, aiSuggestion, baseEdits, aiStrength, edits]);

  const handleResetAll = useCallback(async () => {
    if (!file) return;
    updateEdit(file.id, DEFAULT_EDIT_STATE);
    setAiSuggestion(null);
    setBaseEdits(null);
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
            onClick={handleApplySuggestion}
            disabled={isAiProcessing || !aiSuggestion}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
          >
            Apply
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
            disabled={!aiSuggestion}
          >
            <Slider.Track className={`relative grow rounded-full h-1 ${aiSuggestion ? 'bg-surface-700' : 'bg-surface-800'}`}>
              <Slider.Range className="absolute bg-purple-500 rounded-full h-full" />
            </Slider.Track>
            <Slider.Thumb className={`block w-3 h-3 bg-white rounded-full shadow ${!aiSuggestion ? 'opacity-50' : ''}`} />
          </Slider.Root>
        </div>

        {aiSuggestion && (
          <div className="mt-3 p-2 bg-surface-900/50 rounded text-xs">
            <div className="flex justify-between text-surface-400 mb-2">
              <span className="font-medium text-purple-300">{aiSuggestion.sceneType}</span>
              <span>{Math.round(aiSuggestion.confidence * 100)}%</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              <SceneTag label="Backlit" active={aiSuggestion.sceneDetails.isBacklit} />
              <SceneTag label="Sunset" active={aiSuggestion.sceneDetails.isSunset} />
              <SceneTag label="Portrait" active={aiSuggestion.sceneDetails.isPortrait} />
              <SceneTag label="Landscape" active={aiSuggestion.sceneDetails.isLandscape} />
              <SceneTag label="Macro" active={aiSuggestion.sceneDetails.isMacro} />
              <SceneTag label="Night" active={aiSuggestion.sceneDetails.isNight} />
              <SceneTag label="High ISO" active={aiSuggestion.sceneDetails.isHighIso} />
            </div>
            <div className="text-surface-500 text-[10px] grid grid-cols-2 gap-x-2 gap-y-0.5">
              <div>Exp: {aiSuggestion.exposure.toFixed(2)} EV</div>
              <div>Contrast: {aiSuggestion.contrast.toFixed(0)}</div>
              <div>Highlights: {aiSuggestion.highlights.toFixed(0)}</div>
              <div>Shadows: {aiSuggestion.shadows.toFixed(0)}</div>
              <div>Temp: {aiSuggestion.whiteBalanceTemp.toFixed(0)}K</div>
              <div>NR: {aiSuggestion.noiseReduction.toFixed(0)}</div>
            </div>
            {aiSuggestion.sceneDetails.colorCast !== 'neutral' && (
              <div className="mt-1 text-[10px] text-yellow-400">
                Color cast: {aiSuggestion.sceneDetails.colorCast}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleBatchEnhance}
          disabled={isAiProcessing || files.length === 0}
          className="w-full mt-2 px-3 py-2 bg-purple-700/50 hover:bg-purple-700/70 disabled:bg-purple-900/30 disabled:opacity-50 text-purple-200 text-xs font-medium rounded transition-colors"
        >
          {batchProgress || `Batch Enhance All (${files.length})`}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleAutoEdit}
          disabled={isAiProcessing}
          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white text-sm font-medium rounded transition-colors"
        >
          {isAiProcessing ? 'Processing...' : 'Auto Edit'}
        </button>
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

      <SliderControl
        label="Highlights"
        value={edits.highlights}
        defaultValue={DEFAULT_EDIT_STATE.highlights}
        min={-100}
        max={100}
        onChange={(v) => handleChange('highlights', v)}
      />

      <SliderControl
        label="Shadows"
        value={edits.shadows}
        defaultValue={DEFAULT_EDIT_STATE.shadows}
        min={-100}
        max={100}
        onChange={(v) => handleChange('shadows', v)}
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

      <SliderControl
        label="Noise Reduction"
        value={edits.noiseReduction}
        defaultValue={DEFAULT_EDIT_STATE.noiseReduction}
        min={0}
        max={100}
        onChange={(v) => handleChange('noiseReduction', v)}
      />
    </div>
  );
}
