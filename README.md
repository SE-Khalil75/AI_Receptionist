# AI Receptionist

An AI-powered phone receptionist for businesses. When a customer calls your Twilio number, the AI answers, speaks naturally, answers questions from your knowledge base, and books appointments — all automatically.

---

## How It Works (Big Picture)

```
Customer calls Twilio number
         │
         ▼
  POST /webhook/voice          ← Twilio notifies your server
         │
         ▼
  WebSocket /ws/stream         ← Real-time audio opened
         │
  ┌──────┴──────────────────────────────────────────┐
  │  For every speech turn:                         │
  │                                                 │
  │  Twilio (μ-law audio)                           │
  │       │                                         │
  │       ▼                                         │
  │  OpenAI Whisper  →  transcript text             │
  │       │                                         │
  │       ▼                                         │
  │  LangGraph Agent (GPT-4o)                       │
  │    ├─ search knowledge base  (Supabase vector)  │
  │    ├─ check available slots                     │
  │    ├─ book / reschedule / cancel appointment    │
  │    └─ end call                                  │
  │       │                                         │
  │       ▼                                         │
  │  ElevenLabs TTS  →  audio sent back to caller   │
  └─────────────────────────────────────────────────┘
         │
  Appointment booked (status: pending_confirmation)
         │
         ▼
  Confirmation email sent to customer
         │
  Customer clicks "Confirm" link
         │
         ▼
  Appointment confirmed + Google Calendar event created
```

---

## Project Structure

```
AI_Agent/
├── backend/                        Python / FastAPI server
│   ├── app/
│   │   ├── main.py                 App entry point; registers all routers
│   │   ├── config.py               All settings loaded from .env
│   │   ├── agent/
│   │   │   ├── state.py            LangGraph state (call metadata + flags)
│   │   │   ├── tools.py            6 tools the AI can call
│   │   │   └── graph.py            LangGraph ReAct graph + ReceptionistAgent class
│   │   ├── services/
│   │   │   ├── supabase_service.py Database operations (CRUD + vector search)
│   │   │   ├── whisper_service.py  OpenAI Whisper speech-to-text
│   │   │   ├── tts_service.py      ElevenLabs text-to-speech
│   │   │   └── twilio_service.py   Twilio TwiML and call control
│   │   └── routers/
│   │       ├── webhook.py          Twilio call webhook + audio WebSocket
│   │       ├── Business.py           Business settings and knowledge base
│   │       ├── appointments.py     Appointment CRUD
│   │       ├── confirm.py          Email confirmation link handler
│   │       └── test_agent.py       Text-mode agent testing (no phone needed)
│   ├── requirements.txt
│   └── .env                        Your secrets and config (never commit this)
│
├── frontend/                       Next.js dashboard
│   ├── app/
│   │   ├── page.tsx                Dashboard (stats, recent calls)
│   │   ├── appointments/           Appointment management table
│   │   └── test/                   Chat interface to test the agent
│   ├── components/
│   │   └── Navbar.tsx
│   └── lib/api.ts                  All API calls to the backend
│
└── supabase/
    └── migrations/
        ├── 001_initial.sql         Creates all tables and vector index
        └── 002_pending_confirmation_status.sql  Adds pending_confirmation status
```

---

## Services Used

| Service | Purpose | Where used |
|---|---|---|
| **OpenAI GPT-4o** | AI agent brain | `agent/graph.py` |
| **OpenAI Whisper** | Speech → text | `services/whisper_service.py` |
| **OpenAI Embeddings** | Knowledge base vectors | `services/supabase_service.py` |
| **ElevenLabs** | Text → speech | `services/tts_service.py` |
| **Supabase** | Database + vector store | `services/supabase_service.py` |
| **Twilio** | Phone number + audio stream | `routers/webhook.py` |
| **Google Calendar** | Sync confirmed appointments | `services/calendar_service.py` |
| **SMTP (Gmail etc.)** | Send confirmation emails | `services/email_service.py` |

---

## Database Tables (Supabase)

### `companies`
Stores Business/business info.

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| name | text | Business name |
| phone_number | text | Twilio number that routes here |
| business_hours | jsonb | `{"monday": {"open":"09:00","close":"17:00"}, ...}` |
| slot_duration_minutes | int | Length of each appointment slot |
| system_prompt | text | Custom personality/instructions for the AI |

### `company_documents`
The AI's knowledge base — anything you want it to know (services, pricing, policies, FAQs).

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| company_id | uuid | FK → companies |
| title | text | Document label |
| content | text | Raw text content |
| embedding | vector(1536) | OpenAI embedding for similarity search |

### `appointments`

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| company_id | uuid | FK → companies |
| customer_name | text | |
| customer_phone | text | |
| customer_email | text | Required for confirmation email |
| service | text | What they're coming in for |
| scheduled_at | timestamptz | Date and time |
| status | text | `pending_confirmation` → `confirmed` / `cancelled` |

### `call_logs`
Full record of every call, including transcript and outcome.

| Column | Type | Description |
|---|---|---|
| call_sid | text | Twilio's unique call ID |
| transcript | text | Full conversation text |
| outcome | text | `appointment_booked`, `question_answered`, etc. |
| appointment_id | uuid | FK → appointments (if one was booked) |

---

## Agent Tools

The AI agent (GPT-4o + LangGraph) can call these tools during a conversation:

| Tool | What it does |
|---|---|
| `search_company_knowledge` | Searches the vector knowledge base to answer questions |
| `get_available_appointment_slots` | Returns open time slots based on business hours and existing bookings |
| `book_appointment` | Creates an appointment (status: `pending_confirmation`) |
| `reschedule_appointment` | Moves an existing appointment to a new time |
| `cancel_appointment` | Cancels an existing appointment |
| `end_call_gracefully` | Signals that the call is done and should be closed |

---

## API Endpoints

### Twilio (called automatically — no manual use needed)
| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook/voice` | Twilio calls this when a call arrives |
| POST | `/webhook/status` | Twilio calls this when a call ends |
| WebSocket | `/ws/stream/{call_sid}` | Real-time audio exchange |

### Business Management
| Method | Path | Purpose |
|---|---|---|
| GET | `/Business` | Get Business settings |
| PATCH | `/Business` | Update name, hours, AI persona, etc. |
| GET | `/Business/documents` | List knowledge base documents |
| POST | `/Business/documents` | Add a document (auto-embeds) |
| DELETE | `/Business/documents/{id}` | Remove a document |
| GET | `/Business/calls` | List recent call logs |

### Appointments
| Method | Path | Purpose |
|---|---|---|
| GET | `/appointments` | List appointments (filter by status) |
| POST | `/appointments` | Create appointment manually |
| PATCH | `/appointments/{id}` | Update appointment |
| GET | `/appointments/slots` | Get available slots for a date |

### Confirmation (customer-facing email links)
| Method | Path | Purpose |
|---|---|---|
| GET | `/confirm/{id}?action=confirm&token=...` | Customer confirms appointment |
| GET | `/confirm/{id}?action=cancel&token=...` | Customer cancels appointment |

### Testing
| Method | Path | Purpose |
|---|---|---|
| POST | `/test/agent` | Chat with the agent as text (no phone needed) |
| DELETE | `/test/agent/{session_id}` | Reset a test conversation |

---

## Complete Call Flow

```
1. CALL ARRIVES
   Twilio receives the call and POSTs to POST /webhook/voice.
   The server looks up the Business, creates a call log entry,
   and responds with TwiML that opens a WebSocket audio stream.

2. AUDIO STREAM OPENS
   Twilio connects to WebSocket /ws/stream/{call_sid}.
   The server creates a ReceptionistAgent and immediately
   sends a TTS greeting: "Thank you for calling {Business name}.
   How can I help you today?"

3. CUSTOMER SPEAKS
   Twilio streams audio as 8-bit μ-law chunks at 8 kHz.
   The server computes RMS energy on each chunk (voice activity
   detection). When speech is detected and then silence is sustained,
   the buffered audio is sent to OpenAI Whisper for transcription.

4. AGENT THINKS
   The transcript becomes a HumanMessage in the LangGraph state.
   GPT-4o decides what to do next — it may call one or more tools:
   - Search knowledge base for factual answers
   - Check available slots before booking
   - Book / reschedule / cancel an appointment
   - Signal end of call
   The graph loops between the LLM and tools until the LLM
   produces a final text response with no more tool calls.

5. AI RESPONDS
   The response text goes to ElevenLabs TTS → MP3 → converted to
   μ-law 8 kHz → sent back to Twilio over the WebSocket.
   The customer hears the AI's voice. Steps 3–5 repeat for each turn.

6. APPOINTMENT BOOKED
   When the agent calls book_appointment(), a row is inserted
   in the appointments table with status = "pending_confirmation".
   The agent tells the caller: "A confirmation email will be sent —
   please click Confirm to finalise your booking."

7. CALL ENDS
   When the agent calls end_call_gracefully(), the WebSocket loop
   exits. The final transcript and outcome are saved to call_logs.
   If an appointment was booked, a confirmation email is sent to
   the customer's email address.

8. CUSTOMER CONFIRMS
   The email contains two HMAC-signed links:
   - "Confirm Appointment" → GET /confirm/{id}?action=confirm&token=...
     → Status updated to "confirmed", Google Calendar event created.
   - "Cancel Appointment" → GET /confirm/{id}?action=cancel&token=...
     → Status updated to "cancelled".
   The customer sees a simple HTML confirmation page.
```

---

## Setup & Running

### 1. Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_initial.sql`
3. Then run `supabase/migrations/002_pending_confirmation_status.sql`
4. Copy your **Project URL** and **service_role** key

### 2. Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env with your API keys
uvicorn app.main:app --reload --port 8000
```

### 3. Create your Business
```bash
curl -X POST http://localhost:8000/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "My Business", "phone_number": "+1xxxxxxxxxx", "slot_duration_minutes": 30}'
```

Copy the returned `id` and add it to `.env`:
```env
COMPANY_ID=paste-uuid-here
```

Restart the backend.

### 4. Add knowledge base documents
```bash
curl -X POST http://localhost:8000/Business/documents \
  -H "Content-Type: application/json" \
  -d '{"title": "Services", "content": "We offer cleanings, fillings, and whitening. Open Mon–Fri 9am–5pm."}'
```

### 5. Expose to Twilio (local dev)
```bash
ngrok http 8000
# Copy the https://xxxx.ngrok.io URL → set PUBLIC_BASE_URL in .env → restart backend
```

Configure your Twilio number's voice webhook:
- URL: `https://xxxx.ngrok.io/webhook/voice`
- Method: `HTTP POST`

### 6. Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 7. Test without a phone call
Go to **http://localhost:3000/test** and type messages to chat with the agent directly.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | GPT-4o agent + Whisper + embeddings |
| `ELEVENLABS_API_KEY` | Yes | Text-to-speech |
| `ELEVENLABS_VOICE_ID` | Yes | Voice from your ElevenLabs library |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | service_role key (not anon) |
| `TWILIO_ACCOUNT_SID` | Yes | From Twilio Console |
| `TWILIO_AUTH_TOKEN` | Yes | From Twilio Console |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio phone number |
| `PUBLIC_BASE_URL` | Yes | Your server's public URL (ngrok URL for dev) |
| `COMPANY_ID` | Yes | UUID of your Business row in Supabase |
| `AGENT_LLM_MODEL` | No | Default: `gpt-4o` |
| `SMTP_HOST` | No | For confirmation emails (e.g. `smtp.gmail.com`) |
| `SMTP_USERNAME` | No | Email address to send from |
| `SMTP_PASSWORD` | No | Email password or app password |
| `CONFIRMATION_SECRET` | No | HMAC secret for confirmation links |
| `GOOGLE_CALENDAR_CREDENTIALS_FILE` | No | Path to Google service account JSON |
| `GOOGLE_CALENDAR_ID` | No | Calendar ID (default: `primary`) |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `model not found` error | Check `AGENT_LLM_MODEL` in `.env` — must be an OpenAI model name (e.g. `gpt-4o`) |
| `Business not configured` error | `COMPANY_ID` in `.env` is empty — create a company first and paste its UUID |
| No documents found by agent | Documents need embeddings — re-add them after Supabase is set up |
| Twilio webhook fails | Make sure ngrok is running and `PUBLIC_BASE_URL` in `.env` matches the ngrok URL |
| Audio sounds garbled | Confirm ffmpeg is installed (`ffmpeg -version`) |
| `audioop` not found | Use Python 3.11 or 3.12 (`audioop` was removed in 3.13) |
