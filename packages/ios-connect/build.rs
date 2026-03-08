fn main() {
    napi_build::setup();

    // @napi-rs/cli v3 sets NAPI_TYPE_DEF_TMP_FOLDER (a directory).
    // napi-derive proc macro reads TYPE_DEF_TMP_PATH (a file).
    // Bridge them: each crate writes to <folder>/<crate_name>.
    if let Ok(folder) = std::env::var("NAPI_TYPE_DEF_TMP_FOLDER") {
        let pkg = std::env::var("CARGO_PKG_NAME").unwrap_or_default();
        println!("cargo:rustc-env=TYPE_DEF_TMP_PATH={folder}/{pkg}");
    }

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    match target_os.as_str() {
        "macos" => {
            println!("cargo:rustc-link-lib=framework=IOKit");
            println!("cargo:rustc-link-lib=framework=CoreFoundation");
            println!("cargo:rustc-link-lib=framework=Security");
        }
        "linux" => {
            // idevice uses usbmuxd socket on Linux; libusbmuxd is typically
            // available via system packages (libimobiledevice-dev).
            // No explicit link flags needed if it links dynamically by default.
        }
        "windows" => {
            // On Windows, usbmuxd is bundled with iTunes/Apple Mobile Device Support.
            // The idevice crate handles this; no extra link flags needed here.
        }
        _ => {}
    }
}
