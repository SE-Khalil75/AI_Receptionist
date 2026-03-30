"""Single-business settings and knowledge-base document endpoints."""
from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException, UploadFile, File

from app.models.schemas import APIResponse, CompanyUpdate, DocumentCreate
from app.services import supabase_service as db

router = APIRouter(prefix="/business", tags=["business"])


# ── Business settings ─────────────────────────────────────────────────────────

@router.get("")
def get_business():
    """Return the single business's settings."""
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured. Set COMPANY_ID in .env to configure your business")
    return APIResponse(success=True, data=Business)


@router.patch("")
def update_business(payload: CompanyUpdate):
    """Update business settings (name, hours, AI persona, etc.)."""
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured")
    try:
        updated = db.update_company(Business["id"], payload.model_dump(exclude_none=True))
        return APIResponse(success=True, data=updated)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Knowledge base documents ──────────────────────────────────────────────────

@router.get("/documents")
def list_documents():
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured")
    docs = db.list_documents(Business["id"])
    return APIResponse(success=True, data=docs)


@router.post("/documents")
def add_document(payload: DocumentCreate):
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured")
    doc = db.add_document(
        company_id=Business["id"],
        title=payload.title or "",
        content=payload.content,
        metadata=payload.metadata,
    )
    return APIResponse(success=True, data=doc)


@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Upload a PDF, DOCX, or TXT file. Text is extracted, embedded, and saved
    to the knowledge base automatically.
    """
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured")

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in ("pdf", "docx", "txt"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Supported: pdf, docx, txt",
        )

    raw = await file.read()

    try:
        if ext == "pdf":
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            text = "\n\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()

        elif ext == "docx":
            from docx import Document
            doc = Document(io.BytesIO(raw))
            text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

        else:  # txt
            text = raw.decode("utf-8", errors="replace")

    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to extract text: {exc}")

    if not text:
        raise HTTPException(status_code=422, detail="No text could be extracted from the file.")

    title = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()

    doc = db.add_document(
        company_id=Business["id"],
        title=title,
        content=text,
    )
    return APIResponse(success=True, data=doc)


@router.delete("/documents/{document_id}")
def delete_document(document_id: str):
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured")
    # Verify the document belongs to this Business before deleting
    docs = db.list_documents(Business["id"])
    if not any(d["id"] == document_id for d in docs):
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete_document(document_id)
    return APIResponse(success=True, message="Document deleted")


# ── Call logs ────────────────────────────────────────────────────────────────

@router.get("/calls")
def list_calls(limit: int = 50):
    Business = db.get_business_company()
    if not Business:
        raise HTTPException(status_code=404, detail="Business not configured")
    logs = db.list_call_logs(Business["id"], limit=limit)
    return APIResponse(success=True, data=logs)
