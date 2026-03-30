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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Appointments</h1>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending_confirmation">Pending Confirmation</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="rescheduled">Rescheduled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Customer", "Phone", "Email", "Service", "Scheduled", "Duration", "Status", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No appointments found.
                </td>
              </tr>
            )}
            {data?.map((a: any) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{a.customer_name}</td>
                <td className="px-4 py-3 text-gray-500">{a.customer_phone}</td>
                <td className="px-4 py-3 text-gray-500">{a.customer_email || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{a.service || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {format(new Date(a.scheduled_at), "MMM d, yyyy HH:mm")}
                </td>
                <td className="px-4 py-3">{a.duration_minutes} min</td>
                <td className="px-4 py-3">
                  <span className={STATUS_BADGE[a.status] ?? "badge-gray"}>
                    {a.status?.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {(a.status === "confirmed" || a.status === "pending_confirmation") && (
                    <button
                      className="text-xs text-red-600 hover:underline"
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
  );
}
