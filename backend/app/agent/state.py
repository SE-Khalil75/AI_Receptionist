"""LangGraph agent state definition."""
from __future__ import annotations

from typing import Annotated, Optional
from langgraph.graph import MessagesState


class AgentState(MessagesState):
    """Extended state carried through the LangGraph call graph."""
    # Injected at call start
    call_sid: str
    company_id: str
    company_name: str
    customer_phone: str
    call_log_id: str

    # Written by tools / nodes
    appointment_id: Optional[str]        # set when an appointment is booked
    call_outcome: Optional[str]          # 'appointment_booked' | 'question_answered' | 'rescheduled' | 'no_action'
    should_end_call: bool                # agent sets True when conversation is done
    transcript_lines: list[str]          # accumulated "Speaker: text" lines
