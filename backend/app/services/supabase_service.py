"""Supabase client – companies, documents (vector search), appointments, call logs."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from openai import OpenAI
from supabase import create_client, Client

from app.config import settings


def get_business_company() -> Optional[dict]:
    """
    Return the single business company from the database.
    Uses COMPANY_ID from config if set; otherwise falls back to the first row.
    """
    if settings.company_id:
        return get_company(settings.company_id)
    # Fallback: use the first company in the table (initial setup)
    companies = list_companies()
    return companies[0] if companies else None


def _get_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_key)


def _openai() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


# ── Embeddings ────────────────────────────────────────────────────────────────

def embed_text(text: str) -> list[float]:
    client = _openai()
    response = client.embeddings.create(
        model=settings.embedding_model,
        input=text,
    )
    return response.data[0].embedding


# ── Companies ─────────────────────────────────────────────────────────────────

def get_company_by_phone(phone_number: str) -> Optional[dict]:
    db = _get_client()
    result = (
        db.table("companies")
        .select("*")
        .eq("phone_number", phone_number)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_company(company_id: str) -> Optional[dict]:
    db = _get_client()
    result = (
        db.table("companies")
        .select("*")
        .eq("id", company_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_companies() -> list[dict]:
    db = _get_client()
    return db.table("companies").select("*").order("created_at", desc=True).execute().data


def create_company(data: dict) -> dict:
    db = _get_client()
    return db.table("companies").insert(data).execute().data[0]


def update_company(company_id: str, data: dict) -> dict:
    db = _get_client()
    return (
        db.table("companies")
        .update(data)
        .eq("id", company_id)
        .execute()
        .data[0]
    )


def delete_company(company_id: str) -> None:
    db = _get_client()
    db.table("companies").delete().eq("id", company_id).execute()


# ── Documents / Knowledge Base ────────────────────────────────────────────────

def add_document(company_id: str, title: str, content: str, metadata: dict = {}) -> dict:
    db = _get_client()
    embedding = embed_text(content)
    row = {
        "company_id": company_id,
        "title": title,
        "content": content,
        "metadata": metadata,
        "embedding": embedding,
    }
    return db.table("company_documents").insert(row).execute().data[0]


def search_documents(query: str, company_id: str, match_count: int = 5) -> list[dict]:
    """Vector similarity search against the company knowledge base."""
    db = _get_client()
    query_embedding = embed_text(query)
    result = db.rpc(
        "match_documents",
        {
            "query_embedding": query_embedding,
            "match_count": match_count,
            "company_id_filter": company_id,
            "similarity_threshold": 0.2,
        },
    ).execute()
    return result.data or []


def list_documents(company_id: str) -> list[dict]:
    db = _get_client()
    return (
        db.table("company_documents")
        .select("id, title, content, metadata, created_at")
        .eq("company_id", company_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )


def delete_document(document_id: str) -> None:
    db = _get_client()
    db.table("company_documents").delete().eq("id", document_id).execute()


# ── Appointments ──────────────────────────────────────────────────────────────

def get_available_slots(
    company_id: str, date_str: str, num_days: int = 3
) -> list[str]:
    """
    Return available ISO-8601 datetime slots for the next `num_days` days
    starting from `date_str` (YYYY-MM-DD), respecting business hours and
    existing bookings.
    """
    company = get_company(company_id)
    if not company:
        return []

    bh: dict = company.get("business_hours", {})
    duration: int = company.get("slot_duration_minutes", 60)

    start_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    slots: list[str] = []

    for day_offset in range(num_days):
        day = start_date + timedelta(days=day_offset)
        day_name = day.strftime("%A").lower()
        hours = bh.get(day_name)
        if not hours:
            continue  # closed

        open_h, open_m = map(int, hours["open"].split(":"))
        close_h, close_m = map(int, hours["close"].split(":"))

        slot = day.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
        close_time = day.replace(hour=close_h, minute=close_m, second=0, microsecond=0)

        while slot < close_time:
            slots.append(slot.isoformat())
            slot += timedelta(minutes=duration)

    # Remove already-booked slots
    if slots:
        db = _get_client()
        booked = (
            db.table("appointments")
            .select("scheduled_at")
            .eq("company_id", company_id)
            .in_("status", ["confirmed", "pending_confirmation"])
            .gte("scheduled_at", slots[0])
            .lte("scheduled_at", slots[-1])
            .execute()
            .data
        )
        booked_times = {r["scheduled_at"] for r in booked}
        slots = [s for s in slots if s not in booked_times]

    return slots


def get_appointment(appointment_id: str) -> Optional[dict]:
    db = _get_client()
    result = (
        db.table("appointments")
        .select("*")
        .eq("id", appointment_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def create_appointment(data: dict) -> dict:
    db = _get_client()
    return db.table("appointments").insert(data).execute().data[0]


def update_appointment(appointment_id: str, data: dict) -> dict:
    db = _get_client()
    return (
        db.table("appointments")
        .update(data)
        .eq("id", appointment_id)
        .execute()
        .data[0]
    )


def get_appointment_by_phone(company_id: str, phone: str) -> Optional[dict]:
    """Find the most recent confirmed or pending appointment for a caller."""
    db = _get_client()
    result = (
        db.table("appointments")
        .select("*")
        .eq("company_id", company_id)
        .eq("customer_phone", phone)
        .in_("status", ["confirmed", "pending_confirmation"])
        .order("scheduled_at")
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_appointments(company_id: str, status: Optional[str] = None) -> list[dict]:
    db = _get_client()
    q = (
        db.table("appointments")
        .select("*")
        .eq("company_id", company_id)
        .order("scheduled_at")
    )
    if status:
        q = q.eq("status", status)
    return q.execute().data


# ── Call Logs ─────────────────────────────────────────────────────────────────

def create_call_log(data: dict) -> dict:
    db = _get_client()
    return db.table("call_logs").insert(data).execute().data[0]


def update_call_log(call_log_id: str, data: dict) -> dict:
    db = _get_client()
    return (
        db.table("call_logs")
        .update(data)
        .eq("id", call_log_id)
        .execute()
        .data[0]
    )


def list_call_logs(company_id: str, limit: int = 50) -> list[dict]:
    db = _get_client()
    return (
        db.table("call_logs")
        .select("*")
        .eq("company_id", company_id)
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )
