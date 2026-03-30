-- Add 'pending_confirmation' to appointment status and add calendar_event_id to metadata
-- Run this migration on your Supabase project

-- Drop the existing check constraint and recreate it with the new status
alter table appointments
  drop constraint if exists appointments_status_check;

alter table appointments
  add constraint appointments_status_check
    check (status in ('pending_confirmation','confirmed','cancelled','rescheduled','completed','no_show'));

-- Update the default status to pending_confirmation
alter table appointments
  alter column status set default 'pending_confirmation';

-- Update the no-overlap unique index to also exclude pending_confirmation from blocking slots
-- (pending slots should still block the slot until confirmed or cancelled)
-- The existing index already handles this correctly since pending_confirmation is not in the exclusion list.
-- If you want pending appointments NOT to block slots, uncomment the lines below:
-- drop index if exists appointments_no_overlap_idx;
-- create unique index appointments_no_overlap_idx
--   on appointments(company_id, scheduled_at)
--   where status not in ('cancelled','rescheduled','no_show');
