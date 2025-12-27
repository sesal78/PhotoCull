use std::collections::HashMap;
use std::fs;
use std::path::Path;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::models::{ImageFile, EditState, ImageFile as IF};

pub fn scan_directory(path: &Path) -> Result<Vec<ImageFile>, String> {
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut files = Vec::new();

    for entry in WalkDir::new(path).max_depth(1).into_iter().filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }

        let extension = match entry_path.extension() {
            Some(ext) => ext.to_string_lossy().to_string(),
            None => continue,
        };

        if !IF::is_supported_extension(&extension) {
            continue;
        }

        let metadata = match fs::metadata(entry_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| DateTime::<Utc>::from(t).to_rfc3339().parse().ok())
            .unwrap_or_else(|| Utc::now().to_rfc3339());

        let filename = entry_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        files.push(ImageFile {
            id: Uuid::new_v4().to_string(),
            path: entry_path.to_string_lossy().to_string(),
            filename,
            extension: extension.to_lowercase(),
            file_size: metadata.len(),
            modified_at,
            is_raw: IF::is_raw_extension(&extension),
            dimensions: None,
        });
    }

    files.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(files)
}

pub fn load_sidecars(files: &[ImageFile]) -> HashMap<String, EditState> {
    let mut states = HashMap::new();

    for file in files {
        let xmp_path = get_xmp_path(&file.path);
        if let Ok(content) = fs::read_to_string(&xmp_path) {
            if let Ok(edit_state) = crate::services::xmp::parse_xmp(&content) {
                states.insert(file.id.clone(), edit_state);
            }
        }
    }

    states
}

pub fn get_xmp_path(image_path: &str) -> String {
    let path = Path::new(image_path);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let parent = path.parent().unwrap_or(Path::new("."));
    parent.join(format!("{}.xmp", stem)).to_string_lossy().to_string()
}

pub fn get_cache_dir() -> std::path::PathBuf {
    std::env::var("PHOTOCULL_CACHE_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::cache_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("photocull")
        })
}

pub fn get_thumbnail_dir() -> std::path::PathBuf {
    get_cache_dir().join("thumbnails")
}
