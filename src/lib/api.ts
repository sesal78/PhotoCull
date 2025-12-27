import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { EditState, FolderContents, ExportOptions, ExportResult } from '../types';

export async function openFolderDialog(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Photo Folder',
  });
  return selected as string | null;
}

export async function selectExportFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Export Destination',
  });
  return selected as string | null;
}

export async function openFolder(path: string): Promise<FolderContents> {
  return invoke<FolderContents>('open_folder', { path });
}

export async function getThumbnail(fileId: string): Promise<string> {
  return invoke<string>('get_thumbnail', { fileId });
}

export async function getPreview(
  fileId: string,
  edits: EditState,
  maxSize: number
): Promise<number[]> {
  return invoke<number[]>('get_preview', { fileId, edits, maxSize });
}

export async function saveEdits(fileId: string, edits: EditState): Promise<void> {
  return invoke('save_edits', { fileId, edits });
}

export async function setRating(fileId: string, rating: number): Promise<void> {
  return invoke('set_rating', { fileId, rating });
}

export async function setFlag(fileId: string, flag: string): Promise<void> {
  return invoke('set_flag', { fileId, flag });
}

export async function exportImages(
  fileIds: string[],
  destination: string,
  options: ExportOptions
): Promise<ExportResult[]> {
  return invoke<ExportResult[]>('export_images', { fileIds, destination, options });
}

export interface SceneDetails {
  isBacklit: boolean;
  isSunset: boolean;
  isPortrait: boolean;
  isMacro: boolean;
  isLandscape: boolean;
  isNight: boolean;
  isHighIso: boolean;
  colorCast: string;
  dynamicRange: string;
}

export interface AiSuggestion {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whiteBalanceTemp: number;
  whiteBalanceTint: number;
  saturation: number;
  vibrance: number;
  sharpeningAmount: number;
  noiseReduction: number;
  confidence: number;
  sceneType: string;
  sceneDetails: SceneDetails;
}

export interface BatchAiResult {
  fileId: string;
  success: boolean;
  suggestion: AiSuggestion | null;
  newEdits: EditState | null;
  error: string | null;
}

export async function aiAnalyze(fileId: string): Promise<AiSuggestion> {
  return invoke<AiSuggestion>('ai_analyze', { fileId });
}

export async function aiAutoEnhance(fileId: string, strength: number): Promise<EditState> {
  return invoke<EditState>('ai_auto_enhance', { fileId, strength });
}

export async function aiBatchAnalyze(fileIds: string[]): Promise<BatchAiResult[]> {
  return invoke<BatchAiResult[]>('ai_batch_analyze', { fileIds });
}

export async function aiBatchEnhance(fileIds: string[], strength: number): Promise<BatchAiResult[]> {
  return invoke<BatchAiResult[]>('ai_batch_enhance', { fileIds, strength });
}

export async function initAi(): Promise<void> {
  return invoke('init_ai');
}
