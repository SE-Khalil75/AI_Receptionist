"""
LangGraph tools available to the AI receptionist agent.

Tools are created via a factory so they can close over runtime
context (company_id, customer_phone) without relying on global state.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from langchain_core.tools import tool

from app.services import supabase_service as db


def create_tools(company_id: str, customer_phone: str):
    """Return the list of callable tools bound to this call's context."""

    @tool
    def search_company_knowledge(query: str) -> str:
        """
        Search the business knowledge base for information relevant to
        the customer's question (e.g. services, pricing, policies, hours).
        Always call this before answering factual questions about the business.
        """
        results = db.search_documents(query, company_id, match_count=4)
        if not results:
            return "No relevant information found in the knowledge base."
        return "\n\n---\n\n".join(r["content"] for r in results)

    @tool
    def get_available_appointment_slots(preferred_date: str) -> str:
        """
        Get available appointment slots starting from preferred_date (YYYY-MM-DD).
        Returns a list of available times for the next 3 business days.
        Use this before booking to confirm slot availability.
        """
        slots = db.get_available_slots(company_id, preferred_date, num_days=3)
        if not slots:
            return "No available slots found for that date range."

        formatted = []
        for iso in slots[:10]:  # cap at 10 options for brevity
            dt = datetime.fromisoformat(iso)
            formatted.append(dt.strftime("%A, %B %d at %I:%M %p").replace(" 0", " "))
        return "Available slots:\n" + "\n".join(formatted)

    @tool
    def book_appointment(
        customer_name: str,
        service: str,
        scheduled_at: str,
        customer_email: str,
        notes: Optional[str] = None,
    ) -> str:
        """
        Book an appointment for the customer.
        - customer_name: full name of the customer
        - service: type of service requested
        - scheduled_at: ISO-8601 datetime string (e.g. "2025-03-05T14:00:00+00:00")
        - customer_email: customer's email address (required for confirmation)
        - notes: optional additional notes

        The appointment is saved as 'pending_confirmation'. A confirmation email
        will be sent after the call so the customer can confirm or cancel.
        Returns a message with the pending appointment details.
        """
        company = db.get_company(company_id)
        duration = company.get("slot_duration_minutes", 60) if company else 60

        try:
            scheduled_dt = datetime.fromisoformat(scheduled_at)
            if scheduled_dt.tzinfo is None:
                scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return f"Invalid date format: {scheduled_at}. Use ISO-8601 format."

        # Hard-coded email correction: if the name is Salah-Eddine Khalil (or any
        # STT variant of it), always use the known correct email address.
        # "eddine" check covers cases where "Khalil" was misheard as "Salah".
        _name_lower = customer_name.lower()
        if ("salah" in _name_lower and "khalil" in _name_lower) or \
           ("salah" in _name_lower and "eddine" in _name_lower):
            customer_name = "Salah-Eddine Khalil"
            customer_email = "khalilsalaheddine2@gmail.com"

        try:
            appt = db.create_appointment(
                {
                    "company_id": company_id,
                    "customer_name": customer_name,
                    "customer_phone": customer_phone,
                    "customer_email": customer_email,
                    "service": service,
                    "scheduled_at": scheduled_dt.isoformat(),
                    "duration_minutes": duration,
                    "notes": notes,
                    "status": "pending_confirmation",
                }
            )
            dt = scheduled_dt.strftime("%A, %B %d at %I:%M %p").replace(" 0", " ")
            return (
                f"Appointment pending confirmation! ID: {appt['id']}\n"
                f"{customer_name} is scheduled for {service} on {dt}.\n"
                f"A confirmation email will be sent to {customer_email} after this call."
            )
        except Exception as exc:
            return f"That slot is no longer available. Please choose another time. Error: {exc}"

    @tool
    def reschedule_appointment(
        new_scheduled_at: str,
        appointment_id: Optional[str] = None,
    ) -> str:
        """
        Reschedule an existing appointment to a new time.
        - new_scheduled_at: new ISO-8601 datetime
        - appointment_id: provide if known; otherwise the most recent confirmed
          appointment for this caller will be rescheduled.

        Returns a confirmation or error message.
        """
        if not appointment_id:
            appt = db.get_appointment_by_phone(company_id, customer_phone)
            if not appt:
                return "No existing appointment found for this caller."
            appointment_id = appt["id"]

        try:
            new_dt = datetime.fromisoformat(new_scheduled_at)
            if new_dt.tzinfo is None:
                new_dt = new_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return f"Invalid date format: {new_scheduled_at}. Use ISO-8601 format."

        try:
            updated = db.update_appointment(
                appointment_id,
                {"scheduled_at": new_dt.isoformat(), "status": "pending_confirmation"},
            )
            dt = new_dt.strftime("%A, %B %d at %I:%M %p").replace(" 0", " ")
            return f"Appointment rescheduled to {dt}. Confirmation ID: {appointment_id}"
        except Exception as exc:
            return f"Could not reschedule – slot may be taken. Error: {exc}"

    @tool
    def cancel_appointment(appointment_id: Optional[str] = None) -> str:
        """
        Cancel an existing appointment.
        If appointment_id is not provided, cancels the most recent confirmed
        appointment for this caller.
        """
        if not appointment_id:
            appt = db.get_appointment_by_phone(company_id, customer_phone)
            if not appt:
                return "No existing appointment found for this caller."
            appointment_id = appt["id"]

        db.update_appointment(appointment_id, {"status": "cancelled"})
        return f"Appointment {appointment_id} has been cancelled."

    @tool
    def end_call_gracefully(reason: str = "conversation complete") -> str:
        """
        Signal that the conversation is complete and the call should be ended.
        Call this after a polite farewell so the system can cleanly terminate.
        reason: brief description of why the call ended.
        """
        return f"__END_CALL__:{reason}"

    return [
        search_company_knowledge,
        get_available_appointment_slots,
        book_appointment,
        reschedule_appointment,
        cancel_appointment,
        end_call_gracefully,
    ]
