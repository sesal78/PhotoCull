use image::{DynamicImage, ImageBuffer, Rgb, RgbImage};

use crate::models::EditState;

pub fn apply_edits(img: DynamicImage, edits: &EditState) -> DynamicImage {
    let mut rgb = img.to_rgb8();

    if edits.exposure != 0.0 {
        rgb = apply_exposure(rgb, edits.exposure);
    }

    if edits.contrast != 0.0 {
        rgb = apply_contrast(rgb, edits.contrast);
    }

    if edits.white_balance_temp != 5500.0 || edits.white_balance_tint != 0.0 {
        rgb = apply_white_balance(rgb, edits.white_balance_temp, edits.white_balance_tint);
    }

    if edits.saturation != 0.0 {
        rgb = apply_saturation(rgb, edits.saturation);
    }

    if edits.vibrance != 0.0 {
        rgb = apply_vibrance(rgb, edits.vibrance);
    }

    if edits.sharpening_amount > 0.0 {
        rgb = apply_sharpening(rgb, edits.sharpening_amount, edits.sharpening_radius);
    }

    DynamicImage::ImageRgb8(rgb)
}

fn apply_exposure(img: RgbImage, ev: f32) -> RgbImage {
    let factor = 2.0_f32.powf(ev);
    ImageBuffer::from_fn(img.width(), img.height(), |x, y| {
        let pixel = img.get_pixel(x, y);
        Rgb([
            (pixel[0] as f32 * factor).clamp(0.0, 255.0) as u8,
            (pixel[1] as f32 * factor).clamp(0.0, 255.0) as u8,
            (pixel[2] as f32 * factor).clamp(0.0, 255.0) as u8,
        ])
    })
}

fn apply_contrast(img: RgbImage, amount: f32) -> RgbImage {
    let factor = (259.0 * (amount + 255.0)) / (255.0 * (259.0 - amount));
    ImageBuffer::from_fn(img.width(), img.height(), |x, y| {
        let pixel = img.get_pixel(x, y);
        Rgb([
            ((factor * (pixel[0] as f32 - 128.0)) + 128.0).clamp(0.0, 255.0) as u8,
            ((factor * (pixel[1] as f32 - 128.0)) + 128.0).clamp(0.0, 255.0) as u8,
            ((factor * (pixel[2] as f32 - 128.0)) + 128.0).clamp(0.0, 255.0) as u8,
        ])
    })
}

fn apply_white_balance(img: RgbImage, temp: f32, tint: f32) -> RgbImage {
    let temp_shift = (temp - 5500.0) / 100.0;
    let tint_shift = tint / 100.0;

    ImageBuffer::from_fn(img.width(), img.height(), |x, y| {
        let pixel = img.get_pixel(x, y);
        let r = (pixel[0] as f32 + temp_shift).clamp(0.0, 255.0) as u8;
        let g = (pixel[1] as f32 - tint_shift * 10.0).clamp(0.0, 255.0) as u8;
        let b = (pixel[2] as f32 - temp_shift).clamp(0.0, 255.0) as u8;
        Rgb([r, g, b])
    })
}

fn apply_saturation(img: RgbImage, amount: f32) -> RgbImage {
    let factor = 1.0 + amount / 100.0;
    ImageBuffer::from_fn(img.width(), img.height(), |x, y| {
        let pixel = img.get_pixel(x, y);
        let gray = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
        Rgb([
            (gray + factor * (pixel[0] as f32 - gray)).clamp(0.0, 255.0) as u8,
            (gray + factor * (pixel[1] as f32 - gray)).clamp(0.0, 255.0) as u8,
            (gray + factor * (pixel[2] as f32 - gray)).clamp(0.0, 255.0) as u8,
        ])
    })
}

fn apply_vibrance(img: RgbImage, amount: f32) -> RgbImage {
    let factor = amount / 100.0;
    ImageBuffer::from_fn(img.width(), img.height(), |x, y| {
        let pixel = img.get_pixel(x, y);
        let max_val = pixel[0].max(pixel[1]).max(pixel[2]) as f32;
        let min_val = pixel[0].min(pixel[1]).min(pixel[2]) as f32;
        let saturation = if max_val > 0.0 { (max_val - min_val) / max_val } else { 0.0 };
        let adjust = factor * (1.0 - saturation);
        let gray = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
        Rgb([
            (gray + (1.0 + adjust) * (pixel[0] as f32 - gray)).clamp(0.0, 255.0) as u8,
            (gray + (1.0 + adjust) * (pixel[1] as f32 - gray)).clamp(0.0, 255.0) as u8,
            (gray + (1.0 + adjust) * (pixel[2] as f32 - gray)).clamp(0.0, 255.0) as u8,
        ])
    })
}

fn apply_sharpening(img: RgbImage, amount: f32, _radius: f32) -> RgbImage {
    let factor = amount / 100.0;
    let (width, height) = img.dimensions();
    
    if width < 3 || height < 3 {
        return img;
    }

    ImageBuffer::from_fn(width, height, |x, y| {
        if x == 0 || y == 0 || x == width - 1 || y == height - 1 {
            return *img.get_pixel(x, y);
        }

        let center = img.get_pixel(x, y);
        let top = img.get_pixel(x, y - 1);
        let bottom = img.get_pixel(x, y + 1);
        let left = img.get_pixel(x - 1, y);
        let right = img.get_pixel(x + 1, y);

        Rgb([
            (center[0] as f32 + factor * (4.0 * center[0] as f32 - top[0] as f32 - bottom[0] as f32 - left[0] as f32 - right[0] as f32)).clamp(0.0, 255.0) as u8,
            (center[1] as f32 + factor * (4.0 * center[1] as f32 - top[1] as f32 - bottom[1] as f32 - left[1] as f32 - right[1] as f32)).clamp(0.0, 255.0) as u8,
            (center[2] as f32 + factor * (4.0 * center[2] as f32 - top[2] as f32 - bottom[2] as f32 - left[2] as f32 - right[2] as f32)).clamp(0.0, 255.0) as u8,
        ])
    })
}

pub fn resize_to_fit(img: DynamicImage, max_size: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= max_size && h <= max_size {
        return img;
    }

    let scale = max_size as f32 / w.max(h) as f32;
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;

    img.resize(new_w, new_h, image::imageops::FilterType::Lanczos3)
}

pub fn rotate_image(img: DynamicImage, degrees: u16) -> DynamicImage {
    match degrees {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    }
}
