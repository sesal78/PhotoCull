use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFile {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub file_size: u64,
    pub modified_at: String,
    pub is_raw: bool,
    pub dimensions: Option<Dimensions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub top: f32,
    pub left: f32,
    pub bottom: f32,
    pub right: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Flag {
    #[default]
    None,
    Pick,
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditState {
    pub rating: u8,
    pub flag: Flag,
    pub crop: Option<CropRect>,
    pub straighten_angle: f32,
    pub rotation: u16,
    pub exposure: f32,
    pub contrast: f32,
    pub white_balance_temp: f32,
    pub white_balance_tint: f32,
    pub saturation: f32,
    pub vibrance: f32,
    pub sharpening_amount: f32,
    pub sharpening_radius: f32,
}

impl Default for EditState {
    fn default() -> Self {
        Self {
            rating: 0,
            flag: Flag::None,
            crop: None,
            straighten_angle: 0.0,
            rotation: 0,
            exposure: 0.0,
            contrast: 0.0,
            white_balance_temp: 5500.0,
            white_balance_tint: 0.0,
            saturation: 0.0,
            vibrance: 0.0,
            sharpening_amount: 0.0,
            sharpening_radius: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderContents {
    pub path: String,
    pub files: Vec<ImageFile>,
    pub edit_states: std::collections::HashMap<String, EditState>,
    pub thumbnail_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub format: String,
    pub quality: u8,
    pub resize_mode: String,
    pub resize_value: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub success: bool,
    pub source_id: String,
    pub destination_path: Option<String>,
    pub error: Option<String>,
}

pub const RAW_EXTENSIONS: &[&str] = &[
    "cr2", "cr3", "nef", "nrw", "arw", "srf", "sr2", "raf", "orf", "rw2",
    "dng", "pef", "erf", "3fr", "fff", "iiq", "rwl", "srw", "x3f", "mrw",
];

pub const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "tiff", "tif", "webp", "heic", "heif",
];

impl ImageFile {
    pub fn is_supported_extension(ext: &str) -> bool {
        let lower = ext.to_lowercase();
        RAW_EXTENSIONS.contains(&lower.as_str()) || IMAGE_EXTENSIONS.contains(&lower.as_str())
    }

    pub fn is_raw_extension(ext: &str) -> bool {
        RAW_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    }
}
