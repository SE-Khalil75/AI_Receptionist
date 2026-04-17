"""
LangGraph ReAct agent graph for the AI receptionist.

Architecture
────────────
  [start]
     │
  [agent]  ←──────────────┐
     │                     │
  (tools?)                 │
  ├─ yes → [tool_node] ───┘
  └─ no  → [END]
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition

from app.agent.state import AgentState
from app.agent.tools import create_tools
from app.config import settings
from app.services import supabase_service as db


DEFAULT_SYSTEM_PROMPT = """You are a professional AI receptionist. Your job is to:
1. Greet callers warmly and identify their needs.
2. Answer questions about the business using the knowledge base (always search first).
3. Book appointments when requested using this STRICT sequence:
   a. Collect all four pieces: full name, service, date/time, email address.
   b. The moment you have all four, your VERY NEXT action must be a book_appointment tool call.
      Do NOT say anything to the caller before making that tool call.
   c. After book_appointment returns successfully, tell the caller their appointment is pending
      and a confirmation email will be sent — they must click Confirm to finalise.
   d. Then ask: "Is there anything else I can help you with today?" and wait for their reply.
   e. Only after the caller says they are done, call end_call_gracefully with a warm farewell.

   *** FORBIDDEN until book_appointment has been called and returned: ***
   - Any goodbye, "have a great day", "take care", or farewell phrase
   - Calling end_call_gracefully
   - Saying the appointment is booked (it is NOT booked until the tool is called)

4. Be concise – this is a phone call. Keep responses under 3 sentences unless listing options.

Always be polite, warm, and helpful. If you cannot help, offer to have a human call back."""


TEXT_MODE_SUFFIX = """

=== TEXT CHAT MODE – MANDATORY FORMATTING ===
You are responding via text chat, NOT a phone call.
RULE: Every sentence must be on its own line, separated by a blank line.
Never place two sentences in the same paragraph.
Do not use markdown, bullet points, or headers.

CORRECT format (follow this exactly):
Great news!

We have a slot available on Friday, March 27th at 9:00 AM.

Could you please provide your full name and email address?

WRONG format (never do this):
Great news! We have a slot available on Friday, March 27th at 9:00 AM. Could you please provide your full name and email address?"""


def build_graph(
    company_id: str,
    company_name: str,
    customer_phone: str,
    company_system_prompt: str | None = None,
    text_mode: bool = False,
):
    """
    Compile and return a LangGraph graph for one phone call session.
    Each call gets its own graph instance (lightweight – just the compiled graph).
    """
    tools = create_tools(company_id, customer_phone)
    llm = ChatOpenAI(
        model=settings.agent_llm_model,
        api_key=settings.openai_api_key,
        temperature=0.3,
    ).bind_tools(tools)

    today = datetime.now(timezone.utc).strftime("%A, %B %d, %Y").replace(" 0", " ")
    system_prompt = (
        f"You are the AI receptionist for {company_name}.\n"
        f"Today's date is {today}.\n\n"
        + (company_system_prompt or DEFAULT_SYSTEM_PROMPT)
        + (TEXT_MODE_SUFFIX if text_mode else "")
    )

    async def agent_node(state: AgentState) -> dict:
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        response: AIMessage = await llm.ainvoke(messages)

        # Detect end-call signal in tool results already in state
        should_end = state.get("should_end_call", False)
        outcome = state.get("call_outcome")

        # Check if last tool result contained the end-call token
        for msg in reversed(state["messages"]):
            if isinstance(msg, ToolMessage) and "__END_CALL__" in msg.content:
                should_end = True
                outcome = outcome or "no_action"
                break

        return {
            "messages": [response],
            "should_end_call": should_end,
            "call_outcome": outcome,
        }

    def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
        # End if agent flagged it or if no more tool calls
        if state.get("should_end_call"):
            return "__end__"
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            return "tools"
        return "__end__"

    async def tool_node_wrapper(state: AgentState) -> dict:
        """Run tools and detect the end-call signal in results."""
        tool_node = ToolNode(tools)
        result = await tool_node.ainvoke(state)

        # Check for end-call token in any tool message
        should_end = state.get("should_end_call", False)
        outcome = state.get("call_outcome")
        appointment_id = state.get("appointment_id")

        for msg in result.get("messages", []):
            if isinstance(msg, ToolMessage):
                if "__END_CALL__" in msg.content:
                    should_end = True
                if "Appointment pending confirmation" in msg.content:
                    # Extract appointment ID from message
                    try:
                        appt_id = msg.content.split("ID: ")[1].split("\n")[0].strip()
                        appointment_id = appt_id
                        outcome = "appointment_booked"
                    except IndexError:
                        pass
                elif "rescheduled" in msg.content.lower():
                    outcome = "rescheduled"
                elif "cancelled" in msg.content.lower():
                    outcome = "cancelled"

        return {
            **result,
            "should_end_call": should_end,
            "call_outcome": outcome,
            "appointment_id": appointment_id,
        }

    # ── Build graph ───────────────────────────────────────────────────────────
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", tool_node_wrapper)

    workflow.set_entry_point("agent")
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "__end__": END},
    )
    workflow.add_edge("tools", "agent")

    return workflow.compile()


class ReceptionistAgent:
    """
    Stateful wrapper around the LangGraph graph for a single phone call.
    Maintains conversation history across multiple speech turns.
    """

    def __init__(self, company_id: str, customer_phone: str, text_mode: bool = False):
        company = db.get_company(company_id)
        self.company_id = company_id
        self.company_name = company["name"] if company else "our company"
        self.customer_phone = customer_phone
        self.state: AgentState = {
            "messages": [],
            "call_sid": "",
            "company_id": company_id,
            "company_name": self.company_name,
            "customer_phone": customer_phone,
            "call_log_id": "",
            "appointment_id": None,
            "call_outcome": None,
            "should_end_call": False,
            "transcript_lines": [],
        }
        self.graph = build_graph(
            company_id=company_id,
            company_name=self.company_name,
            customer_phone=customer_phone,
            company_system_prompt=company.get("system_prompt") if company else None,
            text_mode=text_mode,
        )

    async def process_turn(self, user_text: str) -> tuple[str, bool]:
        """
        Process one conversational turn.
        Returns (agent_response_text, should_end_call).
        """
        self.state["messages"].append(HumanMessage(content=user_text))
        self.state["transcript_lines"].append(f"Customer: {user_text}")

        result = await self.graph.ainvoke(self.state)
        self.state = result  # update state with new messages + flags

        # Extract the last AI text response
        agent_text = ""
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage) and msg.content:
                agent_text = msg.content if isinstance(msg.content, str) else ""
                break

        self.state["transcript_lines"].append(f"Agent: {agent_text}")
        return agent_text, result.get("should_end_call", False)

    @property
    def transcript(self) -> str:
        return "\n".join(self.state.get("transcript_lines", []))

    @property
    def appointment_id(self) -> str | None:
        return self.state.get("appointment_id")

    @property
    def call_outcome(self) -> str | None:
        return self.state.get("call_outcome")
