"""Appointment management endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import APIResponse, AppointmentCreate, AppointmentUpdate
from app.services import supabase_service as db

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _business_id() -> str:
    business = db.get_business_company()
    if not business:
        raise HTTPException(status_code=503, detail="Business not configured")
    return business["id"]


@router.get("")
def list_appointments(status: str | None = None):
    appts = db.list_appointments(_business_id(), status=status)
    return APIResponse(success=True, data=appts)


@router.post("")
def create_appointment(payload: AppointmentCreate):
    try:
        data = payload.model_dump(exclude_none=True)
        data["company_id"] = _business_id()
        appt = db.create_appointment(data)
        return APIResponse(success=True, data=appt)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/slots")
def available_slots(date: str, num_days: int = 3):
    """Return available booking slots for the Business and given date range."""
    slots = db.get_available_slots(_business_id(), date, num_days=num_days)
    return APIResponse(success=True, data=slots)


@router.get("/{appointment_id}")
def get_appointment(appointment_id: str):
    appt = db.get_appointment(appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return APIResponse(success=True, data=appt)


@router.patch("/{appointment_id}")
def update_appointment(appointment_id: str, payload: AppointmentUpdate):
    try:
        updated = db.update_appointment(
            appointment_id, payload.model_dump(exclude_none=True)
        )
        return APIResponse(success=True, data=updated)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
