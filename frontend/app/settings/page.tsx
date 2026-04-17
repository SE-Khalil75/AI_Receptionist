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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: "", system_prompt: "", slot_duration_minutes: 60 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

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

  if (!Business) {
    return (
      <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-jetbrains)', fontSize: '13px', padding: '32px' }}>
        Loading…
      </div>
    );
  }

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
            Configuration
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
            {Business.name}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: '12px',
              color: 'var(--text-dim)',
              marginTop: '4px',
            }}
          >
            {Business.phone_number || "No Twilio number configured"}
          </div>
        </div>
        {!editingSettings && (
          <button className="btn-secondary" onClick={startEditSettings} style={{ marginTop: '4px' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            Edit Settings
          </button>
        )}
      </div>

      {/* Edit form */}
      {editingSettings && (
        <div className="card">
          <div
            className="px-6 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div style={{ fontFamily: 'var(--font-syne)', fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Business Settings
            </div>
          </div>
          <form onSubmit={handleSaveSettings} className="p-6 space-y-5">
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
                style={{ maxWidth: '160px' }}
                value={settingsForm.slot_duration_minutes}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, slot_duration_minutes: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="label">AI Receptionist Persona</label>
              <textarea
                className="input"
                style={{ minHeight: '100px', resize: 'vertical' }}
                value={settingsForm.system_prompt}
                onChange={(e) => setSettingsForm({ ...settingsForm, system_prompt: e.target.value })}
                placeholder="You are a friendly AI receptionist for [Business Name]…"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={savingSettings}>
                {savingSettings ? "Saving…" : "Save Changes"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditingSettings(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Knowledge Base */}
      <div className="card">
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <div style={{ fontFamily: 'var(--font-syne)', fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Knowledge Base
            </div>
            <div style={{ fontFamily: 'var(--font-outfit)', fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
              Documents the AI uses to answer questions
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label
              className={`btn-secondary ${uploadingFile ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
              title="Supported: PDF, DOCX, TXT"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M5 5l3-3 3 3M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {uploadingFile ? "Processing…" : "Upload File"}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploadingFile}
              />
            </label>
            <button
              className={addingDoc ? "btn-secondary" : "btn-primary"}
              onClick={() => setAddingDoc(!addingDoc)}
            >
              {addingDoc ? "Cancel" : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Add Document
                </>
              )}
            </button>
          </div>
        </div>

        {uploadError && (
          <div
            className="mx-6 mt-4 px-4 py-3"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '2px',
              fontSize: '13px',
              color: '#EF4444',
            }}
          >
            {uploadError}
          </div>
        )}

        {addingDoc && (
          <form
            onSubmit={handleAddDoc}
            className="p-6 space-y-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
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
                className="input"
                style={{ minHeight: '120px', resize: 'vertical' }}
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

        <div>
          {docs.length === 0 && (
            <div
              className="p-8 text-center"
              style={{ color: 'var(--text-dim)', fontSize: '13px' }}
            >
              No documents yet. Add business info, FAQs, and pricing.
            </div>
          )}
          {docs.map((doc: any, i: number) => (
            <div
              key={doc.id}
              className="px-6 py-4 flex items-start gap-4"
              style={{
                borderBottom: i < docs.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div
                style={{
                  width: '32px', height: '32px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: '2px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: '2px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-dim)' }}>
                  <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  style={{
                    fontFamily: 'var(--font-outfit)',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-primary)',
                  }}
                >
                  {doc.title || "Untitled"}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-outfit)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    marginTop: '4px',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {doc.content}
                </div>
              </div>
              <button
                className="btn-danger shrink-0"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => handleDeleteDoc(doc.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Call History */}
      <div className="card">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Call History
          </div>
          <span className="badge-gray">{calls.length}</span>
        </div>
        <div>
          {calls.length === 0 && (
            <div
              className="p-8 text-center"
              style={{ color: 'var(--text-dim)', fontSize: '13px' }}
            >
              No calls recorded yet.
            </div>
          )}
          {calls.map((call: any, i: number) => (
            <div
              key={call.id}
              style={{ borderBottom: i < calls.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <button
                className="w-full px-6 py-4 flex items-center gap-4 text-left"
                style={{
                  background: 'transparent',
                  transition: 'background 0.15s',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
              >
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {call.caller_number || "Unknown caller"}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-outfit)',
                      fontSize: '12px',
                      color: 'var(--text-dim)',
                      marginTop: '2px',
                    }}
                  >
                    {call.started_at ? format(new Date(call.started_at), "MMM d, yyyy · HH:mm") : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={
                      call.outcome === "appointment_booked" ? "badge-green" :
                      call.outcome === "question_answered" ? "badge-blue" : "badge-gray"
                    }
                  >
                    {call.outcome?.replace(/_/g, " ") || "no outcome"}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '11px',
                      color: 'var(--text-dim)',
                      minWidth: '32px',
                      textAlign: 'right',
                    }}
                  >
                    {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{
                      color: 'var(--text-dim)',
                      transform: expandedCall === call.id ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  >
                    <path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </div>
              </button>

              {expandedCall === call.id && (
                <div
                  className="px-6 pb-5"
                  style={{ background: 'var(--bg-base)' }}
                >
                  <div
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '2px',
                      padding: '16px',
                      fontFamily: 'var(--font-jetbrains)',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.8',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '300px',
                      overflowY: 'auto',
                    }}
                  >
                    {call.transcript || "No transcript available."}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
