"use client";
import useSWR from "swr";
import Link from "next/link";
import { api } from "@/lib/api";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="card p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
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
  const pendingAppts = appointments.filter((a: any) => a.status === "pending_confirmation").length;

  const outcomes = (calls ?? []).reduce((acc: any, c: any) => {
    acc[c.outcome] = (acc[c.outcome] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {Business && (
            <p className="text-sm text-gray-500 mt-1">{Business.name}</p>
          )}
        </div>
        <Link href="/settings" className="btn-primary">
          Business Settings
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Calls" value={calls?.length ?? "—"} sub="all time" />
        <StatCard label="Appointments Booked" value={outcomes["appointment_booked"] ?? 0} sub="via AI" />
        <StatCard label="Confirmed" value={confirmedAppts} sub="upcoming" />
        <StatCard label="Pending Confirmation" value={pendingAppts} sub="awaiting email" />
      </div>

      {/* Recent calls */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Recent Calls</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {calls?.length === 0 && (
            <p className="p-6 text-sm text-gray-400">No calls yet.</p>
          )}
          {calls?.slice(0, 10).map((call: any) => (
            <div key={call.id} className="px-6 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {call.caller_number || "Unknown"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {call.transcript?.slice(0, 100) || "No transcript"}
                </p>
              </div>
              <span
                className={
                  call.outcome === "appointment_booked"
                    ? "badge-green"
                    : call.outcome === "question_answered"
                    ? "badge-blue"
                    : "badge-gray"
                }
              >
                {call.outcome?.replace(/_/g, " ") || "unknown"}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
