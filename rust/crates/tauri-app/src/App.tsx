import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const unlisten = listen<ChatEventPayload>("chat_event", (event) => {
      setMessages((prev) => {
        const newMsgs = [...prev];
        const lastMsg = newMsgs[newMsgs.length - 1];

        if (!lastMsg || lastMsg.role === "user") {
          return prev;
        }

        const ev = event.payload;
        if (ev.type === "TextChunk") {
          lastMsg.content += ev.payload;
        } else if (ev.type === "ToolStart") {
          lastMsg.tools.push({ name: ev.payload.name, command: ev.payload.command });
        } else if (ev.type === "ToolResult") {
          const lastTool = lastMsg.tools[lastMsg.tools.length - 1];
          if (lastTool) {
            lastTool.result = ev.payload;
          }
        } else if (ev.type === "TurnEnd") {
          setLoading(false);
        }

        return newMsgs;
      });
    });

    return () => {
      unlisten.then(f => f());
    };
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
      await invoke("invoke_prompt", { sessionId: "default", prompt: userMsg.content });
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const newMsgs = [...prev];
        const lastMsg = newMsgs[newMsgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          lastMsg.content += `\n\n**Error:** ${err}`;
        }
        return newMsgs;
      });
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h1 className="text-lg font-bold">Claw Code</h1>
          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Recent Sessions</div>
          {/* Placeholder for sessions */}
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm truncate">
            Fix Tauri configuration...
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm truncate">
            Implement Chat UI...
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 md:hidden">
          <h1 className="text-xl font-bold">Claw Code</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col max-w-3xl w-full mx-auto ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`p-4 rounded-xl ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 shadow-sm"} w-full`}>
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="prose dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      code({node, inline, className, children, ...props}: any) {
                        const match = /language-(\w+)/.exec(className || '')
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus as any}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        )
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>

                  {msg.tools.map((tool, j) => (
                    <div key={j} className="mt-4 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900">
                      <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 font-mono text-sm font-bold border-b border-gray-200 dark:border-gray-700 flex justify-between">
                        <span>{tool.name}</span>
                        <span className="text-gray-500">Tool execution</span>
                      </div>
                      <div className="p-3 font-mono text-sm overflow-x-auto text-blue-600 dark:text-blue-400">
                        $ {tool.command}
                      </div>
                      {tool.result && (
                        <div className="px-3 pb-3 font-mono text-xs overflow-x-auto text-gray-600 dark:text-gray-400">
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

      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <form
          className="max-w-3xl mx-auto flex gap-2 w-full relative"
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt();
          }}
        >
          <textarea
            className="flex-1 px-4 py-3 min-h-[52px] max-h-[200px] border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 resize-none shadow-sm"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendPrompt();
              }
            }}
            placeholder="Ask Claw Code..."
          />
          <button 
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 bottom-2 p-2 bg-blue-600 disabled:bg-blue-400 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </form>
      </div>
    </div>
    </div>
  );
}

export default App;
