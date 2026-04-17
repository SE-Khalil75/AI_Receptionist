"use client";
import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { api } from "@/lib/api";

const STATUS_BADGE: Record<string, string> = {
  confirmed:            "badge-green",
  pending_confirmation: "badge-yellow",
  cancelled:            "badge-red",
  rescheduled:          "badge-yellow",
  completed:            "badge-gray",
  no_show:              "badge-red",
};

const STATUSES = [
  { value: "",                     label: "All Statuses" },
  { value: "pending_confirmation", label: "Pending" },
  { value: "confirmed",            label: "Confirmed" },
  { value: "cancelled",            label: "Cancelled" },
  { value: "rescheduled",          label: "Rescheduled" },
  { value: "completed",            label: "Completed" },
];

export default function AppointmentsPage() {
  const [statusFilter, setStatusFilter] = useState("");

  const { data, mutate } = useSWR(
    ["appts", statusFilter],
    () => api.appointments.list(statusFilter || undefined).then((r) => r.data)
  );

  async function cancel(id: string) {
    if (!confirm("Cancel this appointment?")) return;
    await api.appointments.update(id, { status: "cancelled" });
    mutate();
  }

  return (
    <div className="stagger space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
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
            Schedule
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
            Appointments
          </h1>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
          <div style={{ position: 'relative' }}>
            <select
              className="input pr-8"
              style={{ appearance: 'none', cursor: 'pointer', minWidth: '160px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{
                position: 'absolute', right: '10px', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-dim)',
                pointerEvents: 'none',
              }}
            >
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Count summary */}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains)',
          fontSize: '12px',
          color: 'var(--text-dim)',
        }}
      >
        {data ? `${data.length} appointment${data.length !== 1 ? 's' : ''} found` : 'Loading…'}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {["Customer", "Phone", "Email", "Service", "Scheduled", "Duration", "Status", ""].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}
                  >
                    No appointments found.
                  </td>
                </tr>
              )}
              {data?.map((a: any) => (
                <tr key={a.id}>
                  <td className="primary">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '24px', height: '24px',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-bright)',
                          borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', color: 'var(--text-dim)',
                          fontFamily: 'var(--font-syne)',
                          fontWeight: '600',
                          flexShrink: 0,
                        }}
                      >
                        {(a.customer_name?.[0] ?? '?').toUpperCase()}
                      </div>
                      {a.customer_name}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px' }}>
                      {a.customer_phone || "—"}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px' }}>{a.customer_email || "—"}</td>
                  <td>
                    {a.service ? (
                      <span
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-bright)',
                          borderRadius: '2px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-outfit)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {a.service}
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {format(new Date(a.scheduled_at), "MMM d, yyyy")}
                    </span>
                    <br />
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--text-dim)' }}>
                      {format(new Date(a.scheduled_at), "HH:mm")}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px' }}>
                      {a.duration_minutes}m
                    </span>
                  </td>
                  <td>
                    <span className={STATUS_BADGE[a.status] ?? "badge-gray"}>
                      {a.status?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    {(a.status === "confirmed" || a.status === "pending_confirmation") && (
                      <button
                        className="btn-danger"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => cancel(a.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
