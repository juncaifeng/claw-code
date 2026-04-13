# Claw Code - Code Wiki

本文档是针对 **Claw Code** 项目的全面代码架构指南，涵盖了项目的架构设计、模块职责、核心类与函数、关键依赖以及运行与构建指令。

## 1. 项目整体架构 (Project Architecture)

Claw Code 是 `claw` CLI 智能体运行时的 Rust 高性能重写版本。该项目采用混合语言架构，根据功能划分为两个主要工作区：

- **Rust 工作区 (`rust/`)**：核心生产环境代码。提供了主 CLI 程序的完整实现、多轮对话流转、本地工具执行和 API 通信。其设计目标是高执行速度、内存安全以及原生的工具链执行能力。
- **Python 工作区 (`src/` & `tests/`)**：辅助与参考工作区（Python porting workspace）。主要用于在重写过程中与归档的 TypeScript 源码进行行为逻辑对照（Parity Audit），生成对照测试清单，以及模拟部分运行时行为，不作为主要的生产环境使用。

---

## 2. 主要模块与职责 (Main Module Responsibilities)

Rust 工作区采用了多 Crate (多包) 的工作区（Workspace）结构，各模块的职责边界清晰：

- **`rusty-claude-cli` (主程序)**：主 CLI 二进制程序（即 `claw`）。负责命令行参数解析、基于 `rustyline` 的交互式 REPL 终端交互、终端流式 Markdown 渲染与语法高亮。
- **`runtime` (运行时)**：核心运行时引擎。负责大语言模型与工具执行之间的多轮对话流转（`ConversationRuntime`）、会话状态持久化（`Session`）、权限策略引擎（`PolicyEngine`）、配置文件合并与加载、MCP（Model Context Protocol）生命周期管理以及 Hook 运行。
- **`tools` (工具集)**：内置工具集的具体实现。包含系统 Bash 执行、文件读写（Read/Write/Edit）、文件搜索（Glob/Grep）、网页访问（Search/Fetch）、子智能体（Agent）、任务追踪（Todo）等工具逻辑。
- **`api` (网络与模型客户端)**：LLM 提供商（支持 Anthropic 和 OpenAI 兼容协议）的 API 客户端。处理 SSE 流式事件解析、Token 认证、请求体预检以及大模型的 Prompt 缓存机制。
- **`commands` (斜杠命令)**：斜杠命令（Slash Commands，如 `/doctor`, `/mcp`, `/skills`, `/agents` 等）的定义、参数解析、执行逻辑和帮助文档生成。
- **`plugins` (插件系统)**：管理插件元数据、安装、启用/禁用流程及工具桥接。
- **`telemetry` (遥测与监控)**：负责会话追踪（Tracing）、Token 使用量统计与系统诊断分析。
- **`mock-anthropic-service` & `compat-harness` (测试设施)**：用于端到端功能一致性测试的本地 Mock LLM 服务，以及提示词/工具清单的提取辅助。

---

## 3. 核心类与结构体/函数 (Key Classes & Functions)

### 3.1 Rust 核心层
- **`rusty-claude-cli::main` -> `BuiltRuntime` & `CliAction`**
  - **职责**：CLI 的总入口，负责解析终端传入的 `CliAction` 枚举（如 `prompt`, `doctor`, `status`），并组装初始化 `BuiltRuntime`（将配置、API客户端、工具注册表绑定在一起）。
- **`runtime::conversation::ConversationRuntime`**
  - **职责**：主对话循环管理器。包含核心的 `run_turn` 方法，该方法负责向大模型发送 API 请求、接收并解析 `AssistantEvent`，以及触发后续的工具执行和状态流转。
- **`runtime::session::Session`**
  - **职责**：管理多轮对话历史上下文的核心结构体，支持消息的增删、紧凑化（Compaction）和本地持久化。
- **`tools::ToolExecutor` (Trait)**
  - **职责**：工具执行的抽象接口。其核心方法为 `execute(&mut self, tool_name: &str, input: &str) -> Result<String, ToolError>`。具体的工具请求（如 `ReadFileInput`, `AgentInput`）均通过此接口进行派发与执行。
- **`api::ApiClient` (Trait)**
  - **职责**：流式 API 的网络客户端抽象。封装了模型接口的 `stream` 方法，返回由文本片段和工具调用组成的统一事件流。

### 3.2 Python 参考层
- **`src.runtime.PortRuntime`**
  - **职责**：Python 端的模拟运行时引擎。提供 `route_prompt`、`run_turn_loop` 和 `bootstrap_session` 函数，用于模拟和测试大模型的工具路由及基础生命周期。
- **`src.query_engine.QueryEnginePort`**
  - **职责**：处理会话转录（Transcript）、系统 Prompt 初始化和底层消息提交的接口类。

---

## 4. 关键依赖关系 (Dependencies)

**Rust 生产环境主要依赖**：
- **异步与网络**：`tokio`（异步运行时）, `reqwest`（HTTP 客户端）。
- **序列化**：`serde` 与 `serde_json`（API 载荷、本地 Session 文件解析）。
- **终端交互**：`rustyline`（提供带有自动补全和命令历史的交互式 REPL）。
- **渲染与高亮**：`crossterm`（终端颜色与光标控制）, `pulldown_cmark`（Markdown 解析）, `syntect`（代码块语法高亮）。
- **实用工具**：`flate2`（PDF文本解压）, `glob` / `regex` / `walkdir`（文件树遍历与模式匹配）。

**Python 测试环境依赖**：
- 主要依赖 Python 3 标准库（如 `argparse`, `dataclasses`, `json`），尽量保持环境轻量化，方便独立执行审查和映射（Parity Mapping）任务。

---

## 5. 运行与构建方式 (Running Instructions)

项目主要在类 Unix 环境（Linux、macOS、WSL）下运行，以下是核心操作指令：

### 5.1 安装与构建
推荐使用仓库根目录提供的安装脚本，该脚本会自动检测环境并编译 Rust 工作区：

```bash
# 默认构建 Debug 版本（编译速度快）
./install.sh

# 构建 Release 版本（运行性能优化）
./install.sh --release
```

或者直接使用 Cargo 手动构建：
```bash
cd rust
cargo build --workspace
```

### 5.2 环境配置与授权
启动应用前，需在环境变量中配置模型 API 密钥（目前主推 Anthropic 体系）：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."

# 如需使用代理，可额外配置：
export ANTHROPIC_BASE_URL="https://your-proxy.com"
```

### 5.3 常用运行指令
编译完成后，生成的可执行文件默认位于 `rust/target/debug/claw`（Release 位于 `target/release/claw`）：

```bash
# 1. 启动交互式 REPL 会话 (可使用 Tab 补全及 /help 查看斜杠命令)
./rust/target/debug/claw

# 2. 单次任务执行 (One-shot Prompt)
./rust/target/debug/claw prompt "summarize src/main.rs"

# 3. 运行环境与权限健康诊断 (Health Check)
./rust/target/debug/claw doctor

# 4. JSON 格式输出（便于与自动化脚本集成）
./rust/target/debug/claw --output-format json prompt "list all tools"
```

### 5.4 运行一致性测试 (Mock Parity Harness)
如果你在做代码贡献并需要确保与原始 TypeScript/Python 逻辑行为一致，可以运行项目自带的端到端一致性脚本：

```bash
cd rust
# 启动包含清理环境与 Mock 服务的自动化测试脚本
./scripts/run_mock_parity_harness.sh
```
