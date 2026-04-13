use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use api::{
    max_tokens_for_model, resolve_model_alias, ApiError, ContentBlockDelta, InputContentBlock,
    InputMessage, MessageRequest, MessageResponse, OutputContentBlock, ProviderClient, StreamEvent,
    ToolResultContentBlock,
};
use runtime::config::{ConfigLoader, RuntimeFeatureConfig};
use runtime::permissions::{PermissionMode, PermissionPolicy};
use runtime::session::{ContentBlock, ConversationMessage, MessageRole, Session};
use runtime::{ApiClient, ApiRequest, AssistantEvent, ConversationRuntime, RuntimeError, ToolError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Emitter, State, Window};

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
enum ChatEvent {
    TextChunk(String),
    ToolStart { name: String, command: String },
    ToolResult(String),
    TurnEnd,
}

const DEFAULT_MODEL: &str = "claude-opus-4-6";

#[derive(Debug, Clone)]
struct GuiSettings {
    model: String,
}

struct GuiApiClient {
    runtime: tokio::runtime::Runtime,
    settings: Arc<Mutex<GuiSettings>>,
}

impl GuiApiClient {
    fn new(settings: Arc<Mutex<GuiSettings>>) -> Result<Self, String> {
        Ok(Self {
            runtime: tokio::runtime::Runtime::new().map_err(|error| error.to_string())?,
            settings,
        })
    }
}

impl ApiClient for GuiApiClient {
    fn stream(&mut self, request: ApiRequest) -> Result<Vec<AssistantEvent>, RuntimeError> {
        let model = self
            .settings
            .lock()
            .map_err(|_| RuntimeError::new("settings lock poisoned"))?
            .model
            .clone();
        let model = resolve_model_alias(&model);
        let client =
            ProviderClient::from_model(&model).map_err(|error| RuntimeError::new(error.to_string()))?;
        let message_request = MessageRequest {
            model: model.clone(),
            max_tokens: max_tokens_for_model(&model),
            messages: convert_messages(&request.messages),
            system: (!request.system_prompt.is_empty()).then(|| request.system_prompt.join("\n\n")),
            tools: None,
            tool_choice: None,
            stream: true,
            ..Default::default()
        };

        self.runtime
            .block_on(stream_with_provider(&client, &message_request))
            .map_err(|error| RuntimeError::new(error.to_string()))
    }
}

#[derive(Default)]
struct GuiToolExecutor;

impl runtime::ToolExecutor for GuiToolExecutor {
    fn execute(&mut self, tool_name: &str, input: &str) -> Result<String, ToolError> {
        let value: Value =
            serde_json::from_str(input).unwrap_or_else(|_| Value::String(input.to_string()));
        tools::execute_tool(tool_name, &value).map_err(ToolError::new)
    }
}

struct AppState {
    workspace_root: PathBuf,
    settings: Arc<Mutex<GuiSettings>>,
    runtime: Arc<Mutex<ConversationRuntime<GuiApiClient, GuiToolExecutor>>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn invoke_prompt(window: Window, prompt: String, state: State<'_, AppState>) -> Result<(), String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Ok(());
    }

    let runtime = state.runtime.clone();
    let events = tauri::async_runtime::spawn_blocking(move || {
        let mut runtime = runtime
            .lock()
            .map_err(|_| String::from("runtime lock poisoned"))?;
        runtime
            .run_turn(prompt, None)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;

    for message in events.assistant_messages {
        emit_message_blocks(&window, &message)?;
    }

    for message in events.tool_results {
        emit_message_blocks(&window, &message)?;
    }

    window
        .emit("chat_event", ChatEvent::TurnEnd)
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let config = ConfigLoader::default_for(state.workspace_root.clone())
        .load()
        .map_err(|error| error.to_string())?;
    let model_from_config = config.model().map(ToOwned::to_owned);
    let model_from_env = std::env::var("ANTHROPIC_MODEL").ok().filter(|value| !value.trim().is_empty());
    let effective_model = state
        .settings
        .lock()
        .map_err(|_| String::from("settings lock poisoned"))?
        .model
        .clone();

    Ok(serde_json::json!({
        "workspaceRoot": state.workspace_root.display().to_string(),
        "effectiveModel": effective_model,
        "modelFromConfig": model_from_config,
        "modelFromEnv": model_from_env,
        "anthropicApiKeySet": std::env::var("ANTHROPIC_API_KEY").is_ok(),
        "openaiApiKeySet": std::env::var("OPENAI_API_KEY").is_ok(),
        "xaiApiKeySet": std::env::var("XAI_API_KEY").is_ok(),
        "dashscopeApiKeySet": std::env::var("DASHSCOPE_API_KEY").is_ok()
    }))
}

#[tauri::command]
fn set_model(model: String, state: State<'_, AppState>) -> Result<(), String> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err(String::from("model must not be empty"));
    }
    write_project_setting_model(&state.workspace_root, &model)?;
    let mut settings = state
        .settings
        .lock()
        .map_err(|_| String::from("settings lock poisoned"))?;
    settings.model = model;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let workspace_root = resolve_workspace_root();
            let initial_model = load_effective_model(&workspace_root);
            let settings = Arc::new(Mutex::new(GuiSettings { model: initial_model }));
            let api_client = GuiApiClient::new(settings.clone())?;
            let session = Session::new().with_workspace_root(workspace_root.clone());
            let runtime = ConversationRuntime::new_with_features(
                session,
                api_client,
                GuiToolExecutor::default(),
                PermissionPolicy::new(PermissionMode::Allow),
                Vec::new(),
                &RuntimeFeatureConfig::default(),
            );
            app.manage(AppState {
                workspace_root,
                settings,
                runtime: Arc::new(Mutex::new(runtime)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_settings, set_model, invoke_prompt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn resolve_workspace_root() -> PathBuf {
    let start = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut dir = start.as_path();
    loop {
        if dir.join("rust").join("Cargo.toml").exists() {
            return dir.to_path_buf();
        }
        if dir.join(".git").exists() {
            return dir.to_path_buf();
        }
        let Some(parent) = dir.parent() else {
            return start;
        };
        dir = parent;
    }
}

fn load_effective_model(workspace_root: &Path) -> String {
    let loader = ConfigLoader::default_for(workspace_root.to_path_buf());
    if let Ok(config) = loader.load() {
        if let Some(model) = config.model() {
            return model.to_string();
        }
    }
    if let Ok(model) = std::env::var("ANTHROPIC_MODEL") {
        if !model.trim().is_empty() {
            return model;
        }
    }
    DEFAULT_MODEL.to_string()
}

fn write_project_setting_model(workspace_root: &Path, model: &str) -> Result<(), String> {
    let dir = workspace_root.join(".claw");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join("settings.local.json");
    let mut document = match std::fs::read_to_string(&path) {
        Ok(contents) => {
            if contents.trim().is_empty() {
                serde_json::Map::new()
            } else {
                serde_json::from_str::<Value>(&contents)
                    .map_err(|error| error.to_string())?
                    .as_object()
                    .cloned()
                    .ok_or_else(|| String::from("settings.local.json must contain a JSON object"))?
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => serde_json::Map::new(),
        Err(error) => return Err(error.to_string()),
    };
    document.insert("model".to_string(), Value::String(model.to_string()));
    let contents = serde_json::to_string_pretty(&document).map_err(|error| error.to_string())?;
    std::fs::write(&path, contents).map_err(|error| error.to_string())
}

fn emit_message_blocks(window: &Window, message: &ConversationMessage) -> Result<(), String> {
    for block in &message.blocks {
        match block {
            ContentBlock::Text { text } => {
                if !text.is_empty() {
                    window
                        .emit("chat_event", ChatEvent::TextChunk(text.clone()))
                        .map_err(|error| error.to_string())?;
                }
            }
            ContentBlock::ToolUse { name, input, .. } => {
                window
                    .emit(
                        "chat_event",
                        ChatEvent::ToolStart {
                            name: name.clone(),
                            command: input.clone(),
                        },
                    )
                    .map_err(|error| error.to_string())?;
            }
            ContentBlock::ToolResult { output, .. } => {
                window
                    .emit("chat_event", ChatEvent::ToolResult(output.clone()))
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

fn convert_messages(messages: &[ConversationMessage]) -> Vec<InputMessage> {
    messages
        .iter()
        .filter_map(|message| {
            let role = match message.role {
                MessageRole::System | MessageRole::User | MessageRole::Tool => "user",
                MessageRole::Assistant => "assistant",
            };
            let content = message
                .blocks
                .iter()
                .map(|block| match block {
                    ContentBlock::Text { text } => InputContentBlock::Text { text: text.clone() },
                    ContentBlock::ToolUse { id, name, input } => InputContentBlock::ToolUse {
                        id: id.clone(),
                        name: name.clone(),
                        input: serde_json::from_str(input)
                            .unwrap_or_else(|_| serde_json::json!({ "raw": input })),
                    },
                    ContentBlock::ToolResult {
                        tool_use_id,
                        output,
                        is_error,
                        ..
                    } => InputContentBlock::ToolResult {
                        tool_use_id: tool_use_id.clone(),
                        content: vec![ToolResultContentBlock::Text {
                            text: output.clone(),
                        }],
                        is_error: *is_error,
                    },
                })
                .collect::<Vec<_>>();
            (!content.is_empty()).then(|| InputMessage {
                role: role.to_string(),
                content,
            })
        })
        .collect()
}

async fn stream_with_provider(
    client: &ProviderClient,
    message_request: &MessageRequest,
) -> Result<Vec<AssistantEvent>, ApiError> {
    let mut stream = client.stream_message(message_request).await?;
    let mut events = Vec::new();
    let mut pending_tools: std::collections::BTreeMap<u32, (String, String, String)> =
        std::collections::BTreeMap::new();
    let mut saw_stop = false;

    while let Some(event) = stream.next_event().await? {
        match event {
            StreamEvent::MessageStart(start) => {
                for block in start.message.content {
                    push_output_block(block, 0, &mut events, &mut pending_tools, true);
                }
            }
            StreamEvent::ContentBlockStart(start) => {
                push_output_block(
                    start.content_block,
                    start.index,
                    &mut events,
                    &mut pending_tools,
                    true,
                );
            }
            StreamEvent::ContentBlockDelta(delta) => match delta.delta {
                ContentBlockDelta::TextDelta { text } => {
                    if !text.is_empty() {
                        events.push(AssistantEvent::TextDelta(text));
                    }
                }
                ContentBlockDelta::InputJsonDelta { partial_json } => {
                    if let Some((_, _, input)) = pending_tools.get_mut(&delta.index) {
                        input.push_str(&partial_json);
                    }
                }
                ContentBlockDelta::ThinkingDelta { .. }
                | ContentBlockDelta::SignatureDelta { .. } => {}
            },
            StreamEvent::ContentBlockStop(stop) => {
                if let Some((id, name, input)) = pending_tools.remove(&stop.index) {
                    events.push(AssistantEvent::ToolUse { id, name, input });
                }
            }
            StreamEvent::MessageDelta(delta) => {
                events.push(AssistantEvent::Usage(delta.usage.token_usage()));
            }
            StreamEvent::MessageStop(_) => {
                saw_stop = true;
                events.push(AssistantEvent::MessageStop);
            }
        }
    }

    if events
        .iter()
        .any(|event| matches!(event, AssistantEvent::MessageStop))
    {
        return Ok(events);
    }

    if saw_stop {
        events.push(AssistantEvent::MessageStop);
        return Ok(events);
    }

    let response = client
        .send_message(&MessageRequest {
            stream: false,
            ..message_request.clone()
        })
        .await?;
    Ok(response_to_events(response))
}

fn push_output_block(
    block: OutputContentBlock,
    block_index: u32,
    events: &mut Vec<AssistantEvent>,
    pending_tools: &mut std::collections::BTreeMap<u32, (String, String, String)>,
    streaming_tool_input: bool,
) {
    match block {
        OutputContentBlock::Text { text } => {
            if !text.is_empty() {
                events.push(AssistantEvent::TextDelta(text));
            }
        }
        OutputContentBlock::ToolUse { id, name, input } => {
            let initial_input = if streaming_tool_input
                && input.is_object()
                && input.as_object().is_some_and(serde_json::Map::is_empty)
            {
                String::new()
            } else {
                input.to_string()
            };
            pending_tools.insert(block_index, (id, name, initial_input));
        }
        OutputContentBlock::Thinking { .. } | OutputContentBlock::RedactedThinking { .. } => {}
    }
}

fn response_to_events(response: MessageResponse) -> Vec<AssistantEvent> {
    let mut events = Vec::new();
    let mut pending_tools = std::collections::BTreeMap::new();

    for (index, block) in response.content.into_iter().enumerate() {
        let index = u32::try_from(index).expect("response block index overflow");
        push_output_block(block, index, &mut events, &mut pending_tools, false);
        if let Some((id, name, input)) = pending_tools.remove(&index) {
            events.push(AssistantEvent::ToolUse { id, name, input });
        }
    }

    if !events
        .iter()
        .any(|event| matches!(event, AssistantEvent::MessageStop))
    {
        events.push(AssistantEvent::MessageStop);
    }

    events
}
