const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Single-business API ───────────────────────────────────────────────────────

export const api = {
  Business: {
    get: () => req<any>("/business"),
    update: (data: any) =>
      req<any>("/business", { method: "PATCH", body: JSON.stringify(data) }),
  },

  documents: {
    list: () => req<any>("/business/documents"),
    add: (data: any) =>
      req<any>("/business/documents", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    upload: async (file: File): Promise<any> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/business/documents/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
      }
      return res.json();
    },
    delete: (docId: string) =>
      req<any>(`/business/documents/${docId}`, { method: "DELETE" }),
  },

  calls: {
    list: () => req<any>("/business/calls"),
  },

  appointments: {
    list: (status?: string) =>
      req<any>(`/appointments${status ? `?status=${status}` : ""}`),
    slots: (date: string) => req<any>(`/appointments/slots?date=${date}`),
    create: (data: any) =>
      req<any>("/appointments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      req<any>(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Text-mode test (no phone call needed) – non-streaming fallback
  testAgent: async (message: string, sessionId: string = "default") =>
    req<any>("/test/agent", {
      method: "POST",
      body: JSON.stringify({ message, session_id: sessionId }),
    }),

  // Streaming version – returns a raw Response whose body is an SSE stream
  testAgentStream: (message: string, sessionId: string = "default"): Promise<Response> =>
    fetch(`${BASE}/test/agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId }),
    }),

  resetSession: (sessionId: string) =>
    req<any>(`/test/agent/${sessionId}`, { method: "DELETE" }),

  // Outbound call – Twilio calls the given phone number and connects to the AI
  callOutbound: (to: string) =>
    req<any>("/call/outbound", { method: "POST", body: JSON.stringify({ to }) }),

  // Active calls (currently on-the-phone)
  activeCalls: () => req<any>("/calls/active"),

  // URL for live transcript SSE stream
  liveCallStreamUrl: (callSid: string) => `${BASE}/calls/live/${callSid}`,
};
