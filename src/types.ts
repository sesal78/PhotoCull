export interface ImageFile {
  id: string;
  path: string;
  filename: string;
  extension: string;
  fileSize: number;
  modifiedAt: string;
  isRaw: boolean;
  dimensions: { width: number; height: number } | null;
}

export interface CropRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type Flag = 'none' | 'pick' | 'reject';

export interface EditState {
  rating: number;
  flag: Flag;
  crop: CropRect | null;
  straightenAngle: number;
  rotation: 0 | 90 | 180 | 270;
  exposure: number;
  contrast: number;
  whiteBalanceTemp: number;
  whiteBalanceTint: number;
  saturation: number;
  vibrance: number;
  sharpeningAmount: number;
  sharpeningRadius: number;
}

export const DEFAULT_EDIT_STATE: EditState = {
  rating: 0,
  flag: 'none',
  crop: null,
  straightenAngle: 0,
  rotation: 0,
  exposure: 0,
  contrast: 0,
  whiteBalanceTemp: 5500,
  whiteBalanceTint: 0,
  saturation: 0,
  vibrance: 0,
  sharpeningAmount: 0,
  sharpeningRadius: 1.0,
};

export interface ExportOptions {
  format: 'jpeg' | 'png';
  quality: number;
  resizeMode: 'original' | 'long_edge' | 'short_edge';
  resizeValue: number | null;
}

export interface FolderContents {
  path: string;
  files: ImageFile[];
  editStates: Record<string, EditState>;
  thumbnailDir: string;
}

export interface ExportResult {
  success: boolean;
  sourceId: string;
  destinationPath: string | null;
  error: string | null;
}

export interface ImageMetadata {
  width: number;
  height: number;
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  focalLength: number | null;
  aperture: number | null;
  shutterSpeed: string | null;
  iso: number | null;
  dateTaken: string | null;
}
