-- Reader study page (living evidence base): database.
-- Every table and function carries the prefix rdr_, so this file can be run in a project of its own or in
-- the project that already serves the rating sites, without touching their tables.
-- Paste this whole file into the Supabase SQL editor and press Run, once.
-- (Running it again is harmless: tables are created only if missing and functions are replaced.)
--
-- Visitors use the public anon key. Row-level security is on and there are no policies, and the table
-- privileges are revoked, so visitors can never read or write the tables directly. The four
-- SECURITY DEFINER functions at the bottom are the only door; each one checks its inputs.

create table if not exists public.rdr_readers (
  code         text primary key,
  reader       smallint not null check (reader in (1, 2, 3)),
  name         text not null,
  email        text not null,
  user_agent   text,
  created_at   timestamptz default now(),
  last_seen    timestamptz,
  completed_at timestamptz
);

create table if not exists public.rdr_forms (
  id          bigserial primary key,
  code        text not null references public.rdr_readers (code),
  sheet       text not null,
  item_id     text not null,
  answer      jsonb not null,
  elapsed_ms  integer,
  client_ts   timestamptz,
  app_version text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (code, sheet, item_id)
);

alter table public.rdr_readers enable row level security;
alter table public.rdr_forms enable row level security;
-- No policies on purpose: anon and authenticated get no rows and can change nothing.
revoke all on table public.rdr_readers from anon, authenticated;
revoke all on table public.rdr_forms from anon, authenticated;
revoke all on sequence public.rdr_forms_id_seq from anon, authenticated;

-- rdr_register_reader: create the reader, or update name, email and last_seen for a known code.
-- The reader number (1, 2 or 3) is set once and never changed by a later call.
create or replace function public.rdr_register_reader(
  p_code text,
  p_reader integer,
  p_name text,
  p_email text,
  p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    raise exception 'invalid code';
  end if;
  if p_reader is null or p_reader not in (1, 2, 3) then
    raise exception 'invalid reader';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception 'invalid name';
  end if;
  if p_email is null or char_length(btrim(p_email)) not between 3 and 254
     or btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;

  insert into public.rdr_readers (code, reader, name, email, user_agent, last_seen)
  values (p_code, p_reader, btrim(p_name), btrim(p_email), left(p_user_agent, 500), now())
  on conflict (code) do update
    set name = excluded.name,
        email = excluded.email,
        last_seen = now();
end;
$$;

-- rdr_save_form: upsert one submitted form; when the row exists, keep whichever has the later client_ts.
-- sheet: 'practice' and 'scored' are the trials of Part 1; 'survey' holds everything else, told apart by item_id:
-- S1 (the questions at the end of Part 1), K01 to K50 (Part 2, one abstract of the answer key) and H01 to H40 (Part 3,
-- one item of the second reading). Nothing here had to change for Parts 2 and 3.
create or replace function public.rdr_save_form(
  p_code text,
  p_sheet text,
  p_item_id text,
  p_answer jsonb,
  p_elapsed_ms integer,
  p_client_ts timestamptz,
  p_app_version text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    raise exception 'invalid code';
  end if;
  if p_sheet is null or p_sheet not in ('practice', 'scored', 'survey') then
    raise exception 'invalid sheet';
  end if;
  if p_item_id is null or char_length(p_item_id) not between 1 and 10 then
    raise exception 'invalid item id';
  end if;
  if p_answer is null or jsonb_typeof(p_answer) <> 'object' or pg_column_size(p_answer) >= 32768 then
    raise exception 'invalid answer';
  end if;
  if p_elapsed_ms is not null and p_elapsed_ms < 0 then
    raise exception 'invalid elapsed time';
  end if;
  if p_client_ts is null then
    raise exception 'missing client timestamp';
  end if;
  if p_app_version is not null and char_length(p_app_version) > 40 then
    raise exception 'invalid app version';
  end if;
  if not exists (select 1 from public.rdr_readers e where e.code = p_code) then
    raise exception 'unknown reader';
  end if;

  insert into public.rdr_forms as r (code, sheet, item_id, answer, elapsed_ms, client_ts, app_version)
  values (p_code, p_sheet, p_item_id, p_answer, p_elapsed_ms, p_client_ts, p_app_version)
  on conflict (code, sheet, item_id) do update
    set answer = excluded.answer,
        elapsed_ms = excluded.elapsed_ms,
        client_ts = excluded.client_ts,
        app_version = excluded.app_version,
        updated_at = now()
    where r.client_ts is null or excluded.client_ts >= r.client_ts;

  update public.rdr_readers set last_seen = now() where code = p_code;
end;
$$;

-- rdr_get_progress: {reader, name, email, completed_at, forms: [{sheet, item_id, answer, elapsed_ms, client_ts, app_version}]}
-- for this code only, or null when the code is unknown.
create or replace function public.rdr_get_progress(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    raise exception 'invalid code';
  end if;

  select jsonb_build_object(
           'reader', e.reader,
           'name', e.name,
           'email', e.email,
           'completed_at', e.completed_at,
           'forms', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sheet', r.sheet,
                      'item_id', r.item_id,
                      'answer', r.answer,
                      'elapsed_ms', r.elapsed_ms,
                      'client_ts', r.client_ts,
                      'app_version', r.app_version) order by r.id)
               from public.rdr_forms r
              where r.code = e.code), '[]'::jsonb))
    into result
    from public.rdr_readers e
   where e.code = p_code;

  return result;
end;
$$;

-- rdr_finish: record when the reader reached the end (the first time is kept).
create or replace function public.rdr_finish(p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    raise exception 'invalid code';
  end if;

  update public.rdr_readers
     set completed_at = coalesce(completed_at, now()),
         last_seen = now()
   where code = p_code;

  if not found then
    raise exception 'unknown reader';
  end if;
end;
$$;

-- Who may call the functions: visitors and the service role, nobody else by default.
revoke all on function public.rdr_register_reader(text, integer, text, text, text) from public;
revoke all on function public.rdr_save_form(text, text, text, jsonb, integer, timestamptz, text) from public;
revoke all on function public.rdr_get_progress(text) from public;
revoke all on function public.rdr_finish(text) from public;
grant execute on function public.rdr_register_reader(text, integer, text, text, text) to anon, authenticated, service_role;
grant execute on function public.rdr_save_form(text, text, text, jsonb, integer, timestamptz, text) to anon, authenticated, service_role;
grant execute on function public.rdr_get_progress(text) to anon, authenticated, service_role;
grant execute on function public.rdr_finish(text) to anon, authenticated, service_role;

-- Ask the API layer to pick up the new functions straight away.
notify pgrst, 'reload schema';
