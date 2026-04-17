/**
 * Appointment confirmation/cancellation page.
 *
 * The email links point here (localhost:3000/confirm/...).
 * Calls the backend server-side, renders a styled result page.
 */
import Link from "next/link";
import { redirect } from "next/navigation";

interface Props {
  params: { id: string };
  searchParams: { action?: string; token?: string };
}

interface BackendResult {
  ok: boolean;
  data: Record<string, any> | null;
  errorDetail?: string;
}

async function callBackend(id: string, action: string, token: string): Promise<BackendResult> {
  const backendUrl = process.env.INTERNAL_API_URL || "http://localhost:8000";
  const url = `${backendUrl}/confirm/${id}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}&format=json`;

  try {
    const res = await fetch(url, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "AI-Receptionist-Frontend/1.0",
      },
      cache: "no-store",
    });

    // Try to parse as JSON first; fall back gracefully if the backend
    // hasn't been restarted yet and still returns HTML.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, data: null, errorDetail: data?.detail ?? `HTTP ${res.status}` };
      }
      return { ok: true, data };
    }

    // HTML response from old backend — infer result from status code
    const html = await res.text();
    if (!res.ok) {
      return { ok: false, data: null, errorDetail: `HTTP ${res.status}` };
    }
    const isConfirmed = html.includes("Confirmed") || action === "confirm";
    const isCancelled = html.includes("Cancelled") || action === "cancel";
    return {
      ok: true,
      data: { status: isConfirmed ? "confirmed" : isCancelled ? "cancelled" : "ok" },
    };
  } catch (err: any) {
    return { ok: false, data: null, errorDetail: err?.message ?? "Network error" };
  }
}

export default async function ConfirmPage({ params, searchParams }: Props) {
  const { id } = params;
  const action = searchParams.action ?? "";
  const token = searchParams.token ?? "";

  if (!action || !token) redirect("/");

  const { ok, data, errorDetail } = await callBackend(id, action, token);

  const success = ok && (
    data?.status === "confirmed" ||
    data?.status === "already_confirmed" ||
    data?.status === "ok"
  );
  const cancelled = ok && (
    data?.status === "cancelled" ||
    data?.status === "already_cancelled"
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base, #0a0a0a)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--bg-card, #111)",
          border: `1px solid ${
            success
              ? "rgba(16,185,129,0.25)"
              : cancelled
              ? "rgba(239,68,68,0.25)"
              : "rgba(255,255,255,0.08)"
          }`,
          borderRadius: "8px",
          padding: "48px 40px",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            margin: "0 auto 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: success
              ? "rgba(16,185,129,0.12)"
              : cancelled
              ? "rgba(239,68,68,0.12)"
              : "rgba(255,255,255,0.06)",
            border: `1px solid ${
              success
                ? "rgba(16,185,129,0.3)"
                : cancelled
                ? "rgba(239,68,68,0.3)"
                : "rgba(255,255,255,0.1)"
            }`,
          }}
        >
          {success ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : cancelled ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" />
              <path
                d="M12 8v4m0 4h.01"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: "22px",
            fontWeight: "700",
            color: success ? "#10b981" : cancelled ? "#ef4444" : "#f59e0b",
            marginBottom: "12px",
            letterSpacing: "-0.02em",
          }}
        >
          {success
            ? "Appointment Confirmed!"
            : cancelled
            ? "Appointment Cancelled"
            : "Something went wrong"}
        </h1>

        {/* Details block (only when JSON data is available) */}
        {success && data && data.customer_name && (
          <>
            <p
              style={{
                color: "#9ca3af",
                fontSize: "15px",
                marginBottom: "28px",
                lineHeight: "1.6",
              }}
            >
              Thank you,{" "}
              <span style={{ color: "#f3f4f6", fontWeight: "600" }}>
                {data.customer_name}
              </span>
              ! Your appointment is all set.
            </p>

            <div
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.15)",
                borderRadius: "6px",
                padding: "20px 24px",
                textAlign: "left",
                marginBottom: "32px",
              }}
            >
              {[
                { label: "Service", value: data.service || "Appointment" },
                { label: "Date & Time", value: data.scheduled_display },
                { label: "Duration", value: data.duration_minutes ? `${data.duration_minutes} minutes` : null },
                { label: "Business", value: data.business_name },
              ]
                .filter((r) => r.value)
                .map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: "14px",
                        color: "#f3f4f6",
                        fontWeight: "500",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        {success && (!data || !data.customer_name) && (
          <p
            style={{
              color: "#9ca3af",
              fontSize: "15px",
              marginBottom: "32px",
              lineHeight: "1.6",
            }}
          >
            Your appointment has been confirmed. We look forward to seeing you!
          </p>
        )}

        {cancelled && (
          <p
            style={{
              color: "#9ca3af",
              fontSize: "15px",
              marginBottom: "32px",
              lineHeight: "1.6",
            }}
          >
            Your appointment has been cancelled.
            <br />
            Give us a call if you'd like to reschedule.
          </p>
        )}

        {!success && !cancelled && (
          <p
            style={{
              color: "#9ca3af",
              fontSize: "15px",
              marginBottom: "32px",
              lineHeight: "1.6",
            }}
          >
            We couldn't process your request. The link may be invalid or expired.
            {errorDetail && (
              <span
                style={{
                  display: "block",
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#6b7280",
                  fontFamily: "monospace",
                }}
              >
                {errorDetail}
              </span>
            )}
          </p>
        )}

        {/* Back link */}
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            background: success ? "#10b981" : "transparent",
            color: success ? "#fff" : "#9ca3af",
            border: success ? "none" : "1px solid rgba(255,255,255,0.12)",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: "600",
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Back to Dashboard
        </Link>
      </div>

      <p style={{ marginTop: "24px", fontSize: "12px", color: "#374151" }}>
        AI Receptionist · Powered by AppointEase
      </p>
    </div>
  );
}
