# Proposal: Tauri Desktop Application

## What
This change introduces a native Desktop GUI for Claw Code using [Tauri](https://tauri.app/). It leverages the existing high-performance Rust runtime (`runtime`, `api`, `tools` crates) and exposes them through a modern web-based frontend (e.g., React/Vue) wrapped in a lightweight native desktop window.

## Why
While the current CLI interface is powerful and efficient, a graphical user interface (GUI) provides several advantages for LLM agent interactions:
1. **Enhanced User Experience**: Easier multi-line input, rich markdown rendering, drag-and-drop file support, and visual separation of conversation versus tool execution logs.
2. **Context Visibility**: Sidebars for managing multiple conversation sessions, viewing project file trees, or displaying token usage in a dedicated pane.
3. **Accessibility**: A desktop app is more approachable for users who prefer graphical environments over the terminal, broadening the potential user base of Claw Code.
4. **Code Reuse**: Since the core logic is already written in Rust and cleanly separated into modular crates (`runtime`, `api`, `tools`), Tauri is the perfect framework to bridge this logic to a web frontend without rewriting the core engine.

## Scope
- Add a new crate/application to the repository: `tauri-app`.
- Provide a clean chat interface mimicking modern LLM clients (e.g., ChatGPT, Claude desktop app).
- Support core features: API key configuration, model selection, tool execution visualization, and session persistence.
- Package installers for macOS, Windows, and Linux.

## Out of Scope
- Rewriting the CLI interface (the CLI and GUI will coexist and share the same core crates).
- Cloud syncing of sessions (sessions will remain locally persisted, sharing the same local storage format as the CLI).
