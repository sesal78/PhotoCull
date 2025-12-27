# PhotoCull Security Review

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md, API_CONTRACTS.md
- Breaking Changes: No

---

## 1. Threat Model

### 1.1 System Context

PhotoCull is a **local-only, single-user desktop application** with:
- No network communication
- No user accounts or authentication
- No cloud storage
- No external API integrations
- File access limited to user-selected directories

### 1.2 Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    PhotoCull Process                     │
│  ┌──────────────┐    IPC     ┌──────────────────────┐  │
│  │   Frontend   │◄──────────►│    Rust Backend      │  │
│  │   (WebView)  │            │    (Tauri Core)      │  │
│  └──────────────┘            └──────────────────────┘  │
│                                       │                 │
│                                       ▼                 │
│                              ┌──────────────────┐       │
│                              │  User-Selected   │       │
│                              │  Directories     │       │
│                              └──────────────────┘       │
└─────────────────────────────────────────────────────────┘
                                       │
                         ══════════════╪════════════════
                         Filesystem    │  Trust Boundary
                                       ▼
                              ┌──────────────────┐
                              │  Local Files     │
                              │  (Photos, XMP)   │
                              └──────────────────┘
```

### 1.3 Assets

| Asset | Sensitivity | Risk |
|-------|-------------|------|
| User photos | High (personal) | Privacy breach if exposed |
| XMP sidecars | Low | Metadata only, no sensitive data |
| Thumbnail cache | Medium | Derived from photos |
| Application config | Low | Preferences only |

---

## 2. Authentication & Authorization Review

### 2.1 Assessment

| Control | Status | Notes |
|---------|--------|-------|
| User authentication | **N/A** | Single-user local app |
| Session management | **N/A** | No sessions |
| Role-based access | **N/A** | No roles |
| API authentication | **N/A** | No external APIs |

### 2.2 Tauri IPC Security

Tauri's IPC is process-local only. Commands are not exposed to network.

**Recommendation:** Use Tauri's `allowlist` to restrict commands to only those needed.

```json
// tauri.conf.json
{
  "tauri": {
    "allowlist": {
      "all": false,
      "dialog": {
        "open": true,
        "save": false
      },
      "fs": {
        "scope": ["$DOCUMENT/**", "$PICTURE/**", "$HOME/**"]
      },
      "path": {
        "all": true
      }
    }
  }
}
```

---

## 3. Input Validation Risks

### 3.1 Attack Surface

| Input | Source | Validation Required |
|-------|--------|---------------------|
| Folder path | User via dialog | Path traversal prevention |
| Image files | Filesystem | Magic bytes verification, size limits |
| XMP files | Filesystem | XML parsing with limits |
| Edit parameters | Frontend UI | Range clamping |

### 3.2 Mitigations

**Path Traversal:**
```rust
// REQUIRED: Validate paths stay within user-selected directory
fn validate_path(base: &Path, requested: &Path) -> Result<PathBuf, Error> {
    let canonical = requested.canonicalize()?;
    if !canonical.starts_with(base.canonicalize()?) {
        return Err(Error::PathTraversal);
    }
    Ok(canonical)
}
```

**Image File Validation:**
```rust
// REQUIRED: Verify file magic bytes before processing
fn validate_image_file(path: &Path) -> Result<(), Error> {
    let mut file = File::open(path)?;
    let mut magic = [0u8; 16];
    file.read_exact(&mut magic)?;
    
    // Check known magic bytes for supported formats
    if !is_known_image_magic(&magic) {
        return Err(Error::UnsupportedFormat);
    }
    
    // Limit file size (e.g., 500MB for RAW)
    if file.metadata()?.len() > 500 * 1024 * 1024 {
        return Err(Error::FileTooLarge);
    }
    Ok(())
}
```

**XML/XMP Parsing:**
```rust
// REQUIRED: Use safe XML parser with entity limits
use quick_xml::Reader;

fn parse_xmp(content: &str) -> Result<EditState, Error> {
    // quick-xml has no external entity support by default (safe)
    // Limit content size
    if content.len() > 1024 * 1024 {  // 1MB max
        return Err(Error::XmpTooLarge);
    }
    // Parse...
}
```

**Edit Parameter Clamping:**
```rust
impl EditState {
    pub fn validate(&mut self) {
        self.rating = self.rating.clamp(0, 5);
        self.exposure = self.exposure.clamp(-5.0, 5.0);
        self.contrast = self.contrast.clamp(-100.0, 100.0);
        // ... all parameters
    }
}
```

---

## 4. Data Exposure Risks

### 4.1 Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Photos exposed to other apps | Low | OS-level (not our concern) |
| Thumbnail cache in temp dir | Low | Use user-specific cache dir |
| XMP contains original path | Low | Expected behavior |
| Memory contains decoded images | Low | Normal operation; cleared on close |

### 4.2 Recommendations

1. **Thumbnail cache location:** Use OS-specific user cache directory, not system temp.
   ```rust
   let cache_dir = dirs::cache_dir()
       .unwrap_or_else(|| PathBuf::from("."))
       .join("photocull")
       .join("thumbnails");
   ```

2. **No logging of file paths in release builds:** Avoid leaking filesystem structure.

---

## 5. Integration & Webhook Security

### 5.1 Assessment

**Agent: SKIPPED — No external integrations or webhooks exist.**

PhotoCull is entirely offline with no:
- Network calls
- Webhook endpoints
- Third-party API integrations
- Telemetry or analytics

---

## 6. Dependency Security

### 6.1 Rust Dependencies

| Crate | Purpose | Risk Assessment |
|-------|---------|-----------------|
| tauri | Framework | Well-audited, active security team |
| libraw-rs | RAW decode | Wraps LibRaw (C++); memory safety concerns |
| image | Image processing | Pure Rust, memory-safe |
| quick-xml | XMP parsing | No XXE support (safe by default) |
| serde | Serialization | Well-audited |

### 6.2 LibRaw Considerations

LibRaw is a C++ library. Potential risks:
- Buffer overflows in RAW parsing
- Memory corruption from malformed files

**Mitigations:**
1. Keep LibRaw updated (CVE monitoring)
2. Validate file magic before passing to LibRaw
3. Run decode in separate thread (crash isolation)
4. Consider WASM sandbox for decode (v2)

### 6.3 Recommendations

```toml
# Cargo.toml - use cargo-audit in CI
[package.metadata.scripts]
audit = "cargo audit"
```

---

## 7. Recommended Mitigations Summary

| Finding | Severity | Mitigation | Status |
|---------|----------|------------|--------|
| Path traversal possible | Medium | Canonicalize and validate paths | **Required** |
| Malformed image files | Medium | Magic byte + size validation | **Required** |
| XMP XXE attack | Low | Use quick-xml (safe default) | **Implemented** |
| LibRaw memory safety | Medium | Update regularly, file validation | **Required** |
| Edit parameter overflow | Low | Clamp all values | **Required** |
| Cache in shared temp | Low | Use user-specific cache dir | **Recommended** |

---

## 8. Residual Risks Accepted for MVP

| Risk | Justification |
|------|---------------|
| LibRaw vulnerability in exotic RAW | Low probability; single-user context; monitoring CVEs |
| Local file access by other apps | OS-level concern; not PhotoCull's responsibility |
| No code signing (initial builds) | MVP limitation; implement before distribution |

---

## 9. Security Checklist

- [ ] Path validation implemented
- [ ] File magic byte validation
- [ ] XMP size limits
- [ ] Edit parameter clamping
- [ ] Cargo audit in build process
- [ ] Tauri allowlist configured
- [ ] No network permissions
- [ ] Cache in user directory

---

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md, API_CONTRACTS.md
- Breaking Changes: No
