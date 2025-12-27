use image::{DynamicImage, ImageBuffer, Rgb};
use std::path::Path;

pub struct RawDecoder;

impl RawDecoder {
    pub fn decode_raw(path: &Path) -> Result<DynamicImage, String> {
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        match extension.as_str() {
            "cr2" | "cr3" | "nef" | "arw" | "orf" | "rw2" | "dng" | "raf" | "pef" | "srw" => {
                Self::decode_with_rawloader(path)
            }
            _ => Err(format!("Unsupported RAW format: {}", extension)),
        }
    }

    fn decode_with_rawloader(path: &Path) -> Result<DynamicImage, String> {
        use rawloader::decode_file;

        let raw = decode_file(path).map_err(|e| format!("Failed to decode RAW: {}", e))?;

        let width = raw.width;
        let height = raw.height;

        let data = match raw.data {
            rawloader::RawImageData::Integer(ref data) => {
                data.iter().map(|&v| (v >> 8) as u8).collect::<Vec<u8>>()
            }
            rawloader::RawImageData::Float(ref data) => data
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect::<Vec<u8>>(),
        };

        let cpp = raw.cpp;
        if cpp == 1 {
            let gray_buffer: ImageBuffer<image::Luma<u8>, Vec<u8>> =
                ImageBuffer::from_raw(width as u32, height as u32, data)
                    .ok_or("Failed to create image buffer")?;
            Ok(DynamicImage::ImageLuma8(gray_buffer))
        } else if cpp >= 3 {
            let rgb_data: Vec<u8> = data
                .chunks(cpp)
                .flat_map(|chunk| vec![chunk[0], chunk[1], chunk[2]])
                .collect();
            let rgb_buffer: ImageBuffer<Rgb<u8>, Vec<u8>> =
                ImageBuffer::from_raw(width as u32, height as u32, rgb_data)
                    .ok_or("Failed to create RGB buffer")?;
            Ok(DynamicImage::ImageRgb8(rgb_buffer))
        } else {
            Err("Unsupported color depth".to_string())
        }
    }

    pub fn is_raw_format(path: &Path) -> bool {
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        matches!(
            extension.as_str(),
            "cr2" | "cr3" | "nef" | "arw" | "orf" | "rw2" | "dng" | "raf" | "pef" | "srw"
        )
    }
}
