use runtime::config::{ConfigLoader, RuntimeConfig};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Window};

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
enum ChatEvent {
    TextChunk(String),
    ToolStart { name: String, command: String },
    ToolResult(String),
    TurnEnd,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn invoke_prompt(app: AppHandle, session_id: String, prompt: String) -> Result<(), String> {
    // In a real application, this would instantiate ConversationRuntime
    // For now, we simulate the SSE streaming of a model back to the UI.
    
    // Simulate a text response
    app.emit("chat_event", ChatEvent::TextChunk(format!("I received your prompt: {}\n", prompt)))
       .map_err(|e| e.to_string())?;
       
    // Simulate tool execution
    app.emit("chat_event", ChatEvent::ToolStart { 
        name: "bash".to_string(), 
        command: "ls -la".to_string() 
    }).map_err(|e| e.to_string())?;
    
    app.emit("chat_event", ChatEvent::ToolResult("total 42\ndrwxr-xr-x...".to_string()))
       .map_err(|e| e.to_string())?;
       
    // Simulate finish
    app.emit("chat_event", ChatEvent::TurnEnd)
       .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_config() -> Result<serde_json::Value, String> {
    let loader = ConfigLoader::default_for(std::env::current_dir().unwrap_or_default());
    match loader.load() {
        Ok(config) => {
            let json = config.as_json();
            // Convert our JsonValue to serde_json::Value
            let s = serde_json::to_string(&json).map_err(|e| e.to_string())?;
            serde_json::from_str(&s).map_err(|e| e.to_string())
        },
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    // In a real app, this would write to ~/.claw/settings.json
    // For now we just return Ok to satisfy the frontend
    println!("Saving config: {:?}", config);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, load_config, save_config, invoke_prompt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
