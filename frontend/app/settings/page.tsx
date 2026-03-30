"use client";
import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const { data: BusinessRes, mutate: mutateBusiness } = useSWR("Business", () => api.Business.get());
  const Business = BusinessRes?.data;

  const { data: docsRes, mutate: mutateDocs } = useSWR("docs", () => api.documents.list());
  const docs = docsRes?.data ?? [];

  const { data: callsRes } = useSWR("calls", () => api.calls.list());
  const calls = callsRes?.data ?? [];

  const [docForm, setDocForm] = useState({ title: "", content: "" });
  const [addingDoc, setAddingDoc] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);

  // File upload
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Business settings edit
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: "", system_prompt: "", slot_duration_minutes: 60 });
  const [savingSettings, setSavingSettings] = useState(false);

  function startEditSettings() {
    setSettingsForm({
      name: Business?.name ?? "",
      system_prompt: Business?.system_prompt ?? "",
      slot_duration_minutes: Business?.slot_duration_minutes ?? 60,
    });
    setEditingSettings(true);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.Business.update(settingsForm);
      await mutateBusiness();
      setEditingSettings(false);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddDoc(e: React.FormEvent) {
    e.preventDefault();
    setSavingDoc(true);
    try {
      await api.documents.add(docForm);
      await mutateDocs();
      setDocForm({ title: "", content: "" });
      setAddingDoc(false);
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setUploadError(null);
    try {
      await api.documents.upload(file);
      await mutateDocs();
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm("Delete this document?")) return;
    await api.documents.delete(docId);
    mutateDocs();
  }

  if (!Business) return <p className="text-gray-400">Loading…</p>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{Business.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {Business.phone_number || "No Twilio number configured"}
          </p>
        </div>
        {!editingSettings && (
          <button className="btn-secondary" onClick={startEditSettings}>
            Edit Settings
          </button>
        )}
      </div>

      {/* Edit Settings Form */}
      {editingSettings && (
        <form onSubmit={handleSaveSettings} className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Business Settings</h2>
          <div>
            <label className="label">Business Name</label>
            <input
              className="input"
              required
              value={settingsForm.name}
              onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Appointment Duration (minutes)</label>
            <input
              className="input"
              type="number"
              min={15}
              step={15}
              value={settingsForm.slot_duration_minutes}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, slot_duration_minutes: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="label">AI Receptionist Persona</label>
            <textarea
              className="input min-h-[100px]"
              value={settingsForm.system_prompt}
              onChange={(e) => setSettingsForm({ ...settingsForm, system_prompt: e.target.value })}
              placeholder="You are a friendly AI receptionist for [Business Name]…"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={savingSettings}>
              {savingSettings ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditingSettings(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Knowledge Base */}
      <section className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold">Knowledge Base</h2>
            <p className="text-xs text-gray-400">
              Documents the AI receptionist uses to answer questions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label
              className={`btn-secondary cursor-pointer ${uploadingFile ? "opacity-60 pointer-events-none" : ""}`}
              title="Supported: PDF, DOCX, TXT"
            >
              {uploadingFile ? "Extracting & Embedding…" : "Upload File"}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploadingFile}
              />
            </label>
            <button
              className="btn-primary"
              onClick={() => setAddingDoc(!addingDoc)}
            >
              {addingDoc ? "Cancel" : "+ Add Document"}
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="mx-6 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {uploadError}
          </div>
        )}

        {addingDoc && (
          <form onSubmit={handleAddDoc} className="p-6 border-b border-gray-100 space-y-3">
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={docForm.title}
                onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                placeholder="Services & Pricing"
              />
            </div>
            <div>
              <label className="label">Content *</label>
              <textarea
                required
                className="input min-h-[120px]"
                value={docForm.content}
                onChange={(e) => setDocForm({ ...docForm, content: e.target.value })}
                placeholder="Paste your business information, FAQs, pricing, policies…"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={savingDoc}>
              {savingDoc ? "Embedding & Saving…" : "Save Document"}
            </button>
          </form>
        )}

        <div className="divide-y divide-gray-50">
          {docs.length === 0 && (
            <p className="p-6 text-sm text-gray-400">
              No documents yet. Add business info, FAQs, and pricing above.
            </p>
          )}
          {docs.map((doc: any) => (
            <div key={doc.id} className="px-6 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{doc.title || "Untitled"}</p>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{doc.content}</p>
              </div>
              <button
                className="btn-danger shrink-0 text-xs"
                onClick={() => handleDeleteDoc(doc.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Call History */}
      <section className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold">Call History</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {calls.length === 0 && (
            <p className="p-6 text-sm text-gray-400">No calls recorded yet.</p>
          )}
          {calls.map((call: any) => (
            <details key={call.id} className="px-6 py-4 group">
              <summary className="flex items-center gap-4 cursor-pointer list-none">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{call.caller_number || "Unknown caller"}</p>
                  <p className="text-xs text-gray-400">
                    {call.started_at ? format(new Date(call.started_at), "MMM d, yyyy HH:mm") : "—"}
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
                  {call.outcome?.replace(/_/g, " ") || "no outcome"}
                </span>
                <span className="text-xs text-gray-400">
                  {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
                </span>
                <span className="text-xs text-gray-300 group-open:rotate-90 transition-transform">▶</span>
              </summary>
              <div className="mt-4 bg-gray-50 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap text-gray-700">
                {call.transcript || "No transcript available."}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
