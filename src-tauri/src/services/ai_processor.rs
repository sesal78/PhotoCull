use image::DynamicImage;

use crate::models::EditState;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    pub exposure: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub white_balance_temp: f32,
    pub white_balance_tint: f32,
    pub saturation: f32,
    pub vibrance: f32,
    pub sharpening_amount: f32,
    pub noise_reduction: f32,
    pub confidence: f32,
    pub scene_type: String,
    pub scene_details: SceneDetails,
}

#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SceneDetails {
    pub is_backlit: bool,
    pub is_sunset: bool,
    pub is_portrait: bool,
    pub is_macro: bool,
    pub is_landscape: bool,
    pub is_night: bool,
    pub is_high_iso: bool,
    pub color_cast: String,
    pub dynamic_range: String,
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
    // Enhanced stats
    center_brightness: f32,
    edge_brightness: f32,
    skin_tone_ratio: f32,
    warm_color_ratio: f32,
    green_ratio: f32,
    noise_estimate: f32,
    local_variance: f32,
    gray_point: Option<(f32, f32, f32)>,
    highlights_headroom: f32,
    shadows_headroom: f32,
}

pub fn init_ai_model() -> Result<(), String> {
    tracing::info!("AI processor initialized (advanced histogram-based analysis)");
    Ok(())
}

pub fn analyze_image(img: &DynamicImage) -> Result<AiSuggestion, String> {
    let stats = compute_image_stats(img);
    let scene_details = detect_scene_details(&stats);
    Ok(compute_suggestions_from_stats(&stats, &scene_details))
}

fn compute_image_stats(img: &DynamicImage) -> ImageStats {
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();
    let total_pixels = (width * height) as f64;
    
    let mut histogram = [0u32; 256];
    let mut sum_brightness: f64 = 0.0;
    let mut sum_r: f64 = 0.0;
    let mut sum_g: f64 = 0.0;
    let mut sum_b: f64 = 0.0;
    let mut sum_saturation: f64 = 0.0;
    
    // For center vs edge analysis (backlight detection)
    let center_x = width / 2;
    let center_y = height / 2;
    let center_radius = (width.min(height) / 4) as i32;
    let mut center_brightness_sum: f64 = 0.0;
    let mut center_count: u32 = 0;
    let mut edge_brightness_sum: f64 = 0.0;
    let mut edge_count: u32 = 0;
    
    // Skin tone detection
    let mut skin_tone_pixels: u32 = 0;
    
    // Warm color detection (sunset)
    let mut warm_pixels: u32 = 0;
    let mut green_pixels: u32 = 0;
    
    // Noise estimation via local variance
    let mut local_variances: Vec<f32> = Vec::new();
    
    // Gray point candidates for white balance
    let mut gray_candidates: Vec<(f32, f32, f32)> = Vec::new();
    
    for y in 0..height {
        for x in 0..width {
            let pixel = rgb.get_pixel(x, y);
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
            
            // Center vs edge
            let dx = x as i32 - center_x as i32;
            let dy = y as i32 - center_y as i32;
            let dist = ((dx * dx + dy * dy) as f64).sqrt() as i32;
            if dist < center_radius {
                center_brightness_sum += brightness as f64;
                center_count += 1;
            } else if dist > center_radius * 2 {
                edge_brightness_sum += brightness as f64;
                edge_count += 1;
            }
            
            // Skin tone detection (approximate range)
            if r > 95.0 && g > 40.0 && b > 20.0 
                && r > g && r > b
                && (r - g).abs() > 15.0
                && r - b > 15.0
                && sat > 0.1 && sat < 0.7 {
                skin_tone_pixels += 1;
            }
            
            // Warm colors (sunset detection)
            if r > 150.0 && g > 50.0 && g < 180.0 && b < 150.0 && r > g && g > b {
                warm_pixels += 1;
            }
            
            // Green detection (landscape)
            if g > r && g > b && g > 80.0 {
                green_pixels += 1;
            }
            
            // Gray point detection (for white balance)
            if sat < 0.1 && brightness > 50 && brightness < 200 {
                gray_candidates.push((r as f32, g as f32, b as f32));
            }
        }
    }
    
    // Compute local variance for noise estimation (sample-based)
    let sample_step = ((width * height) / 1000).max(1) as u32;
    for y in (1..height-1).step_by(sample_step as usize) {
        for x in (1..width-1).step_by(sample_step as usize) {
            let center = rgb.get_pixel(x, y);
            let neighbors = [
                rgb.get_pixel(x-1, y), rgb.get_pixel(x+1, y),
                rgb.get_pixel(x, y-1), rgb.get_pixel(x, y+1),
            ];
            
            let center_lum = (center[0] as f32 + center[1] as f32 + center[2] as f32) / 3.0;
            let mut var: f32 = 0.0;
            for n in &neighbors {
                let n_lum = (n[0] as f32 + n[1] as f32 + n[2] as f32) / 3.0;
                var += (center_lum - n_lum).powi(2);
            }
            local_variances.push(var / 4.0);
        }
    }
    
    let mean_brightness = (sum_brightness / total_pixels) as f32;
    let mean_r = sum_r / total_pixels;
    let mean_g = sum_g / total_pixels;
    let mean_b = sum_b / total_pixels;
    
    let mut variance: f64 = 0.0;
    for (i, &count) in histogram.iter().enumerate() {
        let diff = i as f64 - mean_brightness as f64;
        variance += diff * diff * count as f64;
    }
    let std_brightness = (variance / total_pixels).sqrt() as f32;
    
    let color_temp_bias = ((mean_r - mean_b) / 255.0 * 100.0) as f32;
    let tint_bias = ((mean_g - (mean_r + mean_b) / 2.0) / 255.0 * 100.0) as f32;
    
    let saturation_level = (sum_saturation / total_pixels) as f32;
    let contrast_level = std_brightness / 128.0;
    
    let shadows_clipped = histogram[..10].iter().sum::<u32>() as f32 / total_pixels as f32;
    let highlights_clipped = histogram[245..].iter().sum::<u32>() as f32 / total_pixels as f32;
    
    let center_brightness = if center_count > 0 { 
        (center_brightness_sum / center_count as f64) as f32 
    } else { 
        mean_brightness 
    };
    let edge_brightness = if edge_count > 0 { 
        (edge_brightness_sum / edge_count as f64) as f32 
    } else { 
        mean_brightness 
    };
    
    let skin_tone_ratio = skin_tone_pixels as f32 / total_pixels as f32;
    let warm_color_ratio = warm_pixels as f32 / total_pixels as f32;
    let green_ratio = green_pixels as f32 / total_pixels as f32;
    
    // Noise estimate from local variance
    local_variances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let noise_estimate = if !local_variances.is_empty() {
        local_variances[local_variances.len() / 4] // 25th percentile
    } else {
        0.0
    };
    
    let local_variance = if !local_variances.is_empty() {
        local_variances.iter().sum::<f32>() / local_variances.len() as f32
    } else {
        0.0
    };
    
    // Gray point from candidates
    let gray_point = if gray_candidates.len() > 10 {
        let sum: (f32, f32, f32) = gray_candidates.iter().fold((0.0, 0.0, 0.0), |acc, &(r, g, b)| {
            (acc.0 + r, acc.1 + g, acc.2 + b)
        });
        let len = gray_candidates.len() as f32;
        Some((sum.0 / len, sum.1 / len, sum.2 / len))
    } else {
        None
    };
    
    // Headroom analysis
    let highlights_headroom = histogram[200..245].iter().sum::<u32>() as f32 / total_pixels as f32;
    let shadows_headroom = histogram[10..55].iter().sum::<u32>() as f32 / total_pixels as f32;
    
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
        center_brightness,
        edge_brightness,
        skin_tone_ratio,
        warm_color_ratio,
        green_ratio,
        noise_estimate,
        local_variance,
        gray_point,
        highlights_headroom,
        shadows_headroom,
    }
}

fn detect_scene_details(stats: &ImageStats) -> SceneDetails {
    let brightness_diff = stats.edge_brightness - stats.center_brightness;
    
    SceneDetails {
        is_backlit: brightness_diff > 30.0 && stats.center_brightness < 100.0,
        is_sunset: stats.warm_color_ratio > 0.15 && stats.color_temp_bias > 10.0,
        is_portrait: stats.skin_tone_ratio > 0.05 && stats.skin_tone_ratio < 0.4,
        is_macro: stats.local_variance > 500.0 && stats.saturation_level > 0.3,
        is_landscape: stats.green_ratio > 0.2 && stats.contrast_level > 0.25,
        is_night: stats.mean_brightness < 50.0 && stats.shadows_clipped > 0.15,
        is_high_iso: stats.noise_estimate > 50.0,
        color_cast: detect_color_cast(stats),
        dynamic_range: if stats.highlights_clipped > 0.02 || stats.shadows_clipped > 0.02 {
            "high".to_string()
        } else if stats.contrast_level < 0.2 {
            "low".to_string()
        } else {
            "normal".to_string()
        },
    }
}

fn detect_color_cast(stats: &ImageStats) -> String {
    if stats.color_temp_bias > 15.0 {
        "warm".to_string()
    } else if stats.color_temp_bias < -15.0 {
        "cool".to_string()
    } else if stats.tint_bias > 10.0 {
        "green".to_string()
    } else if stats.tint_bias < -10.0 {
        "magenta".to_string()
    } else {
        "neutral".to_string()
    }
}

fn compute_suggestions_from_stats(stats: &ImageStats, scene: &SceneDetails) -> AiSuggestion {
    // Base exposure correction
    let target_brightness = if scene.is_night { 80.0 } else if scene.is_backlit { 110.0 } else { 128.0 };
    let brightness_diff = target_brightness - stats.mean_brightness;
    let mut exposure = (brightness_diff / 50.0).clamp(-2.5, 2.5);
    
    // Highlight recovery
    let mut highlights: f32 = 0.0;
    if stats.highlights_clipped > 0.01 {
        highlights = (-stats.highlights_clipped * 500.0).clamp(-100.0, 0.0);
        exposure = exposure.min(0.5); // Reduce exposure push if highlights clipped
    }
    
    // Shadow recovery
    let mut shadows: f32 = 0.0;
    if stats.shadows_clipped > 0.01 {
        shadows = (stats.shadows_clipped * 300.0).clamp(0.0, 100.0);
    }
    
    // Backlight compensation
    if scene.is_backlit {
        shadows += 30.0;
        exposure += 0.5;
    }
    
    // Contrast
    let target_contrast = if scene.is_portrait { 0.28 } else if scene.is_landscape { 0.38 } else { 0.33 };
    let contrast_diff = target_contrast - stats.contrast_level;
    let mut contrast = (contrast_diff * 100.0).clamp(-30.0, 40.0);
    
    // White balance from gray point or bias correction
    let (white_balance_temp, white_balance_tint) = if let Some((r, g, b)) = stats.gray_point {
        // Correct based on gray point deviation from neutral
        let avg = (r + g + b) / 3.0;
        let r_dev = (avg - r) / avg * 1000.0;
        let b_dev = (avg - b) / avg * 1000.0;
        let temp = (5500.0 + (b_dev - r_dev) * 2.0).clamp(2500.0, 10000.0);
        let tint = ((avg - g) / avg * 100.0).clamp(-100.0, 100.0);
        (temp, tint)
    } else {
        // Fallback to bias correction
        let temp_correction = -stats.color_temp_bias * 50.0;
        let temp = (5500.0 + temp_correction).clamp(3000.0, 8000.0);
        let tint = (-stats.tint_bias * 30.0).clamp(-50.0, 50.0);
        (temp, tint)
    };
    
    // Scene-specific white balance adjustments
    let white_balance_temp = if scene.is_sunset {
        white_balance_temp.max(5800.0) // Preserve warm tones
    } else {
        white_balance_temp
    };
    
    // Saturation and vibrance
    let target_saturation = if scene.is_sunset { 0.45 } 
        else if scene.is_portrait { 0.30 } 
        else if scene.is_landscape { 0.40 }
        else { 0.35 };
    let sat_diff = target_saturation - stats.saturation_level;
    let mut saturation = (sat_diff * 100.0).clamp(-25.0, 35.0);
    let mut vibrance = (sat_diff * 60.0).clamp(-15.0, 30.0);
    
    // Portrait: boost vibrance, reduce saturation for skin
    if scene.is_portrait {
        saturation = saturation.min(10.0);
        vibrance = vibrance.max(15.0);
    }
    
    // Landscape: boost both
    if scene.is_landscape {
        saturation += 5.0;
        vibrance += 10.0;
        contrast += 5.0;
    }
    
    // Sharpening
    let mut sharpening_amount = if scene.is_portrait { 15.0 } 
        else if scene.is_landscape { 35.0 }
        else if scene.is_macro { 40.0 }
        else { 25.0 };
    
    // Reduce sharpening if noisy
    if scene.is_high_iso {
        sharpening_amount *= 0.5;
    }
    
    // Noise reduction
    let noise_reduction = if scene.is_high_iso {
        (stats.noise_estimate / 2.0).clamp(10.0, 50.0)
    } else if stats.noise_estimate > 20.0 {
        (stats.noise_estimate / 4.0).clamp(0.0, 25.0)
    } else {
        0.0
    };
    
    let scene_type = determine_scene_type(scene);
    let confidence = calculate_confidence(stats, scene);
    
    AiSuggestion {
        exposure,
        contrast,
        highlights,
        shadows,
        white_balance_temp,
        white_balance_tint,
        saturation,
        vibrance,
        sharpening_amount,
        noise_reduction,
        confidence,
        scene_type,
        scene_details: scene.clone(),
    }
}

fn determine_scene_type(scene: &SceneDetails) -> String {
    if scene.is_sunset { "sunset".to_string() }
    else if scene.is_backlit { "backlit".to_string() }
    else if scene.is_portrait { "portrait".to_string() }
    else if scene.is_macro { "macro".to_string() }
    else if scene.is_landscape { "landscape".to_string() }
    else if scene.is_night { "night".to_string() }
    else { "general".to_string() }
}

fn calculate_confidence(stats: &ImageStats, scene: &SceneDetails) -> f32 {
    let mut confidence: f32 = 0.85;
    
    // Reduce confidence for extreme conditions
    if stats.highlights_clipped > 0.1 || stats.shadows_clipped > 0.1 {
        confidence -= 0.2;
    } else if stats.highlights_clipped > 0.05 || stats.shadows_clipped > 0.05 {
        confidence -= 0.1;
    }
    
    if stats.mean_brightness < 30.0 || stats.mean_brightness > 225.0 {
        confidence -= 0.15;
    }
    
    // High noise reduces confidence
    if scene.is_high_iso {
        confidence -= 0.1;
    }
    
    // Boost confidence for clear scene detection
    if scene.is_portrait || scene.is_landscape || scene.is_sunset {
        confidence += 0.05;
    }
    
    // Gray point detection improves white balance confidence
    if stats.gray_point.is_some() {
        confidence += 0.05;
    }
    
    confidence.clamp(0.3, 0.95)
}

pub fn apply_ai_suggestion(edits: &EditState, suggestion: &AiSuggestion, strength: f32) -> EditState {
    let strength = strength.clamp(0.0, 1.0);
    
    EditState {
        exposure: edits.exposure + (suggestion.exposure - edits.exposure) * strength,
        contrast: edits.contrast + (suggestion.contrast - edits.contrast) * strength,
        highlights: edits.highlights + (suggestion.highlights - edits.highlights) * strength,
        shadows: edits.shadows + (suggestion.shadows - edits.shadows) * strength,
        white_balance_temp: edits.white_balance_temp + (suggestion.white_balance_temp - edits.white_balance_temp) * strength,
        white_balance_tint: edits.white_balance_tint + (suggestion.white_balance_tint - edits.white_balance_tint) * strength,
        saturation: edits.saturation + (suggestion.saturation - edits.saturation) * strength,
        vibrance: edits.vibrance + (suggestion.vibrance - edits.vibrance) * strength,
        sharpening_amount: edits.sharpening_amount + (suggestion.sharpening_amount - edits.sharpening_amount) * strength,
        noise_reduction: edits.noise_reduction + (suggestion.noise_reduction - edits.noise_reduction) * strength,
        ..edits.clone()
    }
}

// Batch processing support
pub fn analyze_images_batch(images: &[(String, &DynamicImage)]) -> Vec<(String, Result<AiSuggestion, String>)> {
    images.iter().map(|(id, img)| {
        (id.clone(), analyze_image(img))
    }).collect()
}
