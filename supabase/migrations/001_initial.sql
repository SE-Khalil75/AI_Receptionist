-- Enable required extensions
create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Companies
-- ─────────────────────────────────────────────
create table if not exists companies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  phone_number  text unique,
  business_hours jsonb default '{
    "monday":    {"open": "09:00", "close": "17:00"},
    "tuesday":   {"open": "09:00", "close": "17:00"},
    "wednesday": {"open": "09:00", "close": "17:00"},
    "thursday":  {"open": "09:00", "close": "17:00"},
    "friday":    {"open": "09:00", "close": "17:00"},
    "saturday":  null,
    "sunday":    null
  }',
  slot_duration_minutes int default 60,
  system_prompt text,
  settings      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Company Knowledge Base (vector store)
-- ─────────────────────────────────────────────
create table if not exists company_documents (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies(id) on delete cascade,
  title       text,
  content     text not null,
  metadata    jsonb default '{}',
  embedding   vector(1536),
  created_at  timestamptz default now()
);

create index if not exists company_documents_company_id_idx
  on company_documents(company_id);

create index if not exists company_documents_embedding_idx
  on company_documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function match_documents(
  query_embedding   vector(1536),
  match_count       int,
  company_id_filter uuid,
  similarity_threshold float default 0.5
)
returns table (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from company_documents
  where
    company_id = company_id_filter
    and 1 - (embedding <=> query_embedding) > similarity_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ─────────────────────────────────────────────
-- Appointments
-- ─────────────────────────────────────────────
create table if not exists appointments (
  id                 uuid primary key default uuid_generate_v4(),
  company_id         uuid not null references companies(id) on delete cascade,
  customer_name      text not null,
  customer_phone     text not null,
  customer_email     text,
  service            text,
  scheduled_at       timestamptz not null,
  duration_minutes   int default 60,
  status             text default 'confirmed'
                       check (status in ('confirmed','cancelled','rescheduled','completed','no_show')),
  notes              text,
  call_log_id        uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists appointments_company_id_idx   on appointments(company_id);
create index if not exists appointments_scheduled_at_idx on appointments(scheduled_at);
create index if not exists appointments_status_idx       on appointments(status);

create unique index if not exists appointments_no_overlap_idx
  on appointments(company_id, scheduled_at)
  where status not in ('cancelled','rescheduled');

-- ─────────────────────────────────────────────
-- Call Logs
-- ─────────────────────────────────────────────
create table if not exists call_logs (
  id               uuid primary key default uuid_generate_v4(),
  company_id       uuid references companies(id),
  call_sid         text unique not null,
  caller_number    text,
  called_number    text,
  duration_seconds int,
  transcript       text,
  outcome          text,
  appointment_id   uuid references appointments(id),
  started_at       timestamptz default now(),
  ended_at         timestamptz,
  metadata         jsonb default '{}'
);

create index if not exists call_logs_company_id_idx on call_logs(company_id);
create index if not exists call_logs_call_sid_idx   on call_logs(call_sid);

-- ─────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────
alter table companies          enable row level security;
alter table company_documents  enable row level security;
alter table appointments       enable row level security;
alter table call_logs          enable row level security;

create policy "service role full access - companies"
  on companies for all using (true) with check (true);
create policy "service role full access - documents"
  on company_documents for all using (true) with check (true);
create policy "service role full access - appointments"
  on appointments for all using (true) with check (true);
create policy "service role full access - call_logs"
  on call_logs for all using (true) with check (true);

-- ─────────────────────────────────────────────
-- Triggers: updated_at
-- ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_companies
  before update on companies
  for each row execute function set_updated_at();

create trigger set_updated_at_appointments
  before update on appointments
  for each row execute function set_updated_at();
