# PhotoCull Monitoring & Observability

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md, QA_FAILURE_MODES.md
- Breaking Changes: No

---

## 1. Overview

PhotoCull is a **local desktop application**. Traditional server monitoring (APM, distributed tracing) does not apply. Instead, focus on:

- Structured local logging
- Performance metrics (for debugging)
- Health indicators (UI responsiveness)
- Crash reporting (opt-in)

---

## 2. Logging Strategy

### 2.1 Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Failures requiring attention | "Failed to decode RAW: path=/photos/IMG_001.CR2 error=unsupported" |
| `warn` | Recoverable issues | "XMP parse warning: unknown field 'crs:CustomField'" |
| `info` | Key operations | "Folder opened: path=/photos count=150" |
| `debug` | Detailed flow | "Thumbnail generated: id=abc-123 ms=45" |
| `trace` | Verbose debugging | "Decode step: demosaic complete, applying WB" |

### 2.2 Log Format

```
2025-01-27T14:30:00.123Z [INFO] photocull::services::filesystem: Folder opened path="/photos/trip" file_count=150
2025-01-27T14:30:00.456Z [DEBUG] photocull::services::thumbnail: Generated id="abc-123" width=256 height=171 duration_ms=45
2025-01-27T14:30:01.789Z [ERROR] photocull::services::raw_decoder: Decode failed path="/photos/IMG_001.CR2" error="Unknown camera model: FujiFilm X-H99"
```

### 2.3 Implementation

```rust
// src-tauri/src/main.rs
use tracing::{info, warn, error, debug, trace};
use tracing_subscriber::{fmt, EnvFilter};

fn setup_logging() {
    let filter = EnvFilter::try_from_env("PHOTOCULL_LOG_LEVEL")
        .unwrap_or_else(|_| EnvFilter::new("info"));
    
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        .init();
}
```

### 2.4 Log File Location

| OS | Path |
|----|------|
| Windows | `%APPDATA%\PhotoCull\logs\photocull.log` |
| macOS | `~/Library/Logs/PhotoCull/photocull.log` |
| Linux | `~/.local/share/photocull/logs/photocull.log` |

**Rotation:** Keep last 5 files, 10MB each.

---

## 3. Key Metrics

### 3.1 Performance Metrics (Debug Mode)

| Metric | Description | Target |
|--------|-------------|--------|
| `folder_open_duration_ms` | Time to scan folder and return file list | < 500ms for 500 files |
| `thumbnail_generation_ms` | Time to generate single thumbnail | < 100ms avg |
| `raw_decode_ms` | Time to decode RAW to preview | < 2000ms for 50MP |
| `preview_render_ms` | Time to apply edits and render preview | < 200ms |
| `xmp_save_ms` | Time to write XMP sidecar | < 50ms |
| `export_single_ms` | Time to export one image | < 5000ms for full-res JPEG |
| `memory_usage_mb` | Current process memory | < 2048MB |

### 3.2 Collecting Metrics

```rust
use std::time::Instant;
use tracing::info;

async fn decode_raw(path: &Path) -> Result<Image> {
    let start = Instant::now();
    let result = do_decode(path).await;
    let duration = start.elapsed();
    
    info!(
        path = %path.display(),
        duration_ms = duration.as_millis(),
        "RAW decode complete"
    );
    
    result
}
```

### 3.3 Performance Dashboard (Dev Only)

Optional dev overlay showing:
- Current memory usage
- Decode queue length
- Thumbnail cache hit rate
- Last operation duration

Enabled via: `PHOTOCULL_DEV_OVERLAY=true`

---

## 4. Health Indicators

### 4.1 UI Responsiveness

| Indicator | Healthy | Degraded |
|-----------|---------|----------|
| Frame rate | 60 fps | < 30 fps |
| Input latency | < 50ms | > 200ms |
| Preview load | < 1s | > 3s |

### 4.2 Backend Health

| Indicator | Healthy | Degraded |
|-----------|---------|----------|
| Thumbnail queue | < 50 pending | > 200 pending |
| Memory usage | < 1.5GB | > 2GB |
| Decode errors | < 5% of files | > 20% of files |

### 4.3 Implementation

```typescript
// Frontend health check
const [health, setHealth] = useState<'healthy' | 'degraded'>('healthy');

useEffect(() => {
  const interval = setInterval(async () => {
    const memMb = await invoke<number>('get_memory_usage');
    const queueLen = await invoke<number>('get_thumbnail_queue_length');
    
    if (memMb > 2048 || queueLen > 200) {
      setHealth('degraded');
    } else {
      setHealth('healthy');
    }
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

---

## 5. Error Tracking

### 5.1 Local Error Log

All errors logged with:
- Timestamp
- Error type
- File path (if applicable)
- Stack trace (debug builds)
- System info (OS, memory)

### 5.2 Opt-In Crash Reporting (v2)

**Not in MVP.** Future consideration:
- Sentry or similar
- Requires user opt-in
- Strip file paths for privacy
- Include only: error type, stack trace, OS version

---

## 6. Diagnostics Command

Built-in diagnostic dump for support:

```
PhotoCull > Help > Export Diagnostics

Generates: photocull-diag-2025-01-27.zip
Contains:
  - system-info.json (OS, memory, CPU)
  - config.json (sanitized settings)
  - recent-logs.txt (last 1000 lines)
  - performance-stats.json (aggregated metrics)
```

**Privacy:** No file paths, no image data, no personal info.

---

## 7. Alerts (Desktop Notifications)

| Condition | Alert |
|-----------|-------|
| Export complete | "Exported 50 images to /photos/export" |
| Export failed | "Export failed: 3 images could not be saved" |
| Disk space low | "Warning: Less than 500MB free space" |
| Memory high | "PhotoCull is using high memory. Consider closing and reopening." |

---

## 8. MVP vs Future Observability

| Feature | MVP | v2 |
|---------|-----|-----|
| Structured logging | ✅ | ✅ |
| Log rotation | ✅ | ✅ |
| Performance metrics | ✅ (logs) | Dashboard |
| Memory monitoring | ✅ | Auto-cleanup |
| Crash reporting | ❌ | Opt-in Sentry |
| Usage analytics | ❌ | Opt-in telemetry |
| Remote diagnostics | ❌ | Support mode |

---

## 9. Log Retention

| Log Type | Retention |
|----------|-----------|
| Application logs | 7 days or 50MB |
| Crash dumps | 30 days |
| Diagnostic exports | User-managed |

---

## 10. Runbook: Common Issues

### High Memory Usage

**Symptoms:** App slow, system sluggish, >2GB memory
**Diagnosis:** Check log for decode queue, large file count
**Resolution:** 
1. Close and reopen app
2. Open smaller batches of files
3. Increase system RAM

### Slow Thumbnail Generation

**Symptoms:** Filmstrip shows placeholders for long time
**Diagnosis:** Check `thumbnail_generation_ms` in logs
**Resolution:**
1. Thumbnails are generated in order; wait
2. Check if source drive is slow (HDD vs SSD)
3. Large files take longer; expected

### RAW Decode Failures

**Symptoms:** "Cannot read image" errors
**Diagnosis:** Check log for camera model
**Resolution:**
1. Update PhotoCull (may add support)
2. Convert to DNG using Adobe DNG Converter
3. Use JPEG fallback

---

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md, QA_FAILURE_MODES.md
- Breaking Changes: No
