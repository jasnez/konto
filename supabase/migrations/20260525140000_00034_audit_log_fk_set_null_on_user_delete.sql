-- audit_log: dopusti jedini UPDATE koji Postgres radi za
--   FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE SET NULL
-- kada se korisnik obriše (append-only trigger 00014 inače to blokira i
-- auth.admin.deleteUser vraća "Database error deleting user").

create or replace function public.audit_log_prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.user_id is not null
       and new.user_id is null
       and old.id = new.id
       and old.event_type = new.event_type
       and old.event_data is not distinct from new.event_data
       and old.ip_hash is not distinct from new.ip_hash
       and old.user_agent_hash is not distinct from new.user_agent_hash
       and old.created_at = new.created_at
    then
      return new;
    end if;
  end if;
  raise exception 'audit_log is append-only (tg_op=%)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.audit_log_prevent_mutation() is
  'BLOKIRA proizvoljni UPDATE/DELETE; iznimka: FK postavlja user_id u NULL pri brisanju auth korisnika.';
