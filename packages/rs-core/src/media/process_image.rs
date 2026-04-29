use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{ImageError, ImageReader};
use std::io::Cursor;

const JPEG_QUALITY: u8 = 95;

/// How the source image is fit into the target dimensions.
pub enum ResizeMode {
    /// Scale and center-crop so the output is exactly `width` x `height`.
    Fill,
    /// Scale to fit entirely within `width` x `height`, preserving aspect.
    /// The output may be smaller than the requested bounds on one axis.
    Fit,
}

/// Resize the image per `mode` and encode as JPEG.
///
/// - `Fill`: output is always exactly `width` x `height`.
/// - `Fit`:  output preserves aspect ratio, at most `width` x `height`.
///   The caller computes the exact output dims from the source aspect
///   (same formula the `image` crate uses:
///   `ratio = min(width / src_w, height / src_h)`).
pub fn process_image(
    image: &[u8],
    width: u32,
    height: u32,
    mode: ResizeMode,
) -> Result<Vec<u8>, ImageError> {
    let src = ImageReader::new(Cursor::new(image))
        .with_guessed_format()
        .unwrap();
    let img = src.decode()?;
    let resized = match mode {
        ResizeMode::Fill => img.resize_to_fill(width, height, FilterType::Lanczos3),
        ResizeMode::Fit => img.resize(width, height, FilterType::Lanczos3),
    };

    let mut buf: Vec<u8> = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY);
    resized.write_with_encoder(encoder)?;
    Ok(buf)
}
