# PhotoCull QA - Failure Mode Analysis

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md, API_CONTRACTS.md, SECURITY_REVIEW.md
- Breaking Changes: No

---

## Failure Mode Table

| # | Failure | Severity | Test Case | Mitigation |
|---|---------|----------|-----------|------------|
| 1 | **RAW decode fails for unsupported camera** | High | Open folder with Hasselblad X2D RAF file (exotic) | Graceful fallback: extract embedded JPEG preview; show warning icon; log camera model |
| 2 | **Corrupted image file crashes app** | Critical | Feed truncated/malformed CR2 file | Validate magic bytes; wrap LibRaw in panic catch; isolate decode in thread |
| 3 | **XMP sidecar write fails (disk full)** | High | Fill disk to 99%, make edit | Check disk space before write; queue pending saves; show persistent warning |
| 4 | **XMP sidecar write fails (permissions)** | High | Open folder on read-only mount | Pre-check write permission on folder open; disable editing if read-only |
| 5 | **Out of memory with large RAW files** | High | Open folder with 100+ 100MB RAW files | Lazy load: only decode visible + N ahead; limit concurrent full-res loads to 2 |
| 6 | **UI freezes during RAW decode** | Medium | Open 60MP RAW, wait for preview | All decode/process ops async in Rust thread; show loading spinner; cancel on navigate |
| 7 | **Thumbnail generation blocks folder open** | Medium | Open folder with 500 images | Return file list immediately; generate thumbnails in background; emit events as ready |
| 8 | **Export fails mid-batch** | Medium | Export 50 images, disk fills at image 30 | Atomic writes (temp then rename); continue on error; report per-file results |
| 9 | **XMP from other app has unknown fields** | Low | Import XMP with Lightroom-specific tags | Preserve unknown fields on read/write; only modify known fields |
| 10 | **User deletes source file while app open** | Medium | Delete currently-viewed image in Explorer | Watch for file changes; refresh state; show "File not found" placeholder |
| 11 | **Path with unicode characters fails** | Medium | Open folder: `D:\фото\日本旅行\` | Use Rust's native Path handling (UTF-8 safe); test with various encodings |
| 12 | **Very long file path (>260 chars on Windows)** | Medium | Create deeply nested folder structure | Use `\\?\` prefix on Windows; warn if path too long for XMP sidecar |
| 13 | **Crop coordinates outside valid range** | Low | Programmatically set crop.left = 1.5 | Clamp all crop values to 0.0-1.0; validate before apply |
| 14 | **Concurrent edits to same XMP** | Low | (Edge case) Two instances edit same file | File locking on XMP write; warn if lock fails |
| 15 | **Export to folder without write permission** | Medium | Select system folder as destination | Verify write permission before export; fail fast with clear error |

---

## Test Scenarios

### TC-1: Unsupported RAW Format

**Steps:**
1. Create test folder with exotic RAW (e.g., Phase One IIQ)
2. Open folder in PhotoCull
3. Select the exotic file

**Expected:**
- Thumbnail shows embedded JPEG or placeholder
- Warning indicator on thumbnail
- Preview shows embedded JPEG with banner "Full RAW decode unavailable"
- Edits still work on embedded preview

---

### TC-2: Corrupted Image File

**Steps:**
1. Create CR2 file with random bytes after header
2. Open folder containing file
3. Select corrupted file

**Expected:**
- App does not crash
- Error message displayed: "Cannot read image"
- Other images in folder still accessible
- Error logged with file path

---

### TC-3: Disk Full During XMP Save

**Steps:**
1. Create RAM disk with 1MB free
2. Open folder on RAM disk with large image
3. Make edit (triggers XMP save)

**Expected:**
- Save fails gracefully
- Warning shown: "Cannot save edits - disk full"
- Edit state retained in memory
- Retry when space available

---

### TC-4: Read-Only Folder

**Steps:**
1. Open folder with read-only attribute
2. Attempt to make edit
3. Attempt to rate/flag

**Expected:**
- Warning on folder open: "Read-only folder - edits cannot be saved"
- Edit controls disabled OR edits work but with "Unsaved" indicator
- Export to different folder still works

---

### TC-5: Memory Stress Test

**Steps:**
1. Open folder with 200 x 50MB RAW files
2. Rapidly navigate through images (hold arrow key)
3. Monitor memory usage

**Expected:**
- Memory stays below 2GB
- Old decoded images evicted from cache
- No crash or freeze
- Navigation remains responsive

---

### TC-6: Export Partial Failure

**Steps:**
1. Select 10 images for export
2. Make image #5 read-only at destination
3. Start export

**Expected:**
- Images 1-4 export successfully
- Image 5 fails with clear error
- Images 6-10 continue exporting
- Final report shows 9 success, 1 failure with reason

---

### TC-7: Unicode Paths

**Steps:**
1. Create folder: `D:\Фотографии\日本\émoji🎉\`
2. Copy test images into folder
3. Open folder in PhotoCull
4. Make edits, export

**Expected:**
- Folder opens successfully
- Thumbnails generate
- XMP saves with correct path
- Export works

---

### TC-8: Concurrent XMP Access

**Steps:**
1. Open same folder in two PhotoCull instances
2. Edit same image in both
3. Save in instance A, then instance B

**Expected:**
- Instance B detects file changed externally
- Prompt: "XMP modified externally. Reload or overwrite?"
- No data corruption

---

## Severity Definitions

| Level | Definition | Response |
|-------|------------|----------|
| **Critical** | App crash, data loss | Must fix before release |
| **High** | Major feature broken, no workaround | Must fix before release |
| **Medium** | Feature degraded, workaround exists | Fix in MVP if time permits |
| **Low** | Minor issue, edge case | Track for v2 |

---

## Design Flaws Identified

| Issue | Recommendation | Logged |
|-------|----------------|--------|
| No explicit error handling strategy defined | Add error handling module with typed errors | LESSONS.md |
| No file watcher specified in architecture | Add optional file watcher for external changes | LESSONS.md |

---

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md, API_CONTRACTS.md, SECURITY_REVIEW.md
- Breaking Changes: No
