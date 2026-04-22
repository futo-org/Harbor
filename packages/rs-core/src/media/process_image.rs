use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageError, ImageReader};
use std::io::Cursor;

const JPEG_QUALITY: u8 = 95;

pub fn process_image(image: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ImageError> {
    let src = ImageReader::new(Cursor::new(image))
        .with_guessed_format()
        .unwrap();
    let img = src.decode()?;
    let resized = img.resize_to_fill(width, height, FilterType::Lanczos3);
    let mut buf: Vec<u8> = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY);
    resized.write_with_encoder(encoder)?;
    Ok(buf)
}
