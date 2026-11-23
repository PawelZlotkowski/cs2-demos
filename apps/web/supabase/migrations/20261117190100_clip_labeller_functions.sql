-- Round Reviewer clip labeller, part 2: uploads, admin reads, reviewer functions and privileges.
-- Applies after 20261117190000_clip_labeller_schema.sql.

-- ---------------------------------------------------------------- admin: uploads

create function labeler.upload_json(u labeler.uploads) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'clipId', u.clip_id, 'bucket', u.bucket, 'objectKey', u.object_key,
    'r2UploadId', u.r2_upload_id, 'expectedBytes', u.expected_bytes, 'expectedSha256', u.expected_sha256,
    'partSize', u.part_size, 'partCount', u.part_count, 'status', u.status, 'createdAt', u.created_at,
    'error', u.error,
    'parts', coalesce((select jsonb_agg(jsonb_build_object('partNumber', x.part_number, 'etag', x.etag, 'bytes', x.bytes)
                                        order by x.part_number) from labeler.upload_parts x where x.upload_id = u.id), '[]'::jsonb));
$$;

create function public.labeler_admin_upload_begin(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_clip uuid := labeler.uuid_param(p, 'clipId', 'Clip');
  v_sha text := labeler.hex64(p, 'sha256', 'File hash');
  v_bytes bigint := labeler.int_param(p, 'bytes', 1, 5368709120, 'File size');
  v_part_size integer := labeler.int_param(p, 'partSize', 5242880, 104857600, 'Part size');
  v_bucket text := labeler.text_param(p, 'bucket', '^[a-z0-9][a-z0-9-]{1,62}$', 'Bucket');
  v_max_total bigint := labeler.int_param(p, 'maxTotalBytes', 1, 1099511627776, 'Storage limit');
  v_max_open integer := labeler.int_param(p, 'maxOpenUploads', 1, 1000, 'Upload limit');
  v_expiry integer := labeler.int_param(p, 'expirySeconds', 3600, 604800, 'Upload expiry');
  k labeler.clips;
  u labeler.uploads;
  v_used bigint;
  v_id uuid := gen_random_uuid();
begin
  -- One storage reservation at a time across concurrent admin requests.
  perform pg_advisory_xact_lock(hashtext('labeler-storage'));
  select * into k from labeler.clips where id = v_clip for update;
  if not found then perform labeler.fail('LB404', 'Clip not found.'); end if;
  if k.sha256 <> v_sha or k.bytes <> v_bytes then
    perform labeler.fail('LB409', 'The selected file does not match this clip''s manifest entry.');
  end if;
  if k.media_state = 'ready' then
    return jsonb_build_object('ready', true);
  end if;
  if not exists (select 1 from labeler.collection_clips cc join labeler.collections c on c.id = cc.collection_id
                 where cc.clip_id = k.id and c.status <> 'archived') then
    perform labeler.fail('LB409', 'This clip is only in archived collections.');
  end if;
  select * into u from labeler.uploads where clip_id = k.id and status in ('reserved', 'active', 'completing') for update;
  if found then
    if u.created_at < now() - make_interval(secs => v_expiry) and u.status <> 'completing' then
      update labeler.uploads set status = 'expired', updated_at = now(),
        error = 'R2 discards incomplete uploads after seven days.' where id = u.id;
      return jsonb_build_object('expired', labeler.upload_json(u));
    end if;
    return jsonb_build_object('upload', labeler.upload_json(u), 'created', false);
  end if;
  if (select count(*) from labeler.uploads where status in ('reserved', 'active', 'completing')) >= v_max_open then
    perform labeler.fail('LB429', 'Too many uploads are open. Finish or cancel some first.');
  end if;
  select coalesce((select sum(bytes) from labeler.clips where media_state = 'ready'), 0)
       + coalesce((select sum(expected_bytes) from labeler.uploads where status in ('reserved', 'active', 'completing')), 0)
    into v_used;
  if v_used + v_bytes > v_max_total then
    perform labeler.fail('LB413', 'This upload would exceed the configured storage limit.');
  end if;
  insert into labeler.uploads (id, clip_id, created_by, bucket, object_key, expected_bytes, expected_sha256,
                               part_size, part_count, status)
    values (v_id, k.id, me.id, v_bucket, 'clips/' || k.id || '/' || v_id || '.mp4', v_bytes, v_sha,
            v_part_size, ceil(v_bytes::numeric / v_part_size)::integer, 'reserved')
    returning * into u;
  return jsonb_build_object('upload', labeler.upload_json(u), 'created', true);
end $$;

create function public.labeler_admin_upload_attach(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_id uuid := labeler.uuid_param(p, 'uploadId', 'Upload');
  v_r2 text := labeler.text_param(p, 'r2UploadId', '^[!-~]+$', 'Storage upload');
  u labeler.uploads;
begin
  if char_length(v_r2) > 1024 then perform labeler.fail('LB422', 'Storage upload is invalid.'); end if;
  select * into u from labeler.uploads where id = v_id for update;
  if not found then perform labeler.fail('LB404', 'Upload not found.'); end if;
  if u.status <> 'reserved' or u.r2_upload_id is not null then
    return jsonb_build_object('attached', false, 'upload', labeler.upload_json(u));
  end if;
  update labeler.uploads set r2_upload_id = v_r2, status = 'active', updated_at = now() where id = u.id returning * into u;
  return jsonb_build_object('attached', true, 'upload', labeler.upload_json(u));
end $$;

-- Reads an upload for part signing or completion and records parts the browser reports.
-- The caller signs only part numbers within this stored session.
create function public.labeler_admin_upload_state(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_id uuid := labeler.uuid_param(p, 'uploadId', 'Upload');
  v_part jsonb;
  v_target text := nullif(p ->> 'setStatus', '');
  v_error text := left(nullif(p ->> 'error', ''), 500);
  u labeler.uploads;
begin
  select * into u from labeler.uploads where id = v_id for update;
  if not found then perform labeler.fail('LB404', 'Upload not found.'); end if;
  if jsonb_typeof(p -> 'parts') = 'array' and u.status in ('active', 'completing') then
    if jsonb_array_length(p -> 'parts') > 100 then perform labeler.fail('LB413', 'Report at most 100 parts at once.'); end if;
    for v_part in select value from jsonb_array_elements(p -> 'parts') loop
      if jsonb_typeof(v_part -> 'partNumber') <> 'number' or (v_part ->> 'partNumber') !~ '^[0-9]+$'
         or (v_part ->> 'partNumber')::integer not between 1 and u.part_count
         or coalesce(char_length(v_part ->> 'etag'), 0) not between 1 and 200
         or jsonb_typeof(v_part -> 'bytes') <> 'number' or (v_part ->> 'bytes') !~ '^[0-9]+$' then
        perform labeler.fail('LB422', 'Invalid part report.');
      end if;
      insert into labeler.upload_parts (upload_id, part_number, etag, bytes)
        values (u.id, (v_part ->> 'partNumber')::integer, v_part ->> 'etag', (v_part ->> 'bytes')::bigint)
        on conflict (upload_id, part_number) do update set etag = excluded.etag, bytes = excluded.bytes, recorded_at = now();
    end loop;
  end if;
  if v_target is not null then
    if v_target = 'completing' and u.status in ('active', 'completing') then
      update labeler.uploads set status = 'completing', updated_at = now(), error = v_error where id = u.id returning * into u;
    elsif v_target = 'active' and u.status = 'completing' then
      update labeler.uploads set status = 'active', updated_at = now(), error = v_error where id = u.id returning * into u;
    elsif v_target in ('aborted', 'expired') and u.status in ('reserved', 'active', 'completing') then
      update labeler.uploads set status = v_target, updated_at = now(), error = v_error where id = u.id returning * into u;
    elsif v_target <> u.status then
      perform labeler.fail('LB409', 'This upload is ' || u.status || ' and cannot become ' || v_target || '.');
    end if;
  end if;
  return jsonb_build_object('upload', labeler.upload_json(u));
end $$;

-- Retry-safe: the R2 object was completed and verified by the caller before this runs.
create function public.labeler_admin_upload_finalise(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_id uuid := labeler.uuid_param(p, 'uploadId', 'Upload');
  v_bytes bigint := labeler.int_param(p, 'bytes', 1, 5368709120, 'Object size');
  v_sha text := labeler.hex64(p, 'sha256', 'Object hash');
  u labeler.uploads;
  k labeler.clips;
begin
  select * into u from labeler.uploads where id = v_id for update;
  if not found then perform labeler.fail('LB404', 'Upload not found.'); end if;
  select * into k from labeler.clips where id = u.clip_id for update;
  if u.status = 'completed' then
    return jsonb_build_object('status', 'ready', 'clipId', k.id, 'replayed', true);
  end if;
  if k.media_state = 'ready' then
    update labeler.uploads set status = 'superseded', updated_at = now(),
      error = 'The clip already had ready media from another upload.' where id = u.id;
    return jsonb_build_object('status', 'superseded', 'clipId', k.id, 'orphanKey', u.object_key);
  end if;
  if u.status not in ('active', 'completing') then
    perform labeler.fail('LB409', 'This upload is ' || u.status || '. Start the upload again.');
  end if;
  if v_bytes <> u.expected_bytes or v_bytes <> k.bytes or v_sha <> u.expected_sha256 or v_sha <> k.sha256 then
    perform labeler.fail('LB409', 'The stored object does not match the manifest size and hash.');
  end if;
  update labeler.clips set media_state = 'ready', object_key = u.object_key, ready_upload_id = u.id, ready_at = now()
    where id = k.id;
  update labeler.uploads set status = 'completed', completed_at = now(), updated_at = now(), error = null where id = u.id;
  return jsonb_build_object('status', 'ready', 'clipId', k.id, 'replayed', false);
end $$;

-- Explicit, collection-scoped cleanup of incomplete uploads. Ready media is untouched.
create function public.labeler_admin_collection_cleanup(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_collection uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  v_rows jsonb;
begin
  perform 1 from labeler.collections where id = v_collection;
  if not found then perform labeler.fail('LB404', 'Collection not found.'); end if;
  with doomed as (
    update labeler.uploads u set status = 'aborted', updated_at = now(), error = 'Cancelled by collection cleanup.'
    from labeler.collection_clips cc
    where cc.collection_id = v_collection and cc.clip_id = u.clip_id
      and u.status in ('reserved', 'active', 'completing')
    returning u.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'objectKey', object_key,
                                              'r2UploadId', r2_upload_id)), '[]'::jsonb)
    into v_rows from doomed;
  return jsonb_build_object('aborted', v_rows);
end $$;

-- ---------------------------------------------------------------- admin: reads

create function labeler.storage_json() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'readyBytes', coalesce((select sum(bytes) from labeler.clips where media_state = 'ready'), 0),
    'readyClips', (select count(*) from labeler.clips where media_state = 'ready'),
    'totalClips', (select count(*) from labeler.clips),
    'reservedBytes', coalesce((select sum(expected_bytes) from labeler.uploads where status in ('reserved', 'active', 'completing')), 0),
    'openUploads', (select count(*) from labeler.uploads where status in ('reserved', 'active', 'completing')));
$$;

create function public.labeler_admin_overview(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
begin
  return jsonb_build_object(
    'me', labeler.account_json(me),
    'originId', (select origin_id from labeler.workspace),
    'storage', labeler.storage_json(),
    'accounts', coalesce((select jsonb_agg(x order by x ->> 'role', x ->> 'displayName') from (
      select jsonb_build_object(
        'id', a.id, 'handle', a.handle, 'displayName', a.display_name, 'role', a.role, 'status', a.status,
        'codeIssuedAt', a.code_issued_at, 'createdAt', a.created_at,
        'activeSessions', (select count(*) from labeler.sessions s where s.account_id = a.id and s.revoked_at is null
                             and s.expires_at > now() and s.credential_version = a.credential_version),
        'lastSeenAt', (select max(s.last_seen_at) from labeler.sessions s where s.account_id = a.id),
        'assignedClips', (select count(distinct cc.clip_id) from labeler.assignments g
                            join labeler.collections c on c.id = g.collection_id and c.status = 'published'
                            join labeler.collection_clips cc on cc.collection_id = c.id and cc.published_at is not null
                            join labeler.clips k on k.id = cc.clip_id and k.media_state = 'ready'
                            where g.account_id = a.id and g.revoked_at is null),
        'complete', (select count(*) from labeler.review_heads h where h.account_id = a.id and h.status = 'complete'),
        'drafts', (select count(*) from labeler.review_heads h where h.account_id = a.id and h.status = 'draft'),
        'skipped', (select count(*) from labeler.review_heads h where h.account_id = a.id and h.status = 'skipped'),
        'issues', (select count(*) from labeler.review_heads h join labeler.review_revisions r on r.revision = h.revision
                     where h.account_id = a.id and r.issue is not null)) as x
      from labeler.accounts a) q), '[]'::jsonb),
    'collections', coalesce((select jsonb_agg(x order by x ->> 'createdAt' desc) from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name, 'status', c.status, 'createdAt', c.created_at,
        'clips', (select count(*) from labeler.collection_clips cc where cc.collection_id = c.id),
        'ready', (select count(*) from labeler.collection_clips cc join labeler.clips k on k.id = cc.clip_id
                    where cc.collection_id = c.id and k.media_state = 'ready'),
        'published', (select count(*) from labeler.collection_clips cc join labeler.clips k on k.id = cc.clip_id
                        where cc.collection_id = c.id and cc.published_at is not null and k.media_state = 'ready'),
        'bytes', coalesce((select sum(k.bytes) from labeler.collection_clips cc join labeler.clips k on k.id = cc.clip_id
                             where cc.collection_id = c.id), 0),
        'maps', coalesce((select jsonb_agg(distinct d.map) from labeler.collection_clips cc join labeler.clips k on k.id = cc.clip_id
                            join labeler.demos d on d.id = k.demo_id where cc.collection_id = c.id), '[]'::jsonb),
        'assignees', coalesce((select jsonb_agg(g.account_id) from labeler.assignments g
                                 where g.collection_id = c.id and g.revoked_at is null), '[]'::jsonb)) as x
      from labeler.collections c) q), '[]'::jsonb));
end $$;

create function public.labeler_admin_collection(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_collection uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  c labeler.collections;
begin
  select * into c from labeler.collections where id = v_collection;
  if not found then perform labeler.fail('LB404', 'Collection not found.'); end if;
  return jsonb_build_object(
    'collection', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'createdAt', c.created_at,
                                     'publishedAt', c.published_at, 'archivedAt', c.archived_at),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('accountId', g.account_id, 'assignedAt', g.assigned_at))
                               from labeler.assignments g where g.collection_id = c.id and g.revoked_at is null), '[]'::jsonb),
    'clips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'position', cc.position, 'footageId', k.footage_id, 'sha256', k.sha256, 'bytes', k.bytes,
        'mediaState', k.media_state, 'publishedAt', cc.published_at, 'readyAt', k.ready_at,
        'map', d.map, 'demoId', d.id, 'demoFile', d.metadata ->> 'filename', 'playerId', k.player_id,
        'playerName', labeler.player_name(d.metadata, k.player_id), 'round', k.round, 'findingId', k.finding_id,
        'detector', k.context -> 'finding' ->> 'detector',
        'durationSec', k.context -> 'footage' -> 'duration',
        'upload', (select labeler.upload_json(u) - 'parts' || jsonb_build_object('partsRecorded',
                     (select count(*) from labeler.upload_parts x where x.upload_id = u.id))
                   from labeler.uploads u where u.clip_id = k.id order by u.created_at desc limit 1),
        'reviews', jsonb_build_object(
          'complete', (select count(*) from labeler.review_heads h where h.clip_id = k.id and h.status = 'complete'),
          'draft', (select count(*) from labeler.review_heads h where h.clip_id = k.id and h.status = 'draft'),
          'skipped', (select count(*) from labeler.review_heads h where h.clip_id = k.id and h.status = 'skipped'),
          'issues', (select count(*) from labeler.review_heads h join labeler.review_revisions r on r.revision = h.revision
                       where h.clip_id = k.id and r.issue is not null)))
      order by cc.position)
      from labeler.collection_clips cc join labeler.clips k on k.id = cc.clip_id join labeler.demos d on d.id = k.demo_id
      where cc.collection_id = c.id), '[]'::jsonb));
end $$;

create function public.labeler_admin_notes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_collection uuid := case when p ? 'collectionId' then labeler.uuid_param(p, 'collectionId', 'Collection') end;
  v_account uuid := case when p ? 'accountId' then labeler.uuid_param(p, 'accountId', 'Account') end;
  v_status text := case when p ? 'status' then labeler.text_param(p, 'status', '^(draft|complete|skipped|issue)$', 'Status') end;
begin
  return jsonb_build_object('notes', coalesce((select jsonb_agg(x order by (x ->> 'revision')::bigint desc) from (
    select jsonb_build_object(
      'accountId', a.id, 'handle', a.handle, 'displayName', a.display_name,
      'clipId', k.id, 'map', d.map, 'round', k.round, 'demoFile', d.metadata ->> 'filename',
      'playerName', labeler.player_name(d.metadata, k.player_id), 'findingId', k.finding_id,
      'detector', k.context -> 'finding' ->> 'detector') || labeler.review_json(r) as x
    from labeler.review_heads h
    join labeler.review_revisions r on r.revision = h.revision
    join labeler.accounts a on a.id = h.account_id
    join labeler.clips k on k.id = h.clip_id
    join labeler.demos d on d.id = k.demo_id
    where (v_account is null or h.account_id = v_account)
      and (v_collection is null or exists (select 1 from labeler.collection_clips cc
                                           where cc.collection_id = v_collection and cc.clip_id = k.id))
      and (v_status is null or (v_status = 'issue' and r.issue is not null) or h.status = v_status)
    order by r.revision desc limit 1000) q), '[]'::jsonb));
end $$;

-- Raw material for one reviewer's round-reviewer-notes-v1 file: the current head for every
-- clip they ever saved, including drafts and skips so withdrawals reach the local workspace.
create function public.labeler_admin_export(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_account uuid := labeler.uuid_param(p, 'accountId', 'Account');
  a labeler.accounts;
begin
  select * into a from labeler.accounts where id = v_account;
  if not found then perform labeler.fail('LB404', 'Account not found.'); end if;
  return jsonb_build_object(
    'originId', (select origin_id from labeler.workspace),
    'account', labeler.account_json(a),
    'demos', coalesce((select jsonb_object_agg(d.id, jsonb_build_object('metadata', d.metadata, 'provenance', d.provenance))
                         from labeler.demos d where d.id in (
                           select k.demo_id from labeler.review_heads h join labeler.clips k on k.id = h.clip_id
                           where h.account_id = a.id)), '{}'::jsonb),
    'reviews', coalesce((select jsonb_agg(labeler.review_json(r) || jsonb_build_object('clip', jsonb_build_object(
        'id', k.id, 'footageId', k.footage_id, 'sha256', k.sha256, 'matchId', k.demo_id, 'playerId', k.player_id,
        'snapshotId', k.snapshot_id, 'findingId', k.finding_id, 'round', k.round, 'context', k.context))
      order by r.revision)
      from labeler.review_heads h join labeler.review_revisions r on r.revision = h.revision
      join labeler.clips k on k.id = h.clip_id where h.account_id = a.id), '[]'::jsonb));
end $$;

create function public.labeler_admin_playback(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, 'admin');
  v_clip uuid := labeler.uuid_param(p, 'clipId', 'Clip');
  k labeler.clips;
begin
  select * into k from labeler.clips where id = v_clip;
  if not found or k.media_state <> 'ready' then perform labeler.fail('LB404', 'This clip has no ready media.'); end if;
  return jsonb_build_object('objectKey', k.object_key);
end $$;

-- ---------------------------------------------------------------- reviewer

create function labeler.reviewer_clips(p_account uuid, p_collection uuid)
returns table (clip_id uuid, pos integer, status text, revision bigint, updated_at timestamptz)
language sql stable set search_path = '' as $$
  select cc.clip_id, cc.position, h.status, h.revision, h.updated_at
  from labeler.assignments g
  join labeler.collections c on c.id = g.collection_id and c.status = 'published'
  join labeler.collection_clips cc on cc.collection_id = c.id and cc.published_at is not null
  join labeler.clips k on k.id = cc.clip_id and k.media_state = 'ready'
  left join labeler.review_heads h on h.account_id = p_account and h.clip_id = cc.clip_id
  where g.account_id = p_account and g.revoked_at is null and c.id = p_collection
  order by cc.position;
$$;

create function labeler.next_clip(p_account uuid, p_collection uuid, p_after integer) returns uuid
language sql stable set search_path = '' as $$
  -- Unfinished work first (drafts, then untouched), then skipped clips, starting after p_after.
  select clip_id from labeler.reviewer_clips(p_account, p_collection)
  where status is distinct from 'complete'
  order by (coalesce(status, '') = 'skipped'), (pos <= coalesce(p_after, 0)), pos
  limit 1;
$$;

create function public.labeler_reviewer_home(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, null);
  v_resume jsonb;
begin
  select jsonb_build_object('collectionId', cc.collection_id, 'clipId', h.clip_id) into v_resume
  from labeler.review_heads h
  join labeler.collection_clips cc on cc.clip_id = h.clip_id
  where h.account_id = me.id and h.status = 'draft' and labeler.can_review(me.id, h.clip_id)
    and exists (select 1 from labeler.assignments g join labeler.collections c on c.id = g.collection_id
                where g.collection_id = cc.collection_id and g.account_id = me.id and g.revoked_at is null
                  and c.status = 'published' and cc.published_at is not null)
  order by h.updated_at desc limit 1;
  return jsonb_build_object(
    'account', labeler.account_json(me),
    'resume', v_resume,
    'collections', coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object(
        'id', c.id, 'name', c.name,
        'total', (select count(*) from labeler.reviewer_clips(me.id, c.id)),
        'complete', (select count(*) from labeler.reviewer_clips(me.id, c.id) r where r.status = 'complete'),
        'draft', (select count(*) from labeler.reviewer_clips(me.id, c.id) r where r.status = 'draft'),
        'skipped', (select count(*) from labeler.reviewer_clips(me.id, c.id) r where r.status = 'skipped'),
        'maps', coalesce((select jsonb_agg(distinct d.map) from labeler.reviewer_clips(me.id, c.id) r
                            join labeler.clips k on k.id = r.clip_id join labeler.demos d on d.id = k.demo_id), '[]'::jsonb),
        'players', coalesce((select jsonb_agg(distinct labeler.player_name(d.metadata, k.player_id))
                               from labeler.reviewer_clips(me.id, c.id) r
                               join labeler.clips k on k.id = r.clip_id join labeler.demos d on d.id = k.demo_id), '[]'::jsonb),
        'nextClipId', labeler.next_clip(me.id, c.id, 0)) as x
      from labeler.assignments g join labeler.collections c on c.id = g.collection_id
      where g.account_id = me.id and g.revoked_at is null and c.status = 'published') q), '[]'::jsonb));
end $$;

create function public.labeler_reviewer_clip(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, null);
  v_collection uuid := labeler.uuid_param(p, 'collectionId', 'Collection');
  v_clip uuid := labeler.uuid_param(p, 'clipId', 'Clip');
  v_position integer;
  v_total integer;
  k labeler.clips;
  d labeler.demos;
  c labeler.collections;
  r labeler.review_revisions;
begin
  select q.pos into v_position from labeler.reviewer_clips(me.id, v_collection) q where q.clip_id = v_clip;
  if not found then
    perform labeler.fail('LB404', 'This clip is not assigned to you.');
  end if;
  select count(*) into v_total from labeler.reviewer_clips(me.id, v_collection);
  select * into k from labeler.clips where id = v_clip;
  select * into d from labeler.demos where id = k.demo_id;
  select * into c from labeler.collections where id = v_collection;
  select rr.* into r from labeler.review_heads h join labeler.review_revisions rr on rr.revision = h.revision
    where h.account_id = me.id and h.clip_id = k.id;
  -- Reviewer-safe fields only: no detector finding, source IDs, other reviewers or roster identifiers.
  return jsonb_build_object(
    'account', labeler.account_json(me),
    'clip', jsonb_build_object(
      'id', k.id, 'collectionId', c.id, 'collectionName', c.name,
      'index', (select count(*) from labeler.reviewer_clips(me.id, v_collection) q where q.pos <= v_position),
      'total', v_total, 'map', d.map, 'round', k.round,
      'playerName', labeler.player_name(d.metadata, k.player_id),
      'durationSec', k.context -> 'footage' -> 'duration',
      'momentAt', case when jsonb_typeof(k.context -> 'footage' -> 'anchor') = 'number'
                        and jsonb_typeof(k.context -> 'footage' -> 'start') = 'number'
                       then round(((k.context -> 'footage' ->> 'anchor')::numeric - (k.context -> 'footage' ->> 'start')::numeric), 2) end),
    'review', labeler.review_json(r),
    'previousClipId', (select q.clip_id from labeler.reviewer_clips(me.id, v_collection) q where q.pos < v_position
                       order by q.pos desc limit 1),
    'nextClipId', (select q.clip_id from labeler.reviewer_clips(me.id, v_collection) q where q.pos > v_position
                   order by q.pos limit 1),
    'nextUnfinishedClipId', (select q.clip_id from labeler.reviewer_clips(me.id, v_collection) q
                             where q.clip_id <> v_clip and q.status is distinct from 'complete'
                             order by (coalesce(q.status, '') = 'skipped'), (q.pos <= v_position), q.pos limit 1));
end $$;

create function public.labeler_reviewer_playback(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, null);
  v_clip uuid := labeler.uuid_param(p, 'clipId', 'Clip');
begin
  if not labeler.can_review(me.id, v_clip) then
    perform labeler.fail('LB404', 'This clip is not assigned to you.');
  end if;
  return jsonb_build_object('objectKey', (select object_key from labeler.clips where id = v_clip));
end $$;

-- One transaction: session, assignment, idempotency, optimistic concurrency, append, head.
create function public.labeler_reviewer_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me labeler.accounts := labeler.session_account(p, null);
  v_clip uuid := labeler.uuid_param(p, 'clipId', 'Clip');
  v_request uuid := labeler.uuid_param(p, 'requestId', 'Request');
  v_status text := labeler.text_param(p, 'status', '^(draft|complete|skipped)$', 'Status');
  v_notes text := labeler.text_param(p, 'notes', null, 'Note');
  v_language text := labeler.text_param(p, 'language', '^(en|pl)$', 'Language');
  v_assessment text;
  v_issue text;
  v_previous bigint;
  v_confirm boolean;
  h labeler.review_heads;
  old labeler.review_revisions;
  r labeler.review_revisions;
begin
  if char_length(v_notes) > 6000 then perform labeler.fail('LB422', 'Keep the note under 6,000 characters.'); end if;
  if jsonb_typeof(p -> 'assessment') = 'string' then
    v_assessment := labeler.text_param(p, 'assessment', '^(good|mistake|uncertain)$', 'Assessment');
  elsif p ? 'assessment' and jsonb_typeof(p -> 'assessment') <> 'null' then
    perform labeler.fail('LB422', 'Assessment is invalid.');
  end if;
  if jsonb_typeof(p -> 'issue') = 'string' then
    v_issue := labeler.text_param(p, 'issue', '^(wrong_footage|insufficient_context)$', 'Issue');
  elsif p ? 'issue' and jsonb_typeof(p -> 'issue') <> 'null' then
    perform labeler.fail('LB422', 'Issue is invalid.');
  end if;
  if jsonb_typeof(p -> 'previousRevision') = 'number' then
    v_previous := labeler.int_param(p, 'previousRevision', 1, 9223372036854775807, 'Previous revision');
  elsif p ? 'previousRevision' and jsonb_typeof(p -> 'previousRevision') <> 'null' then
    perform labeler.fail('LB422', 'Previous revision is invalid.');
  end if;
  if jsonb_typeof(p -> 'confirmFootage') <> 'boolean' then
    perform labeler.fail('LB422', 'Footage confirmation is required.');
  end if;
  v_confirm := (p ->> 'confirmFootage')::boolean;
  if v_status = 'complete' then
    if btrim(v_notes) = '' then perform labeler.fail('LB422', 'Write what went well or could be improved before saving.'); end if;
    if not v_confirm then perform labeler.fail('LB422', 'Saving confirms you checked the displayed player and event.'); end if;
    if v_issue is not null then perform labeler.fail('LB422', 'A reported problem keeps this clip unfinished.'); end if;
  elsif v_confirm then
    perform labeler.fail('LB422', 'Only Save and next confirms the footage.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(me.id::text || ':' || v_clip::text, 0));

  -- A retried request returns its original result, even after later revisions.
  select * into r from labeler.review_revisions where account_id = me.id and request_id = v_request;
  if found then
    if r.clip_id <> v_clip or r.status <> v_status or r.notes <> v_notes or r.language <> v_language
       or r.assessment is distinct from v_assessment or r.issue is distinct from v_issue
       or r.previous_revision is distinct from v_previous then
      perform labeler.fail('LB409', 'This save request was already used for different content.');
    end if;
    return jsonb_build_object('result', 'replayed', 'review', labeler.review_json(r),
      'headRevision', (select revision from labeler.review_heads where account_id = me.id and clip_id = v_clip));
  end if;

  if not labeler.can_review(me.id, v_clip) then
    perform labeler.fail('LB404', 'This clip is not assigned to you.');
  end if;

  select * into h from labeler.review_heads where account_id = me.id and clip_id = v_clip for update;
  if found then
    select * into old from labeler.review_revisions where revision = h.revision;
  end if;
  if v_previous is distinct from h.revision then
    return jsonb_build_object('result', 'conflict', 'current', labeler.review_json(old));
  end if;
  insert into labeler.review_revisions (account_id, clip_id, request_id, previous_revision, status, notes,
                                        assessment, language, confirm_footage, issue)
    values (me.id, v_clip, v_request, v_previous, v_status, v_notes, v_assessment, v_language, v_confirm, v_issue)
    returning * into r;
  insert into labeler.review_heads (account_id, clip_id, revision, status, updated_at)
    values (me.id, v_clip, r.revision, r.status, now())
    on conflict (account_id, clip_id) do update set revision = excluded.revision, status = excluded.status,
      updated_at = excluded.updated_at;
  return jsonb_build_object('result', 'saved', 'review', labeler.review_json(r));
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
