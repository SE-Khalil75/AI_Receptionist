"use client";
import useSWR from "swr";
import Link from "next/link";
import { api } from "@/lib/api";
import { format } from "date-fns";

const OUTCOME_BADGE: Record<string, string> = {
  appointment_booked: "badge-green",
  question_answered:  "badge-blue",
  no_action:          "badge-gray",
};

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="stat-card">
      <div
        style={{
          fontFamily: 'var(--font-jetbrains)',
          fontSize: '10px',
          color: 'var(--text-dim)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: '12px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-syne)',
          fontSize: '36px',
          fontWeight: '700',
          color: accent ?? 'var(--text-primary)',
          lineHeight: '1',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: 'var(--font-outfit)',
            fontSize: '12px',
            color: 'var(--text-dim)',
            marginTop: '6px',
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data: BusinessRes } = useSWR("Business", () => api.Business.get());
  const Business = BusinessRes?.data;

  const { data: callsRes } = useSWR("calls", () => api.calls.list());
  const calls = callsRes?.data ?? [];

  const { data: apptRes } = useSWR("appointments", () => api.appointments.list());
  const appointments = apptRes?.data ?? [];

  const confirmedAppts = appointments.filter((a: any) => a.status === "confirmed").length;
  const pendingAppts   = appointments.filter((a: any) => a.status === "pending_confirmation").length;
  const bookedCalls    = calls.filter((c: any) => c.outcome === "appointment_booked").length;

  return (
    <div className="stagger space-y-8">
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
            Command Center
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-syne)',
              fontSize: '28px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: '1.1',
            }}
          >
            {Business?.name ?? "Dashboard"}
          </h1>
          {Business?.phone_number && (
            <div
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: '12px',
                color: 'var(--text-dim)',
                marginTop: '4px',
              }}
            >
              {Business.phone_number}
            </div>
          )}
        </div>
        <Link
          href="/settings"
          className="btn-secondary"
          style={{ marginTop: '4px' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8 1.5v1M8 13.5v1M1.5 8h-1M15.5 8h-1M3.4 3.4l-.7-.7M13.3 13.3l-.7-.7M3.4 12.6l-.7.7M13.3 2.7l-.7.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Settings
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Calls" value={calls?.length ?? 0} sub="all time" />
        <StatCard label="Appointments Booked" value={bookedCalls} sub="via AI" accent="var(--amber)" />
        <StatCard label="Confirmed" value={confirmedAppts} sub="upcoming" accent="var(--green)" />
        <StatCard label="Pending" value={pendingAppts} sub="awaiting email" />
      </div>

      {/* Recent calls */}
      <div className="card">
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                fontFamily: 'var(--font-syne)',
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text-primary)',
              }}
            >
              Recent Calls
            </div>
            <span
              className="badge-gray"
              style={{ fontFamily: 'var(--font-jetbrains)' }}
            >
              {calls?.length ?? 0}
            </span>
          </div>
          <Link
            href="/settings"
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '11px',
              color: 'var(--text-dim)',
              textDecoration: 'none',
              letterSpacing: '0.04em',
            }}
          >
            VIEW ALL →
          </Link>
        </div>

        <div>
          {(!calls || calls.length === 0) && (
            <div
              className="px-6 py-12 text-center"
              style={{ color: 'var(--text-dim)', fontSize: '13px' }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4 }}>📞</div>
              No calls recorded yet
            </div>
          )}
          {calls?.slice(0, 8).map((call: any, i: number) => (
            <div
              key={call.id}
              className="px-6 py-4 flex items-center gap-4"
              style={{
                borderBottom: i < Math.min(calls.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Phone icon */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-dim)' }}>
                  <path d="M3 2.5c-.3 0-.5.2-.5.5v2c0 4.4 3.6 8 8 8h2c.3 0 .5-.2.5-.5v-2c0-.3-.2-.5-.5-.5h-2.5l-1-1.5c-.1-.2-.4-.3-.6-.2L7 9.5C5.8 8.8 5 7.5 5 6c0-.2 0-.4.1-.5L6.5 4c.1-.2.1-.5-.1-.7L5 1.8c-.1-.2-.3-.3-.5-.3H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {call.caller_number || "Unknown"}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-outfit)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {call.transcript?.slice(0, 80) || "No transcript"}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className={OUTCOME_BADGE[call.outcome] ?? "badge-gray"}>
                  {call.outcome?.replace(/_/g, " ") || "unknown"}
                </span>
                <div
                  style={{
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: '11px',
                    color: 'var(--text-dim)',
                    minWidth: '60px',
                    textAlign: 'right',
                  }}
                >
                  {call.started_at
                    ? format(new Date(call.started_at), "MMM d, HH:mm")
                    : "—"}
                </div>
                {call.duration_seconds != null && (
                  <div
                    style={{
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '11px',
                      color: 'var(--text-dim)',
                      minWidth: '36px',
                      textAlign: 'right',
                    }}
                  >
                    {call.duration_seconds}s
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/appointments"
          className="card p-5 flex items-center gap-4"
          style={{ textDecoration: 'none', transition: 'border-color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-bright)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ color: '#3B82F6' }}>
              <rect x="1.5" y="3" width="13" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 1.5V4M11 1.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-syne)', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Manage Appointments
            </div>
            <div style={{ fontFamily: 'var(--font-outfit)', fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
              {confirmedAppts + pendingAppts} upcoming
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>

        <Link
          href="/test"
          className="card p-5 flex items-center gap-4"
          style={{ textDecoration: 'none', transition: 'border-color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-bright)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              background: 'var(--amber-dim)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--amber)' }}>
              <path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 2v-2H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-syne)', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Test Agent
            </div>
            <div style={{ fontFamily: 'var(--font-outfit)', fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
              Chat or monitor live calls
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </div>
  );
}
