from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# ── Company ───────────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    name: str
    phone_number: Optional[str] = None
    business_hours: Optional[dict] = None
    slot_duration_minutes: int = 60
    system_prompt: Optional[str] = None
    settings: dict = Field(default_factory=dict)


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    business_hours: Optional[dict] = None
    slot_duration_minutes: Optional[int] = None
    system_prompt: Optional[str] = None
    settings: Optional[dict] = None


class Company(BaseModel):
    id: str
    name: str
    phone_number: Optional[str]
    business_hours: Optional[dict]
    slot_duration_minutes: int
    system_prompt: Optional[str]
    settings: dict
    created_at: datetime
    updated_at: datetime


# ── Document ──────────────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    title: Optional[str] = None
    content: str
    metadata: dict = Field(default_factory=dict)


class Document(BaseModel):
    id: str
    company_id: str
    title: Optional[str]
    content: str
    metadata: dict
    created_at: datetime


# ── Appointment ───────────────────────────────────────────────────────────────

class AppointmentCreate(BaseModel):
    company_id: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    service: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int = 60
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    service: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class Appointment(BaseModel):
    id: str
    company_id: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str]
    service: Optional[str]
    scheduled_at: datetime
    duration_minutes: int
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── Call Log ──────────────────────────────────────────────────────────────────

class CallLog(BaseModel):
    id: str
    company_id: Optional[str]
    call_sid: str
    caller_number: Optional[str]
    called_number: Optional[str]
    duration_seconds: Optional[int]
    transcript: Optional[str]
    outcome: Optional[str]
    appointment_id: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    metadata: dict


# ── API responses ─────────────────────────────────────────────────────────────

class APIResponse(BaseModel):
    success: bool
    data: Any = None
    message: Optional[str] = None


class AvailableSlot(BaseModel):
    datetime: str          # ISO-8601
    display: str           # "Monday, March 3 at 2:00 PM"
