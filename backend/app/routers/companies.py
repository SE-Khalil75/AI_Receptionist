"""CRUD endpoints for companies and their knowledge base documents."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    APIResponse,
    CompanyCreate,
    CompanyUpdate,
    DocumentCreate,
)
from app.services import supabase_service as db

router = APIRouter(prefix="/companies", tags=["companies"])


# ── Companies ─────────────────────────────────────────────────────────────────

@router.get("")
def list_companies():
    return APIResponse(success=True, data=db.list_companies())


@router.post("")
def create_company(payload: CompanyCreate):
    company = db.create_company(payload.model_dump(exclude_none=True))
    return APIResponse(success=True, data=company)


@router.get("/{company_id}")
def get_company(company_id: str):
    company = db.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return APIResponse(success=True, data=company)


@router.patch("/{company_id}")
def update_company(company_id: str, payload: CompanyUpdate):
    try:
        updated = db.update_company(
            company_id, payload.model_dump(exclude_none=True)
        )
        return APIResponse(success=True, data=updated)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{company_id}")
def delete_company(company_id: str):
    db.delete_company(company_id)
    return APIResponse(success=True, message="Company deleted")


# ── Knowledge base documents ──────────────────────────────────────────────────

@router.get("/{company_id}/documents")
def list_documents(company_id: str):
    docs = db.list_documents(company_id)
    return APIResponse(success=True, data=docs)


@router.post("/{company_id}/documents")
def add_document(company_id: str, payload: DocumentCreate):
    doc = db.add_document(
        company_id=company_id,
        title=payload.title or "",
        content=payload.content,
        metadata=payload.metadata,
    )
    return APIResponse(success=True, data=doc)


@router.delete("/{company_id}/documents/{document_id}")
def delete_document(company_id: str, document_id: str):
    db.delete_document(document_id)
    return APIResponse(success=True, message="Document deleted")


# ── Call logs ─────────────────────────────────────────────────────────────────

@router.get("/{company_id}/calls")
def list_calls(company_id: str, limit: int = 50):
    logs = db.list_call_logs(company_id, limit=limit)
    return APIResponse(success=True, data=logs)
