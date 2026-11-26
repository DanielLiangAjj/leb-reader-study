-- Reader study page: allow a third reader (reader number 3).
-- Run once in the SQL editor of the Supabase project, after supabase/schema.sql. It removes no row and changes no stored answer.
-- A database made from the current supabase/schema.sql already allows reader 3 and does not need this file.

-- 1. The rule on the column: 1, 2 or 3 instead of 1 or 2.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.rdr_readers'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%reader%'
  loop
    execute format('alter table public.rdr_readers drop constraint %I', c);
  end loop;
end $$;
alter table public.rdr_readers add constraint rdr_readers_reader_check check (reader in (1, 2, 3));

-- 2. The function that registers a reader: the same as before, with 3 allowed.
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

-- 3. Check: this should list one rule that names 1, 2 and 3.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.rdr_readers'::regclass and contype = 'c';
