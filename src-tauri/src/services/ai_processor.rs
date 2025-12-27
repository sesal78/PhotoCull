use image::{DynamicImage, GenericImageView};

use crate::models::EditState;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    pub exposure: f32,
    pub contrast: f32,
    pub white_balance_temp: f32,
    pub white_balance_tint: f32,
    pub saturation: f32,
    pub vibrance: f32,
    pub sharpening_amount: f32,
    pub confidence: f32,
    pub scene_type: String,
}

#[derive(Debug)]
struct ImageStats {
    mean_brightness: f32,
    std_brightness: f32,
    histogram: [u32; 256],
    color_temp_bias: f32,
    tint_bias: f32,
    saturation_level: f32,
    contrast_level: f32,
    highlights_clipped: f32,
    shadows_clipped: f32,
}

pub fn init_ai_model() -> Result<(), String> {
    tracing::info!("AI processor initialized (histogram-based analysis)");
    Ok(())
}

pub fn analyze_image(img: &DynamicImage) -> Result<AiSuggestion, String> {
    let stats = compute_image_stats(img);
    Ok(compute_suggestions_from_stats(&stats))
}

fn compute_image_stats(img: &DynamicImage) -> ImageStats {
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();
    let total_pixels = (width * height) as f32;
    
    let mut histogram = [0u32; 256];
    let mut sum_brightness: f64 = 0.0;
    let mut sum_r: f64 = 0.0;
    let mut sum_g: f64 = 0.0;
    let mut sum_b: f64 = 0.0;
    let mut sum_saturation: f64 = 0.0;
    
    for pixel in rgb.pixels() {
        let r = pixel[0] as f64;
        let g = pixel[1] as f64;
        let b = pixel[2] as f64;
        
        let brightness = (0.299 * r + 0.587 * g + 0.114 * b) as u8;
        histogram[brightness as usize] += 1;
        sum_brightness += brightness as f64;
        
        sum_r += r;
        sum_g += g;
        sum_b += b;
        
        let max_c = r.max(g).max(b);
        let min_c = r.min(g).min(b);
        let sat = if max_c > 0.0 { (max_c - min_c) / max_c } else { 0.0 };
        sum_saturation += sat;
    }
    
    let mean_brightness = (sum_brightness / total_pixels as f64) as f32;
    let mean_r = sum_r / total_pixels as f64;
    let mean_g = sum_g / total_pixels as f64;
    let mean_b = sum_b / total_pixels as f64;
    
    let mut variance: f64 = 0.0;
    for (i, &count) in histogram.iter().enumerate() {
        let diff = i as f64 - mean_brightness as f64;
        variance += diff * diff * count as f64;
    }
    let std_brightness = (variance / total_pixels as f64).sqrt() as f32;
    
    let color_temp_bias = ((mean_r - mean_b) / 255.0 * 100.0) as f32;
    let tint_bias = ((mean_g - (mean_r + mean_b) / 2.0) / 255.0 * 100.0) as f32;
    
    let saturation_level = (sum_saturation / total_pixels as f64) as f32;
    
    let contrast_level = std_brightness / 128.0;
    
    let shadows_clipped = histogram[..10].iter().sum::<u32>() as f32 / total_pixels;
    let highlights_clipped = histogram[245..].iter().sum::<u32>() as f32 / total_pixels;
    
    ImageStats {
        mean_brightness,
        std_brightness,
        histogram,
        color_temp_bias,
        tint_bias,
        saturation_level,
        contrast_level,
        highlights_clipped,
        shadows_clipped,
    }
}

fn compute_suggestions_from_stats(stats: &ImageStats) -> AiSuggestion {
    let target_brightness = 128.0;
    let brightness_diff = target_brightness - stats.mean_brightness;
    let exposure = (brightness_diff / 50.0).clamp(-2.0, 2.0);
    
    let target_contrast = 0.35;
    let contrast_diff = target_contrast - stats.contrast_level;
    let contrast = (contrast_diff * 100.0).clamp(-30.0, 30.0);
    
    let temp_correction = -stats.color_temp_bias * 50.0;
    let white_balance_temp = (5500.0 + temp_correction).clamp(3000.0, 8000.0);
    
    let tint_correction = -stats.tint_bias * 30.0;
    let white_balance_tint = tint_correction.clamp(-50.0, 50.0);
    
    let target_saturation = 0.35;
    let sat_diff = target_saturation - stats.saturation_level;
    let saturation = (sat_diff * 100.0).clamp(-20.0, 30.0);
    
    let vibrance = (sat_diff * 50.0).clamp(-10.0, 25.0);
    
    let sharpening_amount = if stats.std_brightness < 40.0 { 15.0 } else { 25.0 };
    
    let scene_type = detect_scene_type(stats);
    
    let confidence = calculate_confidence(stats);
    
    AiSuggestion {
        exposure,
        contrast,
        white_balance_temp,
        white_balance_tint,
        saturation,
        vibrance,
        sharpening_amount,
        confidence,
        scene_type,
    }
}

fn detect_scene_type(stats: &ImageStats) -> String {
    if stats.mean_brightness < 50.0 && stats.shadows_clipped > 0.1 {
        "night".to_string()
    } else if stats.mean_brightness > 200.0 && stats.highlights_clipped > 0.1 {
        "high_key".to_string()
    } else if stats.saturation_level > 0.5 {
        "vivid".to_string()
    } else if stats.saturation_level < 0.15 {
        "muted".to_string()
    } else if stats.contrast_level > 0.4 {
        "high_contrast".to_string()
    } else if stats.contrast_level < 0.2 {
        "low_contrast".to_string()
    } else {
        "normal".to_string()
    }
}

fn calculate_confidence(stats: &ImageStats) -> f32 {
    let mut confidence: f32 = 0.8;

    if stats.highlights_clipped > 0.05 || stats.shadows_clipped > 0.05 {
        confidence -= 0.2;
    }

    if stats.mean_brightness < 30.0 || stats.mean_brightness > 225.0 {
        confidence -= 0.15;
    }

    confidence.clamp(0.3, 1.0)
}

pub fn apply_ai_suggestion(edits: &EditState, suggestion: &AiSuggestion, strength: f32) -> EditState {
    let strength = strength.clamp(0.0, 1.0);
    
    EditState {
        exposure: edits.exposure + (suggestion.exposure - edits.exposure) * strength,
        contrast: edits.contrast + (suggestion.contrast - edits.contrast) * strength,
        white_balance_temp: edits.white_balance_temp + (suggestion.white_balance_temp - edits.white_balance_temp) * strength,
        white_balance_tint: edits.white_balance_tint + (suggestion.white_balance_tint - edits.white_balance_tint) * strength,
        saturation: edits.saturation + (suggestion.saturation - edits.saturation) * strength,
        vibrance: edits.vibrance + (suggestion.vibrance - edits.vibrance) * strength,
        sharpening_amount: edits.sharpening_amount + (suggestion.sharpening_amount - edits.sharpening_amount) * strength,
        ..edits.clone()
    }
}
