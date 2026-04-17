"""Google Calendar integration – creates/cancels events using a service account."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _get_service():
    """Return an authenticated Google Calendar API service object, or None if unconfigured."""
    from app.config import settings

    creds_file = settings.google_calendar_credentials_file
    if not creds_file:
        logger.warning("GOOGLE_CALENDAR_CREDENTIALS_FILE not set – calendar integration disabled.")
        return None
    # Resolve relative paths from the backend directory
    if not os.path.isabs(creds_file):
        creds_file = os.path.join(os.path.dirname(__file__), "..", "..", creds_file)
        creds_file = os.path.normpath(creds_file)
    if not os.path.exists(creds_file):
        logger.warning(
            "Google Calendar credentials file not found at '%s' – calendar integration disabled.",
            creds_file,
        )
        return None
    logger.info("Using Google Calendar credentials: %s", creds_file)

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        scopes = ["https://www.googleapis.com/auth/calendar"]
        credentials = service_account.Credentials.from_service_account_file(
            creds_file, scopes=scopes
        )
        return build("calendar", "v3", credentials=credentials, cache_discovery=False)
    except Exception as exc:
        logger.exception("Failed to build Google Calendar service: %s", exc)
        return None


def create_calendar_event(
    *,
    summary: str,
    description: str,
    start_dt: datetime,
    duration_minutes: int,
    attendee_email: Optional[str] = None,
) -> Optional[str]:
    """
    Create a Google Calendar event.
    Returns the event ID on success, or None if Calendar is not configured / fails.
    """
    from app.config import settings

    service = _get_service()
    if service is None:
        return None

    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(minutes=duration_minutes)

    event_body: dict = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "UTC"},
        "end":   {"dateTime": end_dt.isoformat(),   "timeZone": "UTC"},
    }
    try:
        event = (
            service.events()
            .insert(calendarId=settings.google_calendar_id, body=event_body)
            .execute()
        )
        event_id = event.get("id")
        logger.info("Google Calendar event created: %s", event_id)
        return event_id
    except Exception as exc:
        logger.exception("Failed to create Google Calendar event: %s", exc)
        return None


def cancel_calendar_event(event_id: str) -> bool:
    """
    Delete a Google Calendar event by ID.
    Returns True on success, False otherwise.
    """
    from app.config import settings

    service = _get_service()
    if service is None:
        return False

    try:
        service.events().delete(
            calendarId=settings.google_calendar_id, eventId=event_id
        ).execute()
        logger.info("Google Calendar event deleted: %s", event_id)
        return True
    except Exception as exc:
        logger.exception("Failed to delete Google Calendar event %s: %s", event_id, exc)
        return False
