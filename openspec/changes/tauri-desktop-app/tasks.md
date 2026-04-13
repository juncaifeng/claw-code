# Implementation Tasks: Tauri Desktop Application

## Setup and Boilerplate
- [ ] **Task 1**: Initialize the Tauri project inside `rust/crates/tauri-app` using `create-tauri-app` with React + Vite + TypeScript template.
- [ ] **Task 2**: Update the root `Cargo.toml` workspace members array to include `crates/tauri-app/src-tauri`.
- [ ] **Task 3**: Configure Tailwind CSS, React components structure, and add `lucide-react` / `radix-ui` primitives for quick styling.

## Core Rust Integration
- [ ] **Task 4**: Add `runtime`, `api`, `tools`, and `commands` crates as dependencies in the Tauri `Cargo.toml`.
- [ ] **Task 5**: Expose a basic Tauri command (`load_config`) to read `~/.claude.json` or `.env` file containing API keys and return it to the frontend.
- [ ] **Task 6**: Expose `save_config` Tauri command to update user settings (e.g., API key, default model, theme).

## Chat Interface & Event Streaming
- [ ] **Task 7**: Define a Rust data structure for SSE-like streaming to the frontend (`ChatEvent` enum: TextChunk, ToolStart, ToolResult, TurnEnd).
- [ ] **Task 8**: Implement the `invoke_prompt` Tauri command. It should wrap `ConversationRuntime::run_turn`, mapping API stream events and Tool executions to `Window::emit` calls.
- [ ] **Task 9**: Create the frontend `ChatView` component. It should listen to `ChatEvent` events and incrementally update the message list state.

## Frontend UI Components
- [ ] **Task 10**: Implement a Markdown renderer component for Assistant messages (using `react-markdown` and `react-syntax-highlighter`).
- [ ] **Task 11**: Implement Tool Execution components. When a tool runs (e.g., `bash`, `read_file`), render a collapsible block showing the command and its output.
- [ ] **Task 12**: Implement the Input Area with auto-resizing, Shift+Enter for newline, and an arrow button to send the prompt.
- [ ] **Task 13**: Build the Sidebar: fetch past sessions via IPC (`load_sessions`) and display them. Allow clicking to restore a past session.

## Polish and Packaging
- [ ] **Task 14**: Implement error handling boundaries (e.g., missing API key, network failures) with toast notifications.
- [ ] **Task 15**: Support slash commands (`/clear`, `/doctor`) in the frontend input area, routing them to the Rust `commands` crate logic.
- [ ] **Task 16**: Finalize Tauri build configuration (`tauri.conf.json`), add app icons, and test `npm run tauri build` on macOS/Linux/Windows.
- [ ] **Task 17**: Update main `README.md` and add documentation on how to build and run the Tauri desktop application.
