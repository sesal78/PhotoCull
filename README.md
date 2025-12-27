# PhotoCull

Fast, local photo culling and light editing without the bloat.

## Metadata
- Version: 1.0
- Last Updated: 2025-01-27
- Depends On: ARCHITECTURE.md
- Breaking Changes: No

---

## Features

- **Fast culling**: Rating (1-5), Pick/Reject flags, keyboard-driven
- **Light editing**: Exposure, contrast, white balance, saturation, vibrance, sharpening
- **Geometry**: Crop, straighten, rotate
- **RAW support**: CR2, CR3, NEF, ARW, RAF, ORF, DNG, and 15+ more formats
- **Non-destructive**: All edits saved to XMP sidecars (Adobe-compatible)
- **Export**: Render edited images to destination folder

---

## Prerequisites

- **Rust** 1.75+ (https://rustup.rs)
- **Node.js** 20+ (https://nodejs.org)
- **pnpm** 8+ (`npm install -g pnpm`)
- **LibRaw** development libraries:
  - Windows: Included via vcpkg (auto-downloaded)
  - macOS: `brew install libraw`
  - Linux: `sudo apt install libraw-dev`

---

## Setup

```bash
# Clone and enter directory
cd PhotoCull

# Install frontend dependencies
pnpm install

# Install Rust dependencies (first run compiles LibRaw bindings)
cd src-tauri && cargo build && cd ..

# Run in development mode
pnpm tauri dev
```

---

## Build for Production

```bash
# Create optimized release build
pnpm tauri build

# Output location:
# Windows: src-tauri/target/release/bundle/msi/
# macOS: src-tauri/target/release/bundle/dmg/
# Linux: src-tauri/target/release/bundle/deb/
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PHOTOCULL_CACHE_DIR` | No | OS temp dir | Thumbnail cache location |
| `PHOTOCULL_LOG_LEVEL` | No | `info` | Logging verbosity: error, warn, info, debug, trace |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next image |
| `1-5` | Set rating |
| `P` | Pick flag |
| `X` | Reject flag |
| `U` | Unflag |
| `R` | Rotate CW 90° |
| `Shift+R` | Rotate CCW 90° |
| `C` | Enter crop mode |
| `Enter` | Confirm crop |
| `Esc` | Cancel / Exit mode |
| `Space` | Toggle zoom |
| `Ctrl+E` | Export selected |
| `Ctrl+O` | Open folder |

---

## Project Structure

```
PhotoCull/
├── src-tauri/        # Rust backend (Tauri)
├── src/              # React frontend
├── package.json
└── README.md
```

---

## License

MIT
