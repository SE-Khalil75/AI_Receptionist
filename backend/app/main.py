"""FastAPI application entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import appointments, clinic as business, confirm, outbound, webhook, test_agent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

app = FastAPI(
    title="AI Receptionist API",
    description="Voice AI receptionist – powered by LangGraph, Twilio, Whisper, and Supabase",
    version="1.0.0",
)

# Allow the Next.js dev server (and any subdomain) during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook.router)
app.include_router(outbound.router)
app.include_router(business.router)
app.include_router(appointments.router)
app.include_router(confirm.router)
app.include_router(test_agent.router)


@app.get("/health")
def health():
    return {"status": "ok"}
