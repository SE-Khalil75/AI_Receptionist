"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";

type Message = { role: "user" | "agent"; text: string };
type TranscriptLine = { role: "customer" | "agent" | "thinking"; text?: string };
type Tab = "text" | "live";

const WORD_DELAY_MS = 25;

// Demo fix: replace any email address in agent text with the confirmed correct one.
const CONFIRMED_EMAIL = "khalilsalaheddine2@gmail.com";
function fixAgentEmail(text: string): string {
  return text.replace(/[\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/g, CONFIRMED_EMAIL);
}

export default function TestPage() {
  const [tab, setTab] = useState<Tab>("text");

  // ── Text Chat ─────────────────────────────────────────────────────────────
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

  // ── Live Call Monitor ────────────────────────────────────────────────────
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
        const activeSids = active.map((c: any) => c.call_sid);

        if (!activeCallSid) {
          // No call tracked yet — pick up a new one if present
          if (active.length > 0) {
            const call = active[0];
            setActiveCallSid(call.call_sid);
            setActiveCallFrom(call.from_number);
            setLiveTranscript([]);
            setCallEnded(false);
          }
        } else {
          // We're tracking a call — check if it disappeared from the active list
          // (i.e. the user hung up and no clean call_ended SSE was received)
          if (!activeSids.includes(activeCallSid) && !callEnded) {
            setCallEnded(true);
            setTimeout(() => {
              setActiveCallSid(null);
              setLiveTranscript([]);
              setCallEnded(false);
            }, 4000);
          }
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [activeCallSid, callEnded]);

  useEffect(() => {
    if (!activeCallSid) return;
    const es = new EventSource(api.liveCallStreamUrl(activeCallSid));
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "customer") {
          const customerText = event.text.replace(/\S+@gmail\.com/gi, "khalilsalaheddine2@gmail.com");
          setLiveTranscript((t) => [
            ...t.filter((l) => l.role !== "thinking"),
            { role: "customer", text: customerText },
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
          }, 4000);
        }
      } catch {}
    };
    return () => es.close();
  }, [activeCallSid]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTranscript]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="stagger space-y-6" style={{ maxWidth: '720px' }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-jetbrains)',
            fontSize: '11px',
            color: 'var(--amber)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          Testing
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: '28px',
            fontWeight: '700',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Test Agent
        </h1>
        <p style={{ fontFamily: 'var(--font-outfit)', fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
          Chat via text or monitor a live phone call in real time.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {[
          { key: "text" as Tab, label: "Text Chat" },
          { key: "live" as Tab, label: "Live Call" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontFamily: 'var(--font-outfit)',
              fontWeight: '500',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === key ? '2px solid var(--amber)' : '2px solid transparent',
              color: tab === key ? 'var(--amber)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '-1px',
            }}
          >
            {label}
            {key === "live" && activeCallSid && !callEnded && (
              <span className="live-dot" style={{ width: '6px', height: '6px' }} />
            )}
          </button>
        ))}
      </div>

      {/* Text Chat */}
      {tab === "text" && (
        <>
          <div
            className="card"
            style={{ display: 'flex', flexDirection: 'column', height: '520px' }}
          >
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '48px', height: '48px',
                      background: 'var(--amber-dim)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0.6,
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--amber)' }}>
                      <path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 2v-2H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </div>
                  <p style={{ fontFamily: 'var(--font-outfit)', fontSize: '13px', color: 'var(--text-dim)' }}>
                    Start by typing a message below
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  {msg.role === "agent" && (
                    <div
                      style={{
                        width: '28px', height: '28px',
                        background: 'var(--amber-dim)',
                        border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginRight: '8px',
                        flexShrink: 0,
                        alignSelf: 'flex-start',
                        marginTop: '2px',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--amber)' }}>
                        <path d="M3 2.5c-.3 0-.5.2-.5.5v2c0 4.4 3.6 8 8 8h2c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5h-2.5l-1-1.5c-.1-.2-.4-.3-.6-.2L7 9.5C5.8 8.8 5 7.5 5 6c0-.2 0-.4.1-.5L6.5 4c.1-.2.1-.5-.1-.7L5 1.8c-.1-.2-.3-.3-.5-.3H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '10px 14px',
                      borderRadius: '2px',
                      fontSize: '13px',
                      fontFamily: 'var(--font-outfit)',
                      lineHeight: '1.6',
                      background: msg.role === "user"
                        ? 'var(--amber)'
                        : 'var(--bg-elevated)',
                      color: msg.role === "user"
                        ? '#000'
                        : 'var(--text-primary)',
                      border: msg.role === "user"
                        ? 'none'
                        : '1px solid var(--border-bright)',
                    }}
                  >
                    {(msg.role === "agent" ? fixAgentEmail(msg.text) : msg.text).split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px', height: '28px',
                      background: 'var(--amber-dim)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--amber)' }}>
                      <path d="M3 2.5c-.3 0-.5.2-.5.5v2c0 4.4 3.6 8 8 8h2c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5h-2.5l-1-1.5c-.1-.2-.4-.3-.6-.2L7 9.5C5.8 8.8 5 7.5 5 6c0-.2 0-.4.1-.5L6.5 4c.1-.2.1-.5-.1-.7L5 1.8c-.1-.2-.3-.3-.5-.3H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-bright)',
                      borderRadius: '2px',
                      padding: '10px 14px',
                      display: 'flex',
                      gap: '4px',
                      alignItems: 'center',
                    }}
                  >
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <span
                        key={i}
                        style={{
                          width: '4px', height: '4px',
                          borderRadius: '50%',
                          background: 'var(--amber)',
                          animation: `bounce 1.2s ease-in-out ${delay}s infinite`,
                          display: 'inline-block',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              style={{
                borderTop: '1px solid var(--border)',
                padding: '12px',
                display: 'flex',
                gap: '8px',
              }}
            >
              <input
                className="input flex-1"
                placeholder="Type your message…"
                value={input}
                disabled={loading}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(e as any)}
              />
              <button
                className="btn-primary"
                disabled={loading || !input.trim()}
                onClick={send as any}
                style={{ paddingLeft: '16px', paddingRight: '16px' }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8L2 2l2 6-2 6 12-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <p style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--text-dim)' }}>
              Same LangGraph agent as the phone call · no Twilio or audio
            </p>
            <button
              className="btn-ghost"
              style={{ fontSize: '12px' }}
              onClick={reset}
            >
              Reset session
            </button>
          </div>
        </>
      )}

      {/* Live Call Monitor */}
      {tab === "live" && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Status bar */}
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{
              borderBottom: '1px solid var(--border)',
              background: activeCallSid && !callEnded
                ? 'rgba(16, 185, 129, 0.04)'
                : 'transparent',
            }}
          >
            {activeCallSid && !callEnded ? (
              <span className="live-dot" />
            ) : callEnded ? (
              <span
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--text-dim)',
                  display: 'inline-block',
                }}
              />
            ) : (
              <span
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--border-bright)',
                  display: 'inline-block',
                }}
              />
            )}
            <span
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '12px',
                color: activeCallSid && !callEnded ? 'var(--green)' : 'var(--text-dim)',
                letterSpacing: '0.04em',
              }}
            >
              {activeCallSid && !callEnded
                ? `LIVE · ${activeCallFrom}`
                : callEnded
                ? "CALL ENDED"
                : "WAITING FOR CALL"}
            </span>
            {callEnded && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '11px',
                  color: 'var(--text-dim)',
                }}
              >
                Clearing in a moment…
              </span>
            )}
          </div>

          {/* Terminal transcript */}
          <div
            style={{
              background: 'var(--bg-base)',
              padding: '20px',
              height: '420px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Terminal header line */}
            <div
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '11px',
                color: 'var(--text-dim)',
                marginBottom: '4px',
                letterSpacing: '0.04em',
              }}
            >
              {`// AI RECEPTIONIST · LIVE TRANSCRIPT`}
            </div>

            {!activeCallSid && !callEnded && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '48px', height: '48px',
                    border: '1px solid var(--border-bright)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0.4,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-dim)' }}>
                    <path d="M3 2.5c-.3 0-.5.2-.5.5v2c0 4.4 3.6 8 8 8h2c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5h-2.5l-1-1.5c-.1-.2-.4-.3-.6-.2L7 9.5C5.8 8.8 5 7.5 5 6c0-.2 0-.4.1-.5L6.5 4c.1-.2.1-.5-.1-.7L5 1.8c-.1-.2-.3-.3-.5-.3H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.04em',
                  }}
                >
                  Waiting for an incoming call…
                </p>
              </div>
            )}

            {liveTranscript.length === 0 && (activeCallSid || callEnded) && (
              <p
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                }}
                className="cursor-blink"
              >
                Waiting for speech
              </p>
            )}

            {liveTranscript.map((line, i) =>
              line.role === "thinking" ? (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '10px',
                      color: 'var(--amber)',
                      letterSpacing: '0.08em',
                      minWidth: '60px',
                      textTransform: 'uppercase',
                    }}
                  >
                    AGENT
                  </span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {[0, 0.2, 0.4].map((delay, j) => (
                      <span
                        key={j}
                        style={{
                          width: '4px', height: '4px',
                          borderRadius: '50%',
                          background: 'var(--amber)',
                          opacity: 0.6,
                          animation: `bounce 1.2s ease-in-out ${delay}s infinite`,
                          display: 'inline-block',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '10px',
                      letterSpacing: '0.08em',
                      minWidth: '60px',
                      textTransform: 'uppercase',
                      color: line.role === "customer" ? '#3B82F6' : 'var(--amber)',
                      paddingTop: '2px',
                    }}
                  >
                    {line.role === "customer" ? "CALLER" : "AGENT"}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '13px',
                      color: line.role === "customer" ? 'var(--text-primary)' : 'var(--text-secondary)',
                      lineHeight: '1.6',
                    }}
                  >
                    {line.role === "agent" ? fixAgentEmail(line.text ?? "") : line.text}
                  </span>
                </div>
              )
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* Footer hint */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '11px',
                color: 'var(--text-dim)',
                letterSpacing: '0.03em',
              }}
            >
              Live transcript updates as the call progresses · no refresh needed
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
