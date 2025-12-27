use image::{DynamicImage, ImageBuffer, Rgb, RgbImage};
use rayon::prelude::*;

use crate::models::EditState;

pub fn apply_edits(img: DynamicImage, edits: &EditState) -> DynamicImage {
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();
    let mut pixels: Vec<[u8; 3]> = rgb.pixels().map(|p| p.0).collect();

    // Apply all edits in a single parallel pass
    pixels.par_chunks_mut(1024).for_each(|chunk| {
        for pixel in chunk.iter_mut() {
            let mut r = pixel[0] as f32;
            let mut g = pixel[1] as f32;
            let mut b = pixel[2] as f32;

            // Exposure
            if edits.exposure != 0.0 {
                let factor = 2.0_f32.powf(edits.exposure);
                r *= factor;
                g *= factor;
                b *= factor;
            }

            // Contrast
            if edits.contrast != 0.0 {
                let factor = (259.0 * (edits.contrast + 255.0)) / (255.0 * (259.0 - edits.contrast));
                r = factor * (r - 128.0) + 128.0;
                g = factor * (g - 128.0) + 128.0;
                b = factor * (b - 128.0) + 128.0;
            }

            // Highlights
            if edits.highlights != 0.0 {
                let lum = 0.299 * r + 0.587 * g + 0.114 * b;
                let mask = ((lum - 128.0) / 127.0).clamp(0.0, 1.0);
                let adj = -(edits.highlights / 100.0) * mask * 0.5;
                r *= 1.0 + adj;
                g *= 1.0 + adj;
                b *= 1.0 + adj;
            }

            // Shadows
            if edits.shadows != 0.0 {
                let lum = 0.299 * r + 0.587 * g + 0.114 * b;
                let mask = ((128.0 - lum) / 128.0).clamp(0.0, 1.0);
                let adj = (edits.shadows / 100.0) * mask * 0.5;
                r *= 1.0 + adj;
                g *= 1.0 + adj;
                b *= 1.0 + adj;
            }

            // White balance
            if edits.white_balance_temp != 5500.0 || edits.white_balance_tint != 0.0 {
                let temp_shift = (edits.white_balance_temp - 5500.0) / 100.0;
                let tint_shift = edits.white_balance_tint / 100.0;
                r += temp_shift;
                g -= tint_shift * 10.0;
                b -= temp_shift;
            }

            // Saturation
            if edits.saturation != 0.0 {
                let factor = 1.0 + edits.saturation / 100.0;
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = gray + factor * (r - gray);
                g = gray + factor * (g - gray);
                b = gray + factor * (b - gray);
            }

            // Vibrance
            if edits.vibrance != 0.0 {
                let max_val = r.max(g).max(b);
                let min_val = r.min(g).min(b);
                let sat = if max_val > 0.0 { (max_val - min_val) / max_val } else { 0.0 };
                let adj = (edits.vibrance / 100.0) * (1.0 - sat);
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = gray + (1.0 + adj) * (r - gray);
                g = gray + (1.0 + adj) * (g - gray);
                b = gray + (1.0 + adj) * (b - gray);
            }

            pixel[0] = r.clamp(0.0, 255.0) as u8;
            pixel[1] = g.clamp(0.0, 255.0) as u8;
            pixel[2] = b.clamp(0.0, 255.0) as u8;
        }
    });

    // Apply sharpening (needs neighbor access, separate pass)
    if edits.sharpening_amount > 0.0 && width > 2 && height > 2 {
        pixels = apply_sharpening_parallel(&pixels, width, height, edits.sharpening_amount);
    }

    // Apply noise reduction (needs neighbor access, separate pass)
    if edits.noise_reduction > 0.0 && width > 2 && height > 2 {
        pixels = apply_noise_reduction_parallel(&pixels, width, height, edits.noise_reduction);
    }

    let result: RgbImage = ImageBuffer::from_fn(width, height, |x, y| {
        let idx = (y * width + x) as usize;
        Rgb(pixels[idx])
    });

    DynamicImage::ImageRgb8(result)
}

fn apply_sharpening_parallel(pixels: &[[u8; 3]], width: u32, height: u32, amount: f32) -> Vec<[u8; 3]> {
    let factor = amount / 100.0;
    let w = width as usize;
    let h = height as usize;

    (0..pixels.len())
        .into_par_iter()
        .map(|idx| {
            let x = idx % w;
            let y = idx / w;

            if x == 0 || y == 0 || x == w - 1 || y == h - 1 {
                return pixels[idx];
            }

            let center = &pixels[idx];
            let top = &pixels[idx - w];
            let bottom = &pixels[idx + w];
            let left = &pixels[idx - 1];
            let right = &pixels[idx + 1];

            [
                (center[0] as f32 + factor * (4.0 * center[0] as f32 - top[0] as f32 - bottom[0] as f32 - left[0] as f32 - right[0] as f32)).clamp(0.0, 255.0) as u8,
                (center[1] as f32 + factor * (4.0 * center[1] as f32 - top[1] as f32 - bottom[1] as f32 - left[1] as f32 - right[1] as f32)).clamp(0.0, 255.0) as u8,
                (center[2] as f32 + factor * (4.0 * center[2] as f32 - top[2] as f32 - bottom[2] as f32 - left[2] as f32 - right[2] as f32)).clamp(0.0, 255.0) as u8,
            ]
        })
        .collect()
}

fn apply_noise_reduction_parallel(pixels: &[[u8; 3]], width: u32, height: u32, amount: f32) -> Vec<[u8; 3]> {
    let factor = (amount / 100.0).clamp(0.0, 1.0);
    let w = width as usize;
    let h = height as usize;

    (0..pixels.len())
        .into_par_iter()
        .map(|idx| {
            let x = idx % w;
            let y = idx / w;

            if x == 0 || y == 0 || x == w - 1 || y == h - 1 {
                return pixels[idx];
            }

            let center = &pixels[idx];
            let neighbors = [
                &pixels[idx - w - 1], &pixels[idx - w], &pixels[idx - w + 1],
                &pixels[idx - 1],                       &pixels[idx + 1],
                &pixels[idx + w - 1], &pixels[idx + w], &pixels[idx + w + 1],
            ];

            let avg_r: f32 = neighbors.iter().map(|p| p[0] as f32).sum::<f32>() / 8.0;
            let avg_g: f32 = neighbors.iter().map(|p| p[1] as f32).sum::<f32>() / 8.0;
            let avg_b: f32 = neighbors.iter().map(|p| p[2] as f32).sum::<f32>() / 8.0;

            [
                (center[0] as f32 * (1.0 - factor) + avg_r * factor).clamp(0.0, 255.0) as u8,
                (center[1] as f32 * (1.0 - factor) + avg_g * factor).clamp(0.0, 255.0) as u8,
                (center[2] as f32 * (1.0 - factor) + avg_b * factor).clamp(0.0, 255.0) as u8,
            ]
        })
        .collect()
}

pub fn resize_to_fit(img: DynamicImage, max_size: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= max_size && h <= max_size {
        return img;
    }

    let scale = max_size as f32 / w.max(h) as f32;
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;

    img.resize(new_w, new_h, image::imageops::FilterType::Triangle)
}

pub fn apply_crop(img: DynamicImage, crop: &crate::models::CropRect) -> DynamicImage {
    let x = (crop.x.max(0.0) as u32).min(img.width().saturating_sub(1));
    let y = (crop.y.max(0.0) as u32).min(img.height().saturating_sub(1));
    let width = (crop.width as u32).min(img.width().saturating_sub(x)).max(1);
    let height = (crop.height as u32).min(img.height().saturating_sub(y)).max(1);

    img.crop_imm(x, y, width, height)
}

pub fn rotate_image(img: DynamicImage, degrees: u16) -> DynamicImage {
    match degrees {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    }
}
