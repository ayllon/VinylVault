use tauri::Manager;

// Baseline uses preferred 1700x850 and 1200x800 on a 4K display at 150% scale
// (effective logical size 2560x1440).
const WINDOW_WIDTH_RATIO: f64 = 1700.0 / 2560.0;
const WINDOW_HEIGHT_RATIO: f64 = 850.0 / 1440.0;
const WINDOW_MIN_WIDTH_RATIO: f64 = 1200.0 / 2560.0;
const WINDOW_MIN_HEIGHT_RATIO: f64 = 800.0 / 1440.0;
const WINDOW_TARGET_WIDTH_SCALE: f64 = 1.1;
const WINDOW_TARGET_HEIGHT_SCALE: f64 = 1.16;
const WINDOW_MAX_SCREEN_SHARE: f64 = 0.95;
const WINDOW_ABSOLUTE_MIN_WIDTH: f64 = 760.0;
const WINDOW_ABSOLUTE_MIN_HEIGHT: f64 = 520.0;

fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

pub fn apply_adaptive_window_size(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let monitor = window
        .current_monitor()
        .map_err(|e| format!("Failed to query current monitor: {}", e))?
        .ok_or_else(|| "No monitor information available".to_string())?;

    let scale_factor = monitor.scale_factor();
    let monitor_logical_width = monitor.size().width as f64 / scale_factor;
    let monitor_logical_height = monitor.size().height as f64 / scale_factor;

    let max_width = monitor_logical_width * WINDOW_MAX_SCREEN_SHARE;
    let max_height = monitor_logical_height * WINDOW_MAX_SCREEN_SHARE;

    let target_width = clamp_f64(
        monitor_logical_width * WINDOW_WIDTH_RATIO * WINDOW_TARGET_WIDTH_SCALE,
        WINDOW_ABSOLUTE_MIN_WIDTH,
        max_width,
    );
    let target_height = clamp_f64(
        monitor_logical_height * WINDOW_HEIGHT_RATIO * WINDOW_TARGET_HEIGHT_SCALE,
        WINDOW_ABSOLUTE_MIN_HEIGHT,
        max_height,
    );

    let min_width = clamp_f64(
        monitor_logical_width * WINDOW_MIN_WIDTH_RATIO,
        WINDOW_ABSOLUTE_MIN_WIDTH,
        target_width,
    );
    let min_height = clamp_f64(
        monitor_logical_height * WINDOW_MIN_HEIGHT_RATIO,
        WINDOW_ABSOLUTE_MIN_HEIGHT,
        target_height,
    );

    window
        .set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
            min_width, min_height,
        ))))
        .map_err(|e| format!("Failed to set min window size: {}", e))?;

    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
            target_width,
            target_height,
        )))
        .map_err(|e| format!("Failed to set window size: {}", e))?;

    Ok(())
}
