use std::collections::HashMap;
use std::sync::Mutex;
use image::codecs::jpeg::JpegEncoder;
use std::io::Cursor;
use tauri::State;

use crate::models::{EditState, ExportOptions, ExportResult, FolderContents, ImageFile, Flag};
use crate::services::{filesystem, thumbnail, xmp, export, image_processor, ai_processor};

pub struct AppState {
    pub files: Mutex<HashMap<String, ImageFile>>,
    pub edit_states: Mutex<HashMap<String, EditState>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            files: Mutex::new(HashMap::new()),
            edit_states: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn open_folder(path: String, state: State<'_, AppState>) -> Result<FolderContents, String> {
    let files = filesystem::scan_directory(std::path::Path::new(&path))?;
    let edit_states = filesystem::load_sidecars(&files);
    let thumbnail_dir = filesystem::get_thumbnail_dir().to_string_lossy().to_string();

    {
        let mut files_map = state.files.lock().unwrap();
        files_map.clear();
        for file in &files {
            files_map.insert(file.id.clone(), file.clone());
        }
    }

    {
        let mut states_map = state.edit_states.lock().unwrap();
        states_map.clear();
        for (id, edit_state) in &edit_states {
            states_map.insert(id.clone(), edit_state.clone());
        }
    }

    Ok(FolderContents {
        path,
        files,
        edit_states,
        thumbnail_dir,
    })
}

#[tauri::command]
pub async fn get_thumbnail(file_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let files = state.files.lock().unwrap();
    let file = files.get(&file_id).ok_or("File not found")?;
    let path = file.path.clone();
    drop(files);

    thumbnail::generate_thumbnail(&path, &file_id)
}

#[tauri::command]
pub async fn get_preview(
    file_id: String,
    edits: EditState,
    max_size: u32,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let files = state.files.lock().unwrap();
    let file = files.get(&file_id).ok_or("File not found")?;
    let path = file.path.clone();
    drop(files);

    let img = thumbnail::load_image(&path)?;
    let resized = image_processor::resize_to_fit(img, max_size);
    let processed = image_processor::apply_edits(resized, &edits);
    let rotated = image_processor::rotate_image(processed, edits.rotation);

    let rgb = rotated.to_rgb8();
    let mut buffer = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buffer, 85);
    rgb.write_with_encoder(encoder)
        .map_err(|e| format!("Encode failed: {}", e))?;

    Ok(buffer.into_inner())
}

#[tauri::command]
pub async fn save_edits(file_id: String, edits: EditState, state: State<'_, AppState>) -> Result<(), String> {
    let files = state.files.lock().unwrap();
    let file = files.get(&file_id).ok_or("File not found")?;
    let xmp_path = filesystem::get_xmp_path(&file.path);
    drop(files);

    xmp::save_xmp_file(&xmp_path, &edits)?;

    let mut states = state.edit_states.lock().unwrap();
    states.insert(file_id, edits);

    Ok(())
}

#[tauri::command]
pub async fn set_rating(file_id: String, rating: u8, state: State<'_, AppState>) -> Result<(), String> {
    let mut states = state.edit_states.lock().unwrap();
    let edit_state = states.entry(file_id.clone()).or_insert_with(EditState::default);
    edit_state.rating = rating.min(5);
    let updated = edit_state.clone();
    drop(states);

    let files = state.files.lock().unwrap();
    if let Some(file) = files.get(&file_id) {
        let xmp_path = filesystem::get_xmp_path(&file.path);
        drop(files);
        xmp::save_xmp_file(&xmp_path, &updated)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn set_flag(file_id: String, flag: String, state: State<'_, AppState>) -> Result<(), String> {
    let flag_enum = match flag.as_str() {
        "pick" => Flag::Pick,
        "reject" => Flag::Reject,
        _ => Flag::None,
    };

    let mut states = state.edit_states.lock().unwrap();
    let edit_state = states.entry(file_id.clone()).or_insert_with(EditState::default);
    edit_state.flag = flag_enum;
    let updated = edit_state.clone();
    drop(states);

    let files = state.files.lock().unwrap();
    if let Some(file) = files.get(&file_id) {
        let xmp_path = filesystem::get_xmp_path(&file.path);
        drop(files);
        xmp::save_xmp_file(&xmp_path, &updated)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn export_images(
    file_ids: Vec<String>,
    destination: String,
    options: ExportOptions,
    state: State<'_, AppState>,
) -> Result<Vec<ExportResult>, String> {
    let files = state.files.lock().unwrap();
    let states = state.edit_states.lock().unwrap();

    let mut results = Vec::new();

    for file_id in file_ids {
        let file = match files.get(&file_id) {
            Some(f) => f,
            None => {
                results.push(ExportResult {
                    success: false,
                    source_id: file_id,
                    destination_path: None,
                    error: Some("File not found".to_string()),
                });
                continue;
            }
        };

        let edits = states.get(&file_id).cloned().unwrap_or_default();
        let result = export::export_image(&file.path, &file_id, &destination, &edits, &options);
        results.push(result);
    }

    Ok(results)
}

#[tauri::command]
pub async fn ai_analyze(file_id: String, state: State<'_, AppState>) -> Result<ai_processor::AiSuggestion, String> {
    let files = state.files.lock().unwrap();
    let file = files.get(&file_id).ok_or("File not found")?;
    let path = file.path.clone();
    drop(files);

    let img = thumbnail::load_image(&path)?;
    let resized = image_processor::resize_to_fit(img, 1024);
    
    ai_processor::analyze_image(&resized)
}

#[tauri::command]
pub async fn ai_auto_enhance(
    file_id: String,
    strength: f32,
    state: State<'_, AppState>,
) -> Result<EditState, String> {
    let files = state.files.lock().unwrap();
    let file = files.get(&file_id).ok_or("File not found")?;
    let path = file.path.clone();
    drop(files);

    let current_edits = {
        let states = state.edit_states.lock().unwrap();
        states.get(&file_id).cloned().unwrap_or_default()
    };

    let img = thumbnail::load_image(&path)?;
    let resized = image_processor::resize_to_fit(img, 1024);
    
    let suggestion = ai_processor::analyze_image(&resized)?;
    let new_edits = ai_processor::apply_ai_suggestion(&current_edits, &suggestion, strength);

    let xmp_path = filesystem::get_xmp_path(&path);
    xmp::save_xmp_file(&xmp_path, &new_edits)?;

    let mut states = state.edit_states.lock().unwrap();
    states.insert(file_id, new_edits.clone());

    Ok(new_edits)
}

#[tauri::command]
pub fn init_ai() -> Result<(), String> {
    ai_processor::init_ai_model()
}
