# Design: Tauri Desktop Application

## Architecture

The application will be built using the [Tauri](https://tauri.app/) v2 framework, leveraging our existing modular Rust crates (`runtime`, `tools`, `api`, `commands`, `plugins`).

### 1. Frontend
- **Framework**: React + TypeScript + Vite.
- **Styling**: Tailwind CSS + Shadcn UI or similar component library.
- **State Management**: Zustand or Context API.
- **Markdown**: `react-markdown` with syntax highlighting (e.g., `react-syntax-highlighter`).

### 2. Backend (Rust Tauri Core)
- **Crate**: `rust/crates/tauri-app` (new).
- **Core Dependencies**: `runtime` (for `ConversationRuntime` and `Session`), `api` (for model endpoints), `tools` (for local system execution).
- **IPC Bridge**: Expose standard Tauri commands to handle session loading, config reading, and message dispatch.
- **Event Streaming**: Since `ConversationRuntime` processes responses asynchronously and streams data (text chunks, tool start/end events), we will use Tauri's `Window::emit` to push real-time events to the frontend, bypassing traditional synchronous request-response cycles for chat generation.

## Key Components

1. **Main Chat View**
   - **Message List**: Iterates over messages. User messages are plain text, Assistant messages render Markdown.
   - **Tool Execution Blocks**: Nested or collapsible UI components indicating when the agent uses tools (e.g., Bash execution, file reading), showing the command run and truncated output.

2. **Input Area**
   - Resizable text area (`textarea` or `contenteditable`).
   - Supports multi-line input (Shift+Enter for newline, Enter to send).
   - Slash command autocomplete (e.g., `/doctor`, `/clear`).

3. **Sidebar / Layout**
   - **Session Manager**: List past local sessions.
   - **Settings Panel**: Modal or view to configure API keys (`ANTHROPIC_API_KEY`), base URLs, and selected models, stored securely or in the local `.claude.json` config.

## IPC API Design (Rust -> TS)

- **Commands**:
  - `invoke_prompt(session_id: String, prompt: String)`: Triggers the `ConversationRuntime` flow.
  - `load_sessions()`: Returns a list of past `Session` metadata.
  - `load_session(session_id: String)`: Returns full session context.
  - `save_config(config: Config)`: Persists settings.
- **Events (emitted to frontend)**:
  - `chat_event_chunk`: Contains partial text from the model.
  - `tool_execution_start`: Metadata about the tool being invoked (e.g., `name: "bash", command: "ls -la"`).
  - `tool_execution_result`: Output of the tool execution.
  - `chat_event_done`: End of the model turn.

## Error Handling & Security

- **Security**: The desktop app must ensure tool execution (Bash, File Read/Write) is secure. By default, it will rely on the exact same sandbox/permissions policies implemented in the CLI (`PolicyEngine`). If required, we can add interactive confirmation dialogs in the GUI before executing destructive tools.
- **Error Handling**: Network errors, invalid API keys, and model errors will be caught in Rust, serialized to structured JSON errors, and sent over IPC for the frontend to render as system alerts or inline error messages.
