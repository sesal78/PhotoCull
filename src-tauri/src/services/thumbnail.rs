use image::DynamicImage;
use std::fs;
use std::path::Path;

use crate::services::filesystem::get_thumbnail_dir;

pub fn generate_thumbnail(image_path: &str, file_id: &str) -> Result<String, String> {
    let thumb_dir = get_thumbnail_dir();
    fs::create_dir_all(&thumb_dir).map_err(|e| format!("Create dir failed: {}", e))?;

    let thumb_path = thumb_dir.join(format!("{}.jpg", file_id));

    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    let img = load_image(image_path)?;
    let thumbnail = img.thumbnail(256, 256);

    thumbnail
        .save(&thumb_path)
        .map_err(|e| format!("Save thumbnail failed: {}", e))?;

    Ok(thumb_path.to_string_lossy().to_string())
}

pub fn load_image(path: &str) -> Result<DynamicImage, String> {
    let path = Path::new(path);
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if crate::models::ImageFile::is_raw_extension(&ext) {
        load_raw_image(path)
    } else {
        image::open(path).map_err(|e| format!("Failed to open image: {}", e))
    }
}

fn load_raw_image(path: &Path) -> Result<DynamicImage, String> {
    // For RAW files, try to extract embedded JPEG preview first
    // Full RAW decode would require libraw bindings
    // For MVP, we'll try to load as regular image (works for some formats)
    // and fall back to a placeholder
    
    match image::open(path) {
        Ok(img) => Ok(img),
        Err(_) => {
            // Try to read embedded JPEG from RAW
            // This is a simplified approach - real implementation would use libraw
            let data = fs::read(path).map_err(|e| format!("Read failed: {}", e))?;
            
            // Look for JPEG signature in file (many RAWs embed JPEGs)
            if let Some(pos) = find_jpeg_start(&data) {
                if let Some(end) = find_jpeg_end(&data, pos) {
                    let jpeg_data = &data[pos..=end];
                    return image::load_from_memory(jpeg_data)
                        .map_err(|e| format!("Embedded JPEG decode failed: {}", e));
                }
            }
            
            Err("RAW decode not supported for this format".to_string())
        }
    }
}

fn find_jpeg_start(data: &[u8]) -> Option<usize> {
    for i in 0..data.len().saturating_sub(1) {
        if data[i] == 0xFF && data[i + 1] == 0xD8 {
            return Some(i);
        }
    }
    None
}

fn find_jpeg_end(data: &[u8], start: usize) -> Option<usize> {
    for i in (start + 2)..data.len().saturating_sub(1) {
        if data[i] == 0xFF && data[i + 1] == 0xD9 {
            return Some(i + 1);
        }
    }
    None
}

pub fn get_thumbnail_path(file_id: &str) -> String {
    let thumb_dir = get_thumbnail_dir();
    thumb_dir.join(format!("{}.jpg", file_id)).to_string_lossy().to_string()
}
