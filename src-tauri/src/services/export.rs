use image::codecs::jpeg::JpegEncoder;
use std::fs;
use std::io::Cursor;
use std::path::Path;

use crate::models::{EditState, ExportOptions, ExportResult};
use crate::services::image_processor::{apply_edits, resize_to_fit, rotate_image};
use crate::services::thumbnail::load_image;

pub fn export_image(
    image_path: &str,
    file_id: &str,
    destination: &str,
    edits: &EditState,
    options: &ExportOptions,
) -> ExportResult {
    let source_path = Path::new(image_path);
    let filename = source_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_id.to_string());

    let ext = match options.format.as_str() {
        "png" => "png",
        _ => "jpg",
    };
    let dest_path = Path::new(destination).join(format!("{}.{}", filename, ext));

    match do_export(image_path, &dest_path, edits, options) {
        Ok(_) => ExportResult {
            success: true,
            source_id: file_id.to_string(),
            destination_path: Some(dest_path.to_string_lossy().to_string()),
            error: None,
        },
        Err(e) => ExportResult {
            success: false,
            source_id: file_id.to_string(),
            destination_path: None,
            error: Some(e),
        },
    }
}

fn do_export(
    image_path: &str,
    dest_path: &Path,
    edits: &EditState,
    options: &ExportOptions,
) -> Result<(), String> {
    let img = load_image(image_path)?;

    let mut processed = apply_edits(img, edits);

    if edits.rotation != 0 {
        processed = rotate_image(processed, edits.rotation);
    }

    if let Some(resize_val) = options.resize_value {
        processed = resize_to_fit(processed, resize_val);
    }

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
    }

    match options.format.as_str() {
        "png" => {
            processed
                .save(dest_path)
                .map_err(|e| format!("Save failed: {}", e))?;
        }
        _ => {
            let rgb = processed.to_rgb8();
            let mut buffer = Cursor::new(Vec::new());
            let encoder = JpegEncoder::new_with_quality(&mut buffer, options.quality);
            rgb.write_with_encoder(encoder)
                .map_err(|e| format!("Encode failed: {}", e))?;
            fs::write(dest_path, buffer.into_inner())
                .map_err(|e| format!("Write failed: {}", e))?;
        }
    }

    Ok(())
}
