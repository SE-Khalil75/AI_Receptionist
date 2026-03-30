from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenAI
    openai_api_key: str

    # Supabase
    supabase_url: str
    supabase_service_key: str

    # Twilio
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_phone_number: str

    # App
    public_base_url: str = "http://localhost:8000"

    # ElevenLabs TTS
    elevenlabs_api_key: str
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRTpX"  # default: "George" – change in .env

    # Model config
    agent_llm_model: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-small"
    whisper_model: str = "whisper-1"

    # STT provider: "deepgram" or "whisper"
    stt_provider: str = "deepgram"
    deepgram_api_key: str = ""

    # Audio processing
    silence_threshold: float = 150.0      # RMS energy below this = silence
    silence_frames_needed: int = 100      # consecutive silent 20ms frames → end of speech (100 × 20ms = 2 s)
    min_speech_frames: int = 4            # ignore very short utterances

    # Single-Business config: UUID of the one company row in Supabase
    company_id: str = ""

    # Email / SMTP (for appointment confirmation emails)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from: str = ""

    # HMAC secret for tamper-proof confirmation links
    confirmation_secret: str = "change-me-in-production"

    # Google Calendar (service-account JSON key file path + calendar ID)
    google_calendar_credentials_file: str = ""
    google_calendar_id: str = "primary"


settings = Settings()
