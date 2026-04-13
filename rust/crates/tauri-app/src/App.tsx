import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BookOpen, Code2, Gamepad2, Plus, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

type ToolExec = {
  name: string;
  command: string;
  result?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  tools: ToolExec[];
};

type ChatEventPayload =
  | { type: "TextChunk"; payload: string }
  | { type: "ToolStart"; payload: { name: string; command: string } }
  | { type: "ToolResult"; payload: string }
  | { type: "TurnEnd" };

type SettingsPayload = {
  workspaceRoot: string;
  effectiveModel: string;
  modelFromConfig: string | null;
  modelFromEnv: string | null;
  anthropicApiKeySet: boolean;
  openaiApiKeySet: boolean;
  xaiApiKeySet: boolean;
  dashscopeApiKeySet: boolean;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [model, setModel] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickActions = useMemo(
    () => [
      {
        icon: Code2,
        title: "应用开发",
        description: "开发一个多语言学习的教学学习网站",
      },
      {
        icon: BookOpen,
        title: "项目理解",
        description: "分析项目仓库，生成一份 Code Wiki",
      },
      {
        icon: Gamepad2,
        title: "游戏创意",
        description: "创作一个像素风的双人机甲对战游戏",
      },
      {
        icon: Wrench,
        title: "工具脚本",
        description: "编写自动化脚本工具，采集并处理数据",
      },
    ],
    [],
  );

  const modelOptions = useMemo(
    () => [
      { label: "opus", value: "opus" },
      { label: "sonnet", value: "sonnet" },
      { label: "haiku", value: "haiku" },
      { label: "claude-opus-4-6", value: "claude-opus-4-6" },
      { label: "claude-sonnet-4-6", value: "claude-sonnet-4-6" },
      { label: "claude-haiku-4-5-20251213", value: "claude-haiku-4-5-20251213" },
    ],
    [],
  );

  async function refreshSettings() {
    const payload = (await invoke("get_settings")) as SettingsPayload;
    setSettings(payload);
    setModel(payload.effectiveModel);
  }

  async function updateModel(nextModel: string) {
    setModel(nextModel);
    try {
      await invoke("set_model", { model: nextModel });
      await refreshSettings();
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const unlisten = listen<ChatEventPayload>("chat_event", (event) => {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (!lastMsg || lastMsg.role === "user") {
          return prev;
        }

        const updated: Message = {
          ...lastMsg,
          tools: [...lastMsg.tools].map((tool) => ({ ...tool })),
        };

        const ev = event.payload;
        if (ev.type === "TextChunk") {
          updated.content += ev.payload;
        } else if (ev.type === "ToolStart") {
          updated.tools.push({ name: ev.payload.name, command: ev.payload.command });
        } else if (ev.type === "ToolResult") {
          const lastTool = updated.tools[updated.tools.length - 1];
          if (lastTool) {
            lastTool.result = ev.payload;
          }
        } else if (ev.type === "TurnEnd") {
          setLoading(false);
        }

        return [...prev.slice(0, -1), updated];
      });
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    refreshSettings().catch((err) => console.error(err));
  }, []);

  async function sendPrompt() {
    if (!input.trim() || loading) return;

    if (input.trim() === "/clear") {
      setMessages([]);
      setInput("");
      return;
    }

    const userMsg: Message = { role: "user", content: input, tools: [] };
    const asstMsg: Message = { role: "assistant", content: "", tools: [] };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setLoading(true);

    try {
      await invoke("invoke_prompt", { prompt: userMsg.content });
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (!lastMsg || lastMsg.role === "user") {
          return prev;
        }
        const updated: Message = {
          ...lastMsg,
          tools: [...lastMsg.tools].map((tool) => ({ ...tool })),
          content: `${lastMsg.content}\n\n**Error:** ${String(err)}`,
        };
        return [...prev.slice(0, -1), updated];
      });
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900">
      <aside className="w-[280px] border-r border-slate-200 bg-white hidden md:flex flex-col">
        <div className="p-4">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
            <span>Code</span>
          </div>
        </div>

        <div className="px-4 pb-2">
          <button className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium hover:bg-slate-100">
            新建任务
          </button>
        </div>

        <div className="px-4 pb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2">模型</div>
          <select
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={model}
            onChange={(e) => updateModel(e.currentTarget.value)}
          >
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-slate-500">
            {settings?.anthropicApiKeySet ? "ANTHROPIC_API_KEY 已设置" : "ANTHROPIC_API_KEY 未设置"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500">项目列表</div>
          <div className="space-y-1">
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm truncate">
              claw-code
            </button>
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-sm truncate">
              tauri-desktop-app
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <div className="max-w-4xl w-full flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <div className="text-[42px] leading-tight font-semibold">
                    <span className="text-emerald-500">Code</span> with Claw
                  </div>
                  <span className="text-xs font-semibold rounded border border-slate-200 bg-white px-2 py-1 text-slate-500">
                    BETA
                  </span>
                </div>
                <div className="mt-2 text-slate-500">全流程开发任务，交给 Claw 搞定</div>

                <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                  {quickActions.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.title}
                        type="button"
                        className="text-left rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition"
                        onClick={() => setInput(item.description)}
                      >
                        <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                          <Icon size={20} className="text-slate-700" />
                        </div>
                        <div className="mt-4 font-semibold">{item.title}</div>
                        <div className="mt-1 text-sm text-slate-500">{item.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <main className="p-6 flex flex-col gap-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col max-w-4xl w-full mx-auto ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`w-full rounded-2xl border ${
                      msg.role === "user"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-200 text-slate-900"
                    } p-4 shadow-sm`}
                  >
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose max-w-none">
                        <ReactMarkdown
                          components={{
                            code({ inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || "");
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus as any}
                                  language={match[1]}
                                  PreTag="div"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, "")}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {msg.content || (loading ? "..." : "")}
                        </ReactMarkdown>

                        {msg.tools.map((tool, j) => (
                          <div
                            key={j}
                            className="mt-4 rounded-xl border border-slate-200 bg-slate-50"
                          >
                            <div className="px-3 py-2 bg-white font-mono text-sm font-semibold border-b border-slate-200 flex justify-between rounded-t-xl">
                              <span>{tool.name}</span>
                              <span className="text-slate-500">Tool</span>
                            </div>
                            <div className="p-3 font-mono text-sm overflow-x-auto text-emerald-700">
                              $ {tool.command}
                            </div>
                            {tool.result && (
                              <div className="px-3 pb-3 font-mono text-xs overflow-x-auto text-slate-600">
                                {tool.result}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </main>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200">
          <form
            className="max-w-4xl mx-auto w-full"
            onSubmit={(e) => {
              e.preventDefault();
              sendPrompt();
            }}
          >
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <textarea
                className="w-full px-5 pt-4 pb-2 min-h-[84px] max-h-[240px] resize-none rounded-2xl outline-none text-sm placeholder:text-slate-400"
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendPrompt();
                  }
                }}
                placeholder="帮你写代码、调试 Bug、优化性能等开发工作，交付生产级代码产物。"
              />

              <div className="px-4 pb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    value={model}
                    onChange={(e) => updateModel(e.currentTarget.value)}
                  >
                    {modelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
                  >
                    <Plus size={18} className="text-slate-600" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:bg-emerald-300 hover:bg-emerald-700 transition"
                >
                  {loading ? "发送中" : "发送"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
