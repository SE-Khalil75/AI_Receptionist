"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";

type Message = { role: "user" | "agent"; text: string };
type TranscriptLine = { role: "customer" | "agent" | "thinking"; text?: string };
type Tab = "text" | "live";

const WORD_DELAY_MS = 25;

export default function TestPage() {
  const [tab, setTab] = useState<Tab>("text");

  // ── Text Chat ───────────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wordQueueRef = useRef<string[]>([]);
  const isDrippingRef = useRef(false);

  async function drip() {
    if (isDrippingRef.current) return;
    isDrippingRef.current = true;
    while (wordQueueRef.current.length > 0) {
      const word = wordQueueRef.current.shift()!;
      setMessages((m) => {
        const updated = [...m];
        const last = updated[updated.length - 1];
        if (last?.role === "agent") {
          updated[updated.length - 1] = { ...last, text: last.text + word };
        }
        return updated;
      });
      await new Promise<void>((r) => setTimeout(r, WORD_DELAY_MS));
    }
    isDrippingRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function enqueue(text: string) {
    const formatted = text.replace(/([.!?]) +(?=[A-Z])/g, "$1\n\n");
    const words = formatted.match(/\S+\s*|\s+/g) ?? [formatted];
    wordQueueRef.current.push(...words);
    drip();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const response = await api.testAgentStream(userMsg, sessionIdRef.current);
      if (!response.ok) throw new Error(`API error ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let firstToken = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }

          if (evt.type === "token") {
            if (firstToken) {
              firstToken = false;
              setLoading(false);
              setMessages((m) => [...m, { role: "agent", text: "" }]);
            }
            enqueue(evt.token);
          } else if (evt.type === "done") {
            if (evt.should_end) sessionIdRef.current = `session-${Date.now()}`;
          } else if (evt.type === "error") {
            setMessages((m) => [...m, { role: "agent", text: `Error: ${evt.message}` }]);
          }
        }
      }
    } catch (err: any) {
      setMessages((m) => [...m, { role: "agent", text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function reset() {
    wordQueueRef.current = [];
    isDrippingRef.current = false;
    setMessages([]);
    setLoading(false);
    sessionIdRef.current = `session-${Date.now()}`;
  }

  // ── Live Call Monitor ───────────────────────────────────────────────────────
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [activeCallFrom, setActiveCallFrom] = useState<string>("");
  const [liveTranscript, setLiveTranscript] = useState<TranscriptLine[]>([]);
  const [callEnded, setCallEnded] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.activeCalls();
        const active: any[] = res.data ?? [];
        if (active.length > 0 && !activeCallSid) {
          const call = active[0];
          setActiveCallSid(call.call_sid);
          setActiveCallFrom(call.from_number);
          setLiveTranscript([]);
          setCallEnded(false);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeCallSid]);

  useEffect(() => {
    if (!activeCallSid) return;

    const es = new EventSource(api.liveCallStreamUrl(activeCallSid));

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "customer") {
          setLiveTranscript((t) => [
            ...t.filter((l) => l.role !== "thinking"),
            { role: "customer", text: event.text },
          ]);
        } else if (event.type === "thinking") {
          setLiveTranscript((t) => {
            if (t[t.length - 1]?.role === "thinking") return t;
            return [...t, { role: "thinking" }];
          });
        } else if (event.type === "agent") {
          setLiveTranscript((t) => [
            ...t.filter((l) => l.role !== "thinking"),
            { role: "agent", text: event.text },
          ]);
        } else if (event.type === "call_ended") {
          setCallEnded(true);
          es.close();
          setTimeout(() => {
            setActiveCallSid(null);
            setLiveTranscript([]);
            setCallEnded(false);
          }, 8000);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, [activeCallSid]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTranscript]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Test Agent</h1>
        <p className="text-sm text-gray-500 mt-1">
          Chat via text or monitor a live phone call in real time.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("text")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "text"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Text Chat
        </button>
        <button
          onClick={() => setTab("live")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
            tab === "live"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Live Call
          {activeCallSid && !callEnded && (
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Text Chat tab */}
      {tab === "text" && (
        <>
          <div className="card flex flex-col h-[520px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-sm text-gray-400 mt-16">
                  Start by typing a message below.
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={clsx(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={clsx(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-brand-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    )}
                  >
                    {msg.text.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-400">
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t border-gray-100 p-3 flex gap-2">
              <input
                className="input flex-1"
                placeholder="Type your message…"
                value={input}
                disabled={loading}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !input.trim()}
              >
                Send
              </button>
            </form>
          </div>

          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-400">
              Same LangGraph agent as the phone call — no Twilio or audio.
            </p>
            <button className="btn-secondary text-xs" onClick={reset}>
              Reset session
            </button>
          </div>
        </>
      )}

      {/* Live Call tab */}
      {tab === "live" && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "inline-block w-2.5 h-2.5 rounded-full",
                activeCallSid && !callEnded ? "bg-green-500 animate-pulse" : "bg-gray-300"
              )}
            />
            <span className="font-medium text-gray-800">
              {activeCallSid && !callEnded
                ? `Active call — ${activeCallFrom}`
                : callEnded
                ? "Call ended"
                : "No active call"}
            </span>
            {callEnded && (
              <span className="ml-auto text-xs text-gray-400">Clearing in a moment…</span>
            )}
          </div>

          <p className="text-xs text-gray-400">
            When a phone call comes in, the live transcript appears here word-by-word. Use this to check if the problem is with your speech, the transcription (STT), or the agent's understanding.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto space-y-3 font-mono text-sm">
            {!activeCallSid && !callEnded && (
              <p className="text-gray-400 text-xs text-center mt-16">
                Waiting for an incoming or outbound call…
              </p>
            )}
            {liveTranscript.length === 0 && (activeCallSid || callEnded) && (
              <p className="text-gray-400 text-xs">Waiting for speech…</p>
            )}
            {liveTranscript.map((line, i) =>
              line.role === "thinking" ? (
                <div key={i} className="flex gap-2 items-center text-gray-400 text-xs">
                  <span className="font-semibold text-purple-400 shrink-0">Agent</span>
                  <span className="flex gap-1">
                    <span className="animate-bounce [animation-delay:-0.3s]">.</span>
                    <span className="animate-bounce [animation-delay:-0.15s]">.</span>
                    <span className="animate-bounce">.</span>
                  </span>
                </div>
              ) : (
                <div
                  key={i}
                  className={clsx(
                    "flex gap-2",
                    line.role === "customer" ? "text-blue-800" : "text-gray-700"
                  )}
                >
                  <span
                    className={clsx(
                      "font-semibold shrink-0",
                      line.role === "customer" ? "text-blue-500" : "text-purple-500"
                    )}
                  >
                    {line.role === "customer" ? "You" : "Agent"}
                  </span>
                  <span>{line.text}</span>
                </div>
              )
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
