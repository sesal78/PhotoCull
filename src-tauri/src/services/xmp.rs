use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::{Reader, Writer};
use std::io::Cursor;

use crate::models::{EditState, Flag};

pub fn parse_xmp(content: &str) -> Result<EditState, String> {
    if content.len() > 1024 * 1024 {
        return Err("XMP too large".to_string());
    }

    let mut state = EditState::default();
    let mut reader = Reader::from_str(content);
    reader.trim_text(true);

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"rdf:Description" {
                    for attr in e.attributes().filter_map(|a| a.ok()) {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let value = String::from_utf8_lossy(&attr.value).to_string();

                        match key.as_str() {
                            "xmp:Rating" => {
                                state.rating = value.parse().unwrap_or(0);
                            }
                            "crs:Exposure2012" | "crs:Exposure" => {
                                state.exposure = value.parse().unwrap_or(0.0);
                            }
                            "crs:Contrast2012" | "crs:Contrast" => {
                                state.contrast = value.parse().unwrap_or(0.0);
                            }
                            "crs:Temperature" => {
                                state.white_balance_temp = value.parse().unwrap_or(5500.0);
                            }
                            "crs:Tint" => {
                                state.white_balance_tint = value.parse().unwrap_or(0.0);
                            }
                            "crs:Saturation" => {
                                state.saturation = value.parse().unwrap_or(0.0);
                            }
                            "crs:Vibrance" => {
                                state.vibrance = value.parse().unwrap_or(0.0);
                            }
                            "crs:Sharpness" => {
                                state.sharpening_amount = value.parse().unwrap_or(0.0);
                            }
                            "crs:SharpenRadius" => {
                                state.sharpening_radius = value.parse().unwrap_or(1.0);
                            }
                            "crs:CropAngle" => {
                                state.straighten_angle = value.parse().unwrap_or(0.0);
                            }
                            "crs:Orientation" => {
                                state.rotation = match value.as_str() {
                                    "6" => 90,
                                    "3" => 180,
                                    "8" => 270,
                                    _ => 0,
                                };
                            }
                            "photocull:Flag" => {
                                state.flag = match value.as_str() {
                                    "pick" => Flag::Pick,
                                    "reject" => Flag::Reject,
                                    _ => Flag::None,
                                };
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(state)
}

pub fn write_xmp(state: &EditState) -> Result<String, String> {
    let mut writer = Writer::new(Cursor::new(Vec::new()));

    writer.write_event(Event::Decl(quick_xml::events::BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(|e| e.to_string())?;

    let mut xmpmeta = BytesStart::new("x:xmpmeta");
    xmpmeta.push_attribute(("xmlns:x", "adobe:ns:meta/"));
    writer.write_event(Event::Start(xmpmeta)).map_err(|e| e.to_string())?;

    let mut rdf = BytesStart::new("rdf:RDF");
    rdf.push_attribute(("xmlns:rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"));
    writer.write_event(Event::Start(rdf)).map_err(|e| e.to_string())?;

    let mut desc = BytesStart::new("rdf:Description");
    desc.push_attribute(("xmlns:xmp", "http://ns.adobe.com/xap/1.0/"));
    desc.push_attribute(("xmlns:crs", "http://ns.adobe.com/camera-raw-settings/1.0/"));
    desc.push_attribute(("xmlns:photocull", "http://photocull.app/1.0/"));

    desc.push_attribute(("xmp:Rating", state.rating.to_string().as_str()));
    desc.push_attribute(("crs:Exposure2012", format!("{:+.2}", state.exposure).as_str()));
    desc.push_attribute(("crs:Contrast2012", state.contrast.to_string().as_str()));
    desc.push_attribute(("crs:Temperature", state.white_balance_temp.to_string().as_str()));
    desc.push_attribute(("crs:Tint", state.white_balance_tint.to_string().as_str()));
    desc.push_attribute(("crs:Saturation", state.saturation.to_string().as_str()));
    desc.push_attribute(("crs:Vibrance", state.vibrance.to_string().as_str()));
    desc.push_attribute(("crs:Sharpness", state.sharpening_amount.to_string().as_str()));
    desc.push_attribute(("crs:SharpenRadius", state.sharpening_radius.to_string().as_str()));
    desc.push_attribute(("crs:CropAngle", state.straighten_angle.to_string().as_str()));

    let orientation = match state.rotation {
        90 => "6",
        180 => "3",
        270 => "8",
        _ => "1",
    };
    desc.push_attribute(("crs:Orientation", orientation));

    let flag_str = match state.flag {
        Flag::Pick => "pick",
        Flag::Reject => "reject",
        Flag::None => "none",
    };
    desc.push_attribute(("photocull:Flag", flag_str));

    writer.write_event(Event::Empty(desc)).map_err(|e| e.to_string())?;

    writer.write_event(Event::End(BytesEnd::new("rdf:RDF"))).map_err(|e| e.to_string())?;
    writer.write_event(Event::End(BytesEnd::new("x:xmpmeta"))).map_err(|e| e.to_string())?;

    let result = writer.into_inner().into_inner();
    String::from_utf8(result).map_err(|e| e.to_string())
}

pub fn save_xmp_file(path: &str, state: &EditState) -> Result<(), String> {
    let xmp_content = write_xmp(state)?;
    std::fs::write(path, xmp_content).map_err(|e| format!("Write failed: {}", e))
}
