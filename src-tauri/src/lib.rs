mod protocol;
mod webroot;

pub fn run() {
    let builder = tauri::Builder::default();
    let builder = protocol::register(builder);
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
