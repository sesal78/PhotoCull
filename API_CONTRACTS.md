# PhotoCull API Contracts

Internal Tauri command contracts between frontend and Rust backend.

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md
- Breaking Changes: No

---

## Overview

PhotoCull uses Tauri's IPC system. Frontend invokes Rust commands via `invoke()`.
All commands are async and return `Result<T, String>` (error as string message).

---

## Data Types

### ImageFile

```typescript
interface ImageFile {
  id: string;              // UUID
  path: string;            // Absolute path
  filename: string;        // Just the filename
  extension: string;       // Lowercase, no dot
  fileSize: number;        // Bytes
  modifiedAt: string;      // ISO 8601
  isRaw: boolean;
  dimensions: {
    width: number;
    height: number;
  } | null;                // null until loaded
}
```

### EditState

```typescript
interface EditState {
  // Rating & Culling
  rating: number;          // 0-5
  flag: 'none' | 'pick' | 'reject';
  
  // Geometry
  crop: CropRect | null;
  straightenAngle: number; // -45.0 to +45.0
  rotation: 0 | 90 | 180 | 270;
  
  // Tone
  exposure: number;        // -5.0 to +5.0
  contrast: number;        // -100 to +100
  
  // Color
  whiteBalanceTemp: number;  // 2000 to 50000
  whiteBalanceTint: number;  // -150 to +150
  saturation: number;        // -100 to +100
  vibrance: number;          // -100 to +100
  
  // Detail
  sharpeningAmount: number;  // 0 to 150
  sharpeningRadius: number;  // 0.5 to 3.0
}
```

### CropRect

```typescript
interface CropRect {
  top: number;    // 0.0 to 1.0 (normalized)
  left: number;
  bottom: number;
  right: number;
}
```

### ExportOptions

```typescript
interface ExportOptions {
  format: 'jpeg' | 'png';
  quality: number;         // 1-100 (JPEG only)
  resizeMode: 'original' | 'long_edge' | 'short_edge';
  resizeValue: number | null;  // pixels, if resizeMode != 'original'
}
```

### FolderContents

```typescript
interface FolderContents {
  path: string;
  files: ImageFile[];
  editStates: Record<string, EditState>;  // keyed by file id
  thumbnailDir: string;
}
```

### ExportResult

```typescript
interface ExportResult {
  success: boolean;
  sourceId: string;
  destinationPath: string | null;
  error: string | null;
}
```

---

## Commands

### open_folder

Scan a directory for supported image files.

**Signature:**
```rust
#[tauri::command]
async fn open_folder(path: String) -> Result<FolderContents, String>
```

**Frontend:**
```typescript
const contents = await invoke<FolderContents>('open_folder', { path: '/photos/trip' });
```

**Behavior:**
1. Validates path exists and is directory
2. Scans for supported extensions (non-recursive)
3. Generates thumbnails in background
4. Loads existing XMP sidecars
5. Returns file list with edit states

**Errors:**
- `"Path does not exist"` - Invalid path
- `"Path is not a directory"` - File instead of directory
- `"Permission denied"` - Cannot read directory

---

### get_thumbnail

Get path to cached thumbnail for an image.

**Signature:**
```rust
#[tauri::command]
async fn get_thumbnail(file_id: String) -> Result<String, String>
```

**Frontend:**
```typescript
const thumbPath = await invoke<string>('get_thumbnail', { fileId: 'abc-123' });
```

**Behavior:**
1. Returns cached thumbnail path if exists
2. Generates thumbnail if not cached
3. Thumbnail size: 256px on long edge

**Errors:**
- `"File not found"` - Unknown file ID
- `"Thumbnail generation failed"` - RAW decode or processing error

---

### get_preview

Get processed preview image with current edits applied.

**Signature:**
```rust
#[tauri::command]
async fn get_preview(
    file_id: String,
    edits: EditState,
    max_size: u32
) -> Result<Vec<u8>, String>
```

**Frontend:**
```typescript
const imageBytes = await invoke<number[]>('get_preview', {
  fileId: 'abc-123',
  edits: currentEdits,
  maxSize: 2048
});
const blob = new Blob([new Uint8Array(imageBytes)], { type: 'image/jpeg' });
```

**Behavior:**
1. Decodes source image (RAW or standard)
2. Applies edit pipeline in order
3. Resizes to fit within maxSize
4. Returns JPEG bytes

**Errors:**
- `"File not found"` - Unknown file ID
- `"Decode failed"` - Cannot read source file
- `"Processing failed"` - Edit pipeline error

---

### save_edits

Save edit state to XMP sidecar.

**Signature:**
```rust
#[tauri::command]
async fn save_edits(file_id: String, edits: EditState) -> Result<(), String>
```

**Frontend:**
```typescript
await invoke('save_edits', { fileId: 'abc-123', edits: currentEdits });
```

**Behavior:**
1. Reads existing XMP if present
2. Merges edit state
3. Writes XMP sidecar to `{original_path}/{filename}.xmp`

**Errors:**
- `"File not found"` - Unknown file ID
- `"Write failed"` - Cannot write sidecar (permissions)

---

### export_images

Export selected images with edits baked in.

**Signature:**
```rust
#[tauri::command]
async fn export_images(
    file_ids: Vec<String>,
    destination: String,
    options: ExportOptions
) -> Result<Vec<ExportResult>, String>
```

**Frontend:**
```typescript
const results = await invoke<ExportResult[]>('export_images', {
  fileIds: ['abc-123', 'def-456'],
  destination: '/photos/export',
  options: { format: 'jpeg', quality: 90, resizeMode: 'original', resizeValue: null }
});
```

**Behavior:**
1. For each image:
   - Decode full resolution source
   - Apply edit pipeline
   - Resize if specified
   - Encode to output format
   - Save to destination with original filename

**Errors:**
- `"Destination does not exist"` - Invalid destination path
- Individual file errors reported in ExportResult

---

### get_image_metadata

Get EXIF and other metadata from image.

**Signature:**
```rust
#[tauri::command]
async fn get_image_metadata(file_id: String) -> Result<ImageMetadata, String>
```

**Response:**
```typescript
interface ImageMetadata {
  width: number;
  height: number;
  cameraMake: string | null;
  cameraModel: string | null;
  lens: string | null;
  focalLength: number | null;    // mm
  aperture: number | null;       // f-number
  shutterSpeed: string | null;   // "1/250"
  iso: number | null;
  dateTaken: string | null;      // ISO 8601
}
```

---

### set_rating

Quick command to set rating only.

**Signature:**
```rust
#[tauri::command]
async fn set_rating(file_id: String, rating: u8) -> Result<(), String>
```

---

### set_flag

Quick command to set pick/reject flag only.

**Signature:**
```rust
#[tauri::command]
async fn set_flag(file_id: String, flag: String) -> Result<(), String>
```

**Flag values:** `"none"`, `"pick"`, `"reject"`

---

### select_folder_dialog

Open native folder picker dialog.

**Signature:**
```rust
#[tauri::command]
async fn select_folder_dialog(title: String) -> Result<Option<String>, String>
```

**Frontend:**
```typescript
const folder = await invoke<string | null>('select_folder_dialog', {
  title: 'Select Export Destination'
});
if (folder) {
  // User selected a folder
}
```

---

## Events (Backend → Frontend)

Tauri events emitted by backend for async operations.

### thumbnail_ready

Emitted when a thumbnail finishes generating.

```typescript
interface ThumbnailReadyPayload {
  fileId: string;
  thumbnailPath: string;
}

listen<ThumbnailReadyPayload>('thumbnail_ready', (event) => {
  updateThumbnail(event.payload.fileId, event.payload.thumbnailPath);
});
```

### export_progress

Emitted during export for progress tracking.

```typescript
interface ExportProgressPayload {
  completed: number;
  total: number;
  currentFile: string;
}

listen<ExportProgressPayload>('export_progress', (event) => {
  setProgress(event.payload.completed / event.payload.total);
});
```

---

## Error Handling

All commands return `Result<T, String>`. Frontend should:

1. Catch errors with try/catch
2. Display user-friendly message
3. Log full error for debugging

```typescript
try {
  const result = await invoke('open_folder', { path });
} catch (error) {
  console.error('open_folder failed:', error);
  showToast(`Failed to open folder: ${error}`);
}
```

---

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md
- Breaking Changes: No
