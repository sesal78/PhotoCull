use image::{DynamicImage, Rgb, RgbImage};
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

    match load_image(image_path) {
        Ok(img) => {
            let thumbnail = img.thumbnail(256, 256);
            thumbnail
                .save(&thumb_path)
                .map_err(|e| format!("Save thumbnail failed: {}", e))?;
        }
        Err(e) => {
            // Create a placeholder thumbnail for unsupported formats
            tracing::warn!("Failed to load image for thumbnail: {}, creating placeholder", e);
            let placeholder = create_placeholder_thumbnail();
            placeholder
                .save(&thumb_path)
                .map_err(|e| format!("Save placeholder failed: {}", e))?;
        }
    }

    Ok(thumb_path.to_string_lossy().to_string())
}

fn create_placeholder_thumbnail() -> DynamicImage {
    let mut img = RgbImage::new(256, 256);
    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let gray = if (x / 16 + y / 16) % 2 == 0 { 60 } else { 80 };
        *pixel = Rgb([gray, gray, gray]);
    }
    // Draw "RAW" text indicator in center (simple pattern)
    for y in 120..136 {
        for x in 100..156 {
            img.put_pixel(x, y, Rgb([100, 100, 100]));
        }
    }
    DynamicImage::ImageRgb8(img)
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
    // Try standard image open first (works for some RAW formats)
    if let Ok(img) = image::open(path) {
        return Ok(img);
    }

    // Read file and look for embedded JPEG
    let data = fs::read(path).map_err(|e| format!("Read failed: {}", e))?;
    
    // Try multiple JPEG markers - some RAWs have multiple embedded JPEGs
    let jpeg_markers = find_all_jpeg_segments(&data);
    
    // Try to decode the largest embedded JPEG (usually the full-size preview)
    for (start, end) in jpeg_markers.iter().rev() {
        if end - start > 10000 { // Skip tiny thumbnails
            let jpeg_data = &data[*start..=*end];
            if let Ok(img) = image::load_from_memory(jpeg_data) {
                return Ok(img);
            }
        }
    }
    
    // Try any JPEG we found
    for (start, end) in jpeg_markers {
        let jpeg_data = &data[start..=end];
        if let Ok(img) = image::load_from_memory(jpeg_data) {
            return Ok(img);
        }
    }
    
    Err("RAW decode not supported for this format".to_string())
}

fn find_all_jpeg_segments(data: &[u8]) -> Vec<(usize, usize)> {
    let mut segments = Vec::new();
    let mut search_start = 0;
    
    while let Some(start) = find_jpeg_start_from(data, search_start) {
        if let Some(end) = find_jpeg_end(data, start) {
            segments.push((start, end));
            search_start = end + 1;
        } else {
            search_start = start + 2;
        }
        
        if search_start >= data.len() {
            break;
        }
    }
    
    segments
}

fn find_jpeg_start_from(data: &[u8], from: usize) -> Option<usize> {
    for i in from..data.len().saturating_sub(1) {
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
