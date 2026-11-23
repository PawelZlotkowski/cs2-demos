-- Round Reviewer clip labeller (round-reviewer-clips-v1 / round-reviewer-notes-v1).
--
-- Tables live in the private schema "labeler", which the Supabase Data API does not expose.
-- The application calls only the public.labeler_* functions, as service_role, from the Vercel
-- server. Each function re-checks the session, role, assignment and publication state inside
-- its own transaction. Browser roles (anon, authenticated, PUBLIC) have no privileges at all.
--
-- Errors use SQLSTATE LB4xx so the server can map them to HTTP status codes.

create schema if not exists labeler;
revoke all on schema labeler from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema labeler from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema labeler from authenticated'; end if;
end $$;

-- ---------------------------------------------------------------- tables

create table labeler.workspace (
  singleton boolean primary key default true check (singleton),
  origin_id text not null check (origin_id ~ '^[a-f0-9]{32}$'),
  created_at timestamptz not null default now()
);
insert into labeler.workspace (origin_id) values (replace(gen_random_uuid()::text, '-', ''));

create table labeler.accounts (
  id uuid primary key default gen_random_uuid(),
  handle text not null check (handle ~ '^[A-Za-z0-9_]{1,40}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role text not null check (role in ('admin', 'reviewer')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  code_digest text check (code_digest ~ '^[a-f0-9]{64}$'),
  credential_version integer not null default 1,
  code_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'inactive' or code_digest is not null)
);
create unique index accounts_handle_key on labeler.accounts (lower(handle));
create unique index accounts_code_key on labeler.accounts (code_digest) where code_digest is not null;

create table labeler.sessions (
  id bigint generated always as identity primary key,
  account_id uuid not null references labeler.accounts (id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  credential_version integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now()
);
create index sessions_open on labeler.sessions (account_id) where revoked_at is null;

create table labeler.login_attempts (
  bucket text not null,
  window_start timestamptz not null,
  attempts integer not null default 0,
  primary key (bucket, window_start)
);

create table labeler.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz
);

-- Private source manifest per demo: full metadata and provenance, never sent to reviewers.
create table labeler.demos (
  id text primary key check (id ~ '^demo-[a-f0-9]{64}$'),
  map text not null check (map in ('de_ancient', 'de_anubis')),
  metadata jsonb not null,
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per immutable media identity (local footage id + file SHA-256).
create table labeler.clips (
  id uuid primary key default gen_random_uuid(),
  footage_id text not null check (footage_id ~ '^[a-f0-9]{32}$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check (bytes > 0),
  demo_id text not null references labeler.demos (id),
  player_id text not null check (player_id ~ '^[0-9]{1,20}$'),
  snapshot_id text not null check (char_length(snapshot_id) between 1 and 200),
  finding_id text not null check (finding_id ~ '^F[0-9]+$'),
  round integer not null check (round >= 1),
  context jsonb not null,
  media_state text not null default 'pending' check (media_state in ('pending', 'ready')),
  object_key text unique,
  ready_upload_id uuid,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  unique (footage_id, sha256),
  check ((media_state = 'ready') = (object_key is not null))
);
create index clips_review_key on labeler.clips (demo_id, player_id, snapshot_id, finding_id);

create table labeler.collection_clips (
  collection_id uuid not null references labeler.collections (id),
  clip_id uuid not null references labeler.clips (id),
  position integer not null,
  published_at timestamptz,
  added_at timestamptz not null default now(),
  primary key (collection_id, clip_id)
);
create index collection_clips_clip on labeler.collection_clips (clip_id);

create table labeler.assignments (
  collection_id uuid not null references labeler.collections (id),
  account_id uuid not null references labeler.accounts (id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (collection_id, account_id)
);
create index assignments_account on labeler.assignments (account_id) where revoked_at is null;

create table labeler.uploads (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references labeler.clips (id),
  created_by uuid not null references labeler.accounts (id),
  bucket text not null,
  object_key text not null unique,
  r2_upload_id text,
  expected_bytes bigint not null check (expected_bytes > 0),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  part_size integer not null check (part_size >= 5242880),
  part_count integer not null check (part_count between 1 and 10000),
  status text not null check (status in ('reserved', 'active', 'completing', 'completed', 'aborted', 'expired', 'superseded')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index uploads_one_open on labeler.uploads (clip_id) where status in ('reserved', 'active', 'completing');

create table labeler.upload_parts (
  upload_id uuid not null references labeler.uploads (id),
  part_number integer not null check (part_number between 1 and 10000),
  etag text not null check (char_length(etag) between 1 and 200),
  bytes bigint not null check (bytes > 0),
  recorded_at timestamptz not null default now(),
  primary key (upload_id, part_number)
);

-- Append-only reviewer revisions; the revision number is database-generated and monotonic.
create table labeler.review_revisions (
  revision bigint generated always as identity primary key,
  account_id uuid not null references labeler.accounts (id),
  clip_id uuid not null references labeler.clips (id),
  request_id uuid not null,
  previous_revision bigint,
  status text not null check (status in ('draft', 'complete', 'skipped')),
  notes text not null default '' check (char_length(notes) <= 6000),
  assessment text check (assessment in ('good', 'mistake', 'uncertain')),
  language text not null check (language in ('en', 'pl')),
  confirm_footage boolean not null default false,
  issue text check (issue in ('wrong_footage', 'insufficient_context')),
  created_at timestamptz not null default now(),
  unique (account_id, request_id),
  check (status <> 'complete' or (confirm_footage and char_length(btrim(notes)) > 0 and issue is null)),
  check (confirm_footage = (status = 'complete'))
);
create index review_revisions_key on labeler.review_revisions (account_id, clip_id, revision);

create table labeler.review_heads (
  account_id uuid not null references labeler.accounts (id),
  clip_id uuid not null references labeler.clips (id),
  revision bigint not null references labeler.review_revisions (revision),
  status text not null check (status in ('draft', 'complete', 'skipped')),
  updated_at timestamptz not null default now(),
  primary key (account_id, clip_id)
);
create index review_heads_clip on labeler.review_heads (clip_id);

-- ---------------------------------------------------------------- guards

create function labeler.reject_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'LB409', message = tg_table_name || ' rows are append-only.';
end $$;

create trigger review_revisions_append_only before update or delete on labeler.review_revisions
  for each row execute function labeler.reject_change();

create function labeler.keep_account_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.handle <> old.handle or new.role <> old.role or new.created_at <> old.created_at then
    raise exception using errcode = 'LB409', message = 'Account ID, handle and role are immutable.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger accounts_identity before update on labeler.accounts
  for each row execute function labeler.keep_account_identity();

create function labeler.keep_clip_media() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.footage_id <> old.footage_id or new.sha256 <> old.sha256 or new.bytes <> old.bytes
     or new.demo_id <> old.demo_id or new.player_id <> old.player_id or new.snapshot_id <> old.snapshot_id
     or new.finding_id <> old.finding_id or new.round <> old.round or new.context <> old.context then
    raise exception using errcode = 'LB409', message = 'Clip source identity is immutable. Import changed media as a new version.';
  end if;
  if old.media_state = 'ready' and (new.media_state <> 'ready' or new.object_key is distinct from old.object_key
       or new.ready_upload_id is distinct from old.ready_upload_id) then
    raise exception using errcode = 'LB409', message = 'Ready media is immutable.';
  end if;
  return new;
end $$;

create trigger clips_immutable before update on labeler.clips
  for each row execute function labeler.keep_clip_media();

create function labeler.no_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'LB409', message = tg_table_name || ' rows are kept for review history.';
end $$;

create trigger clips_keep before delete on labeler.clips for each row execute function labeler.no_delete();
create trigger review_heads_keep before delete on labeler.review_heads for each row execute function labeler.no_delete();
create trigger accounts_keep before delete on labeler.accounts for each row execute function labeler.no_delete();
create trigger demos_keep before delete on labeler.demos for each row execute function labeler.no_delete();
create trigger collections_keep before delete on labeler.collections for each row execute function labeler.no_delete();

-- ---------------------------------------------------------------- helpers

create function labeler.fail(p_code text, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = p_code, message = p_message;
end $$;

create function labeler.text_param(p jsonb, p_key text, p_pattern text, p_label text) returns text
language plpgsql set search_path = '' as $$
declare v text;
begin
  if jsonb_typeof(p -> p_key) is distinct from 'string' then
    perform labeler.fail('LB422', p_label || ' is required.');
  end if;
  v := p ->> p_key;
  if p_pattern is not null and v !~ p_pattern then
    perform labeler.fail('LB422', p_label || ' is invalid.');
  end if;
  return v;
end $$;

create function labeler.uuid_param(p jsonb, p_key text, p_label text) returns uuid
language plpgsql set search_path = '' as $$
begin
  return labeler.text_param(p, p_key, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', p_label)::uuid;
end $$;

create function labeler.int_param(p jsonb, p_key text, p_min bigint, p_max bigint, p_label text) returns bigint
language plpgsql set search_path = '' as $$
declare v bigint;
begin
  if jsonb_typeof(p -> p_key) is distinct from 'number' or (p ->> p_key) !~ '^[0-9]+$' then
    perform labeler.fail('LB422', p_label || ' must be a whole number.');
  end if;
  v := (p ->> p_key)::bigint;
  if v < p_min or v > p_max then
    perform labeler.fail('LB422', p_label || ' is out of range.');
  end if;
  return v;
end $$;

create function labeler.hex64(p jsonb, p_key text, p_label text) returns text
language plpgsql set search_path = '' as $$
begin
  return labeler.text_param(p, p_key, '^[a-f0-9]{64}$', p_label);
end $$;

-- The session check every authenticated function runs first. FOR SHARE on the account row
-- serialises this transaction against deactivation, code regeneration and session revocation.
create function labeler.session_account(p jsonb, p_role text) returns labeler.accounts
language plpgsql set search_path = '' as $$
declare
  v_token text;
  s labeler.sessions;
  a labeler.accounts;
begin
  if jsonb_typeof(p -> 'tokenHash') is distinct from 'string' or (p ->> 'tokenHash') !~ '^[a-f0-9]{64}$' then
    perform labeler.fail('LB401', 'Sign in with your access code.');
  end if;
  v_token := p ->> 'tokenHash';
  select * into s from labeler.sessions where token_hash = v_token;
  if not found or s.revoked_at is not null or s.expires_at <= now() then
    perform labeler.fail('LB401', 'Your session has ended. Sign in with your access code.');
  end if;
  select * into a from labeler.accounts where id = s.account_id for share;
  if a.status <> 'active' or a.credential_version <> s.credential_version then
    perform labeler.fail('LB401', 'Your access has changed. Sign in with your current access code.');
  end if;
  -- Re-read the session under the account lock: a revocation may have committed meanwhile.
  select * into s from labeler.sessions where id = s.id;
  if s.revoked_at is not null then
    perform labeler.fail('LB401', 'Your session has ended. Sign in with your access code.');
  end if;
  if p_role is not null and a.role <> p_role then
    perform labeler.fail('LB403', 'This area is for the administrator.');
  end if;
  if s.last_seen_at < now() - interval '5 minutes' then
    update labeler.sessions set last_seen_at = now() where id = s.id;
  end if;
  return a;
end $$;

-- A reviewer may see and save a clip only through an active assignment to a published,
-- non-archived collection in which the clip is published and its media is ready.
create function labeler.can_review(p_account uuid, p_clip uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from labeler.assignments a
    join labeler.collections c on c.id = a.collection_id and c.status = 'published'
    join labeler.collection_clips cc on cc.collection_id = c.id and cc.clip_id = p_clip and cc.published_at is not null
    join labeler.clips k on k.id = cc.clip_id and k.media_state = 'ready'
    where a.account_id = p_account and a.revoked_at is null
  );
$$;

create function labeler.player_name(p_metadata jsonb, p_player text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    (select nullif(btrim(e ->> 'name'), '') from jsonb_array_elements(coalesce(p_metadata -> 'players', '[]'::jsonb)) e
     where e ->> 'id' = p_player limit 1),
    'Selected player');
$$;

create function labeler.revoke_sessions(p_account uuid) returns integer
language plpgsql set search_path = '' as $$
declare n integer;
begin
  update labeler.sessions set revoked_at = now() where account_id = p_account and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function labeler.account_json(a labeler.accounts) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'handle', a.handle, 'displayName', a.display_name,
                            'role', a.role, 'status', a.status);
$$;

create function labeler.review_json(r labeler.review_revisions) returns jsonb
language sql stable set search_path = '' as $$
  select case when r.revision is null then null else jsonb_build_object(
    'revision', r.revision, 'status', r.status, 'notes', r.notes, 'assessment', r.assessment,
    'language', r.language, 'issue', r.issue, 'confirmFootage', r.confirm_footage,
    'savedAt', r.created_at, 'requestId', r.request_id) end;
$$;

-- ---------------------------------------------------------------- sign-in

create function public.labeler_login(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_digest text := labeler.hex64(p, 'codeDigest', 'Access code');
  v_bucket text := labeler.hex64(p, 'ipBucket', 'Client bucket');
  v_token text := labeler.hex64(p, 'tokenHash', 'Session');
  v_window_seconds integer := labeler.int_param(p, 'windowSeconds', 60, 86400, 'Window');
  v_ip_limit integer := labeler.int_param(p, 'ipLimit', 1, 10000, 'Client limit');
  v_global_limit integer := labeler.int_param(p, 'globalLimit', 1, 100000, 'Global limit');
  v_reviewer_ttl integer := labeler.int_param(p, 'reviewerTtlSeconds', 300, 2592000, 'Reviewer session');
  v_admin_ttl integer := labeler.int_param(p, 'adminTtlSeconds', 300, 604800, 'Admin session');
  v_window timestamptz;
  v_ip integer;
  v_global integer;
  v_expires timestamptz;
  a labeler.accounts;
begin
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_window_seconds) * v_window_seconds);
  insert into labeler.login_attempts as t (bucket, window_start, attempts) values ('ip:' || v_bucket, v_window, 1)
    on conflict (bucket, window_start) do update set attempts = t.attempts + 1
    returning attempts into v_ip;
  insert into labeler.login_attempts as t (bucket, window_start, attempts) values ('global', v_window, 1)
    on conflict (bucket, window_start) do update set attempts = t.attempts + 1
    returning attempts into v_global;
  delete from labeler.login_attempts where window_start < now() - interval '2 days';
  if v_ip > v_ip_limit or v_global > v_global_limit then
    return jsonb_build_object('status', 'rate_limited', 'retryAfter',
      greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => v_window_seconds) - clock_timestamp())))::integer));
  end if;
  -- FOR UPDATE re-evaluates the digest after a concurrent regeneration commits, so an
  -- obsolete code cannot create a session once its replacement exists.
  select * into a from labeler.accounts where code_digest = v_digest and status = 'active' for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_expires := now() + make_interval(secs => case when a.role = 'admin' then v_admin_ttl else v_reviewer_ttl end);
  insert into labeler.sessions (account_id, token_hash, credential_version, expires_at)
    values (a.id, v_token, a.credential_version, v_expires);
  return jsonb_build_object('status', 'ok', 'account', labeler.account_json(a), 'expiresAt', v_expires);
end $$;

create function public.labeler_session(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a labeler.accounts;
begin
  a := labeler.session_account(p, nullif(p ->> 'role', ''));
  return jsonb_build_object('account', labeler.account_json(a));
end $$;

create function public.labeler_logout(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text := labeler.hex64(p, 'tokenHash', 'Session');
begin
  update labeler.sessions set revoked_at = now() where token_hash = v_token and revoked_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Trusted local command only (server credentials). Never resets an existing owner.
create function public.labeler_bootstrap_admin(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_handle text := labeler.text_param(p, 'handle', '^[A-Za-z0-9_]{1,40}$', 'Handle');
  v_name text := btrim(labeler.text_param(p, 'displayName', '^.{1,80}$', 'Display name'));
  v_digest text := labeler.hex64(p, 'codeDigest', 'Access code');
  v_existing text;
begin
  perform pg_advisory_xact_lock(hashtext('labeler-admins'));
  select string_agg(handle, ', ' order by created_at) into v_existing from labeler.accounts where role = 'admin';
  if v_existing is not null then
    return jsonb_build_object('status', 'exists', 'admins', v_existing);
  end if;
  insert into labeler.accounts (handle, display_name, role, status, code_digest, code_issued_at)
    values (v_handle, v_name, 'admin', 'active', v_digest, now());
  return jsonb_build_object('status', 'created', 'handle', v_handle);
end $$;

create function public.labeler_recover_admin(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_handle text := labeler.text_param(p, 'handle', '^[A-Za-z0-9_]{1,40}$', 'Handle');
  v_digest text := labeler.hex64(p, 'codeDigest', 'Access code');
  a labeler.accounts;
begin
  perform pg_advisory_xact_lock(hashtext('labeler-admins'));
  select * into a from labeler.accounts where lower(handle) = lower(v_handle) and role = 'admin' for update;
  if not found then
    perform labeler.fail('LB404', 'No administrator has that handle.');
  end if;
  update labeler.accounts set code_digest = v_digest, status = 'active', code_issued_at = now(),
    credential_version = credential_version + 1 where id = a.id;
  return jsonb_build_object('status', 'recovered', 'handle', a.handle, 'revokedSessions', labeler.revoke_sessions(a.id));
end $$;

-- ---------------------------------------------------------------- admin: accounts

create function public.labeler_admin_create_reviewer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_handle text := labeler.text_param(p, 'handle', '^[A-Za-z0-9_]{1,40}$', 'Export handle');
  v_name text := btrim(labeler.text_param(p, 'displayName', '^.{1,80}$', 'Display name'));
  v_digest text := labeler.hex64(p, 'codeDigest', 'Access code');
  a labeler.accounts;
begin
  if v_name = '' then perform labeler.fail('LB422', 'Display name is required.'); end if;
  if exists (select 1 from labeler.accounts where lower(handle) = lower(v_handle)) then
    perform labeler.fail('LB409', 'That export handle is already used. Choose another handle.');
  end if;
  insert into labeler.accounts (handle, display_name, role, status, code_digest, code_issued_at)
    values (v_handle, v_name, 'reviewer', 'active', v_digest, now()) returning * into a;
  return jsonb_build_object('account', labeler.account_json(a));
end $$;

create function public.labeler_admin_set_status(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_target uuid := labeler.uuid_param(p, 'accountId', 'Account');
  v_status text := labeler.text_param(p, 'status', '^(active|inactive)$', 'Status');
  t labeler.accounts;
  v_revoked integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('labeler-admins'));
  select * into t from labeler.accounts where id = v_target for update;
  if not found then perform labeler.fail('LB404', 'Account not found.'); end if;
  if v_status = 'inactive' then
    if t.role = 'admin' and t.status = 'active'
       and (select count(*) from labeler.accounts where role = 'admin' and status = 'active') <= 1 then
      perform labeler.fail('LB409', 'Keep at least one active administrator.');
    end if;
    update labeler.accounts set status = 'inactive', code_digest = null,
      credential_version = credential_version + 1 where id = t.id returning * into t;
    v_revoked := labeler.revoke_sessions(t.id);
  else
    -- Reactivation always issues a fresh code.
    update labeler.accounts set status = 'active', code_digest = labeler.hex64(p, 'codeDigest', 'Access code'),
      code_issued_at = now(), credential_version = credential_version + 1 where id = t.id returning * into t;
    v_revoked := labeler.revoke_sessions(t.id);
  end if;
  return jsonb_build_object('account', labeler.account_json(t), 'revokedSessions', v_revoked, 'self', t.id = me.id);
end $$;

create function public.labeler_admin_regenerate_code(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_target uuid := labeler.uuid_param(p, 'accountId', 'Account');
  v_digest text := labeler.hex64(p, 'codeDigest', 'Access code');
  t labeler.accounts;
begin
  select * into t from labeler.accounts where id = v_target for update;
  if not found then perform labeler.fail('LB404', 'Account not found.'); end if;
  if t.status <> 'active' then perform labeler.fail('LB409', 'Activate this account to issue a new code.'); end if;
  update labeler.accounts set code_digest = v_digest, code_issued_at = now(),
    credential_version = credential_version + 1 where id = t.id returning * into t;
  return jsonb_build_object('account', labeler.account_json(t), 'revokedSessions', labeler.revoke_sessions(t.id),
                            'self', t.id = me.id);
end $$;

create function public.labeler_admin_revoke_sessions(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_target uuid := labeler.uuid_param(p, 'accountId', 'Account');
  t labeler.accounts;
begin
  select * into t from labeler.accounts where id = v_target for update;
  if not found then perform labeler.fail('LB404', 'Account not found.'); end if;
  return jsonb_build_object('revokedSessions', labeler.revoke_sessions(t.id), 'self', t.id = me.id);
end $$;

-- ---------------------------------------------------------------- admin: collections and imports

create function public.labeler_admin_collection_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_name text := btrim(labeler.text_param(p, 'name', '^.{1,120}$', 'Collection name'));
  c labeler.collections;
begin
  if v_name = '' then perform labeler.fail('LB422', 'Collection name is required.'); end if;
  insert into labeler.collections (name) values (v_name) returning * into c;
  return jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status);
end $$;

create function public.labeler_admin_collection_update(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_id uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  c labeler.collections;
  v_status text;
begin
  select * into c from labeler.collections where id = v_id for update;
  if not found then perform labeler.fail('LB404', 'Collection not found.'); end if;
  if p ? 'name' then
    c.name := btrim(labeler.text_param(p, 'name', '^.{1,120}$', 'Collection name'));
    if c.name = '' then perform labeler.fail('LB422', 'Collection name is required.'); end if;
  end if;
  if p ? 'status' then
    v_status := labeler.text_param(p, 'status', '^(draft|published|archived)$', 'Status');
    if v_status = 'published' and not exists (
      select 1 from labeler.collection_clips cc join labeler.clips k on k.id = cc.clip_id
      where cc.collection_id = c.id and cc.published_at is not null and k.media_state = 'ready') then
      perform labeler.fail('LB409', 'Publish at least one ready clip before publishing the collection.');
    end if;
    if v_status <> c.status then
      c.status := v_status;
      if v_status = 'published' then c.published_at := now(); end if;
      c.archived_at := case when v_status = 'archived' then now() else null end;
    end if;
  end if;
  update labeler.collections set name = c.name, status = c.status, published_at = c.published_at,
    archived_at = c.archived_at, updated_at = now() where id = c.id;
  return jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status);
end $$;

-- Registers small manifest metadata in batches. Media bytes never pass through here.
create function public.labeler_admin_import(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_collection uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  v_max_clips integer := labeler.int_param(p, 'maxClips', 1, 1000000, 'Clip limit');
  v_max_clip_bytes bigint := labeler.int_param(p, 'maxClipBytes', 1, 5368709120, 'Clip size limit');
  c labeler.collections;
  v_demo record;
  v_existing labeler.demos;
  v_meta jsonb;
  v_prov jsonb;
  v_item jsonb;
  k labeler.clips;
  v_new boolean;
  v_version boolean;
  v_position integer;
  v_results jsonb := '[]'::jsonb;
  v_reviewed boolean;
begin
  select * into c from labeler.collections where id = v_collection for update;
  if not found then perform labeler.fail('LB404', 'Collection not found.'); end if;
  if c.status = 'archived' then perform labeler.fail('LB409', 'Restore this collection before importing into it.'); end if;
  if jsonb_typeof(p -> 'demos') is distinct from 'object' or jsonb_typeof(p -> 'clips') is distinct from 'array' then
    perform labeler.fail('LB422', 'The manifest batch needs demos and clips.');
  end if;
  if jsonb_array_length(p -> 'clips') > 50 then
    perform labeler.fail('LB413', 'Send at most 50 clips per batch.');
  end if;

  for v_demo in select key, value from jsonb_each(p -> 'demos') loop
    v_meta := v_demo.value -> 'metadata';
    v_prov := v_demo.value -> 'provenance';
    if v_demo.key !~ '^demo-[a-f0-9]{64}$' or jsonb_typeof(v_meta) <> 'object' or jsonb_typeof(v_prov) <> 'object'
       or v_meta ->> 'id' is distinct from v_demo.key or v_meta ->> 'sha256' is distinct from substr(v_demo.key, 6)
       or (v_meta ->> 'map') not in ('de_ancient', 'de_anubis') or jsonb_typeof(v_meta -> 'players') <> 'array'
       or (v_prov ->> 'split') not in ('unassigned', 'train', 'val', 'test')
       or jsonb_typeof(v_prov -> 'trainingPermitted') <> 'boolean'
       or jsonb_typeof(v_prov -> 'sourceMatchId') <> 'string' or jsonb_typeof(v_prov -> 'source') <> 'string' then
      perform labeler.fail('LB422', 'Invalid source demo metadata in the manifest.');
    end if;
    select * into v_existing from labeler.demos where id = v_demo.key for update;
    if not found then
      insert into labeler.demos (id, map, metadata, provenance) values (v_demo.key, v_meta ->> 'map', v_meta, v_prov);
    else
      if v_existing.metadata <> v_meta then
        perform labeler.fail('LB409', 'Source demo ' || v_demo.key || ' differs from the copy already uploaded.');
      end if;
      if v_existing.provenance <> v_prov then
        select exists (select 1 from labeler.review_heads h join labeler.clips x on x.id = h.clip_id
                       where x.demo_id = v_demo.key) into v_reviewed;
        if v_reviewed and (v_existing.provenance ->> 'split') <> 'unassigned' and (
             (v_existing.provenance ->> 'split') <> (v_prov ->> 'split')
             or (v_existing.provenance ->> 'sourceMatchId') <> (v_prov ->> 'sourceMatchId')) then
          perform labeler.fail('LB409', 'This reviewed match has a frozen split and source match identity.');
        end if;
        update labeler.demos set provenance = v_prov, updated_at = now() where id = v_demo.key;
      end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p -> 'clips') loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item ->> 'footageId') !~ '^[a-f0-9]{32}$' or (v_item ->> 'sha256') !~ '^[a-f0-9]{64}$'
       or jsonb_typeof(v_item -> 'bytes') <> 'number' or (v_item ->> 'bytes') !~ '^[0-9]+$'
       or (v_item ->> 'matchId') !~ '^demo-[a-f0-9]{64}$' or (v_item ->> 'playerId') !~ '^[0-9]{1,20}$'
       or coalesce(char_length(v_item ->> 'snapshotId'), 0) not between 1 and 200
       or (v_item ->> 'findingId') !~ '^F[0-9]+$'
       or jsonb_typeof(v_item -> 'round') <> 'number' or (v_item ->> 'round') !~ '^[1-9][0-9]*$'
       or jsonb_typeof(v_item -> 'context') <> 'object' then
      perform labeler.fail('LB422', 'Invalid clip entry in the manifest.');
    end if;
    if (v_item ->> 'bytes')::bigint < 1 or (v_item ->> 'bytes')::bigint > v_max_clip_bytes then
      perform labeler.fail('LB413', 'Clip ' || (v_item ->> 'footageId') || ' exceeds the per-clip upload limit.');
    end if;
    if not exists (select 1 from labeler.demos d where d.id = v_item ->> 'matchId'
                   and exists (select 1 from jsonb_array_elements(d.metadata -> 'players') e where e ->> 'id' = v_item ->> 'playerId')) then
      perform labeler.fail('LB422', 'Clip ' || (v_item ->> 'footageId') || ' names a player outside its source demo.');
    end if;
    select * into k from labeler.clips where footage_id = v_item ->> 'footageId' and sha256 = v_item ->> 'sha256';
    v_new := not found;
    v_version := false;
    if v_new then
      v_version := exists (select 1 from labeler.clips where footage_id = v_item ->> 'footageId');
      if (select count(*) from labeler.clips) >= v_max_clips then
        perform labeler.fail('LB413', 'The clip count limit has been reached.');
      end if;
      insert into labeler.clips (footage_id, sha256, bytes, demo_id, player_id, snapshot_id, finding_id, round, context)
        values (v_item ->> 'footageId', v_item ->> 'sha256', (v_item ->> 'bytes')::bigint, v_item ->> 'matchId',
                v_item ->> 'playerId', v_item ->> 'snapshotId', v_item ->> 'findingId', (v_item ->> 'round')::integer,
                v_item -> 'context')
        returning * into k;
    elsif k.bytes <> (v_item ->> 'bytes')::bigint or k.demo_id <> v_item ->> 'matchId' or k.player_id <> v_item ->> 'playerId'
       or k.snapshot_id <> v_item ->> 'snapshotId' or k.finding_id <> v_item ->> 'findingId'
       or k.round <> (v_item ->> 'round')::integer or k.context <> v_item -> 'context' then
      perform labeler.fail('LB409', 'Clip ' || k.footage_id || ' was already imported with different source context. Export it again as new media.');
    end if;
    if not exists (select 1 from labeler.collection_clips where collection_id = c.id and clip_id = k.id) then
      select coalesce(max(position), 0) + 1 into v_position from labeler.collection_clips where collection_id = c.id;
      insert into labeler.collection_clips (collection_id, clip_id, position) values (c.id, k.id, v_position);
    end if;
    v_results := v_results || jsonb_build_object('footageId', k.footage_id, 'sha256', k.sha256, 'clipId', k.id,
      'mediaState', k.media_state, 'created', v_new, 'newVersion', v_version);
  end loop;
  update labeler.collections set updated_at = now() where id = c.id;
  return jsonb_build_object('clips', v_results);
end $$;

create function public.labeler_admin_publish_clips(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_collection uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  v_publish boolean;
  v_ids uuid[];
  v_changed integer;
begin
  if jsonb_typeof(p -> 'published') <> 'boolean' or jsonb_typeof(p -> 'clipIds') <> 'array'
     or jsonb_array_length(p -> 'clipIds') > 2000 then
    perform labeler.fail('LB422', 'Choose clips to publish or withdraw.');
  end if;
  if exists (select 1 from jsonb_array_elements_text(p -> 'clipIds') x
             where x !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    perform labeler.fail('LB422', 'Invalid clip ID.');
  end if;
  v_publish := (p ->> 'published')::boolean;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p -> 'clipIds') x;
  perform 1 from labeler.collections where id = v_collection for update;
  if not found then perform labeler.fail('LB404', 'Collection not found.'); end if;
  if v_publish then
    update labeler.collection_clips cc set published_at = now()
      from labeler.clips k
      where cc.collection_id = v_collection and cc.clip_id = any (v_ids) and k.id = cc.clip_id
        and k.media_state = 'ready' and cc.published_at is null;
  else
    update labeler.collection_clips set published_at = null
      where collection_id = v_collection and clip_id = any (v_ids) and published_at is not null;
  end if;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('changed', v_changed);
end $$;

create function public.labeler_admin_assign(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_collection uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  v_account uuid := labeler.uuid_param(p, 'accountId', 'Account');
begin
  if jsonb_typeof(p -> 'assigned') <> 'boolean' then perform labeler.fail('LB422', 'Choose assign or remove.'); end if;
  perform 1 from labeler.collections where id = v_collection;
  if not found then perform labeler.fail('LB404', 'Collection not found.'); end if;
  perform 1 from labeler.accounts where id = v_account for update;
  if not found then perform labeler.fail('LB404', 'Account not found.'); end if;
  if (p ->> 'assigned')::boolean then
    insert into labeler.assignments as g (collection_id, account_id) values (v_collection, v_account)
      on conflict (collection_id, account_id) do update set revoked_at = null,
        assigned_at = case when g.revoked_at is null then g.assigned_at else now() end;
  else
    update labeler.assignments set revoked_at = now()
      where collection_id = v_collection and account_id = v_account and revoked_at is null;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- privileges

alter table labeler.workspace enable row level security;
alter table labeler.accounts enable row level security;
alter table labeler.sessions enable row level security;
alter table labeler.login_attempts enable row level security;
alter table labeler.collections enable row level security;
alter table labeler.demos enable row level security;
alter table labeler.clips enable row level security;
alter table labeler.collection_clips enable row level security;
alter table labeler.assignments enable row level security;
alter table labeler.uploads enable row level security;
alter table labeler.upload_parts enable row level security;
alter table labeler.review_revisions enable row level security;
alter table labeler.review_heads enable row level security;

do $$
declare
  f record;
  r text;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'labeler\_%') or n.nspname = 'labeler'
  loop
    execute format('revoke all on function %s from public', f.sig);
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on function %s from %I', f.sig, r);
      end if;
    end loop;
    if f.nspname = 'public' and exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema labeler from %I', r);
      execute format('revoke all on all sequences in schema labeler from %I', r);
      execute format('revoke all on schema labeler from %I', r);
    end if;
  end loop;
end $$;
