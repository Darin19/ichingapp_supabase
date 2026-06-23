alter table public.canvases
  add column canvas_file_metadata jsonb not null default '{}'::jsonb;

alter table public.canvases
  add constraint canvases_canvas_file_metadata_object_check
  check (jsonb_typeof(canvas_file_metadata) = 'object');

alter table public.canvases
  drop constraint if exists canvases_source_check;

alter table public.canvases
  add constraint canvases_source_check
  check (source in ('manual', 'imported', 'auto-draw'));

create or replace function public.replace_working_canvas_v2(
  p_name text,
  p_cards jsonb,
  p_note_markdown text,
  p_source text,
  p_canvas_file_metadata jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  now_ts timestamptz := pg_catalog.now();
  card_rec record;
  inserted_count integer := 0;
  normalized_source text := coalesce(nullif(p_source, ''), 'manual');
  normalized_metadata jsonb := coalesce(p_canvas_file_metadata, '{}'::jsonb);
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_cards, '[]'::jsonb)) <> 'array' then
    raise exception 'cards must be a JSON array' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_array_length(coalesce(p_cards, '[]'::jsonb)) > 500 then
    raise exception 'canvas exceeds 500 cards' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(normalized_metadata) <> 'object' then
    raise exception 'canvas file metadata must be a JSON object' using errcode = '22023';
  end if;

  if normalized_source not in ('manual', 'imported', 'auto-draw') then
    raise exception 'invalid canvas source' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('working-canvas-replace-v2'));

  delete from public.canvas_cards
  where canvas_id = 'working-canvas';

  insert into public.canvases (
    id,
    name,
    type,
    status,
    card_count,
    note_markdown,
    scenario,
    source,
    auto_draw_run_id,
    canvas_file_metadata,
    created_at,
    updated_at
  )
  values (
    'working-canvas',
    coalesce(nullif(pg_catalog.btrim(p_name), ''), 'Working Canvas'),
    'working',
    'active',
    0,
    coalesce(p_note_markdown, ''),
    '',
    normalized_source,
    '',
    normalized_metadata,
    now_ts,
    now_ts
  )
  on conflict (id) do update
  set
    name = excluded.name,
    type = excluded.type,
    status = excluded.status,
    card_count = excluded.card_count,
    note_markdown = excluded.note_markdown,
    scenario = excluded.scenario,
    source = excluded.source,
    auto_draw_run_id = excluded.auto_draw_run_id,
    canvas_file_metadata = excluded.canvas_file_metadata,
    updated_at = excluded.updated_at;

  for card_rec in
    select *
    from pg_catalog.jsonb_to_recordset(coalesce(p_cards, '[]'::jsonb)) as card(
      id text,
      card_id text,
      deck_type text,
      x double precision,
      y double precision,
      labels jsonb,
      is_reversed boolean,
      polarity text,
      source_deck_index integer,
      draw_sequence integer,
      placed_sequence integer,
      auto_draw_reason text,
      position_label text,
      match_score double precision
    )
    order by coalesce(draw_sequence, 0), id
  loop
    insert into public.canvas_cards (
      canvas_id,
      id,
      card_id,
      deck_type,
      x,
      y,
      labels,
      is_reversed,
      polarity,
      source_deck_index,
      draw_sequence,
      placed_sequence,
      auto_draw_reason,
      position_label,
      match_score,
      created_at,
      updated_at
    )
    values (
      'working-canvas',
      card_rec.id,
      card_rec.card_id,
      card_rec.deck_type,
      coalesce(card_rec.x, 0),
      coalesce(card_rec.y, 0),
      coalesce(
        array(
          select pg_catalog.jsonb_array_elements_text(
            coalesce(card_rec.labels, '[]'::jsonb)
          )
        ),
        '{}'::text[]
      ),
      coalesce(card_rec.is_reversed, false),
      card_rec.polarity,
      card_rec.source_deck_index,
      card_rec.draw_sequence,
      card_rec.placed_sequence,
      card_rec.auto_draw_reason,
      card_rec.position_label,
      card_rec.match_score,
      now_ts,
      now_ts
    );

    inserted_count := inserted_count + 1;
  end loop;

  update public.canvases
  set
    card_count = inserted_count,
    updated_at = now_ts
  where id = 'working-canvas';

  return pg_catalog.jsonb_build_object('card_count', inserted_count);
end;
$$;

create or replace function public.save_canvas_snapshot_v2(
  p_canvas_id text,
  p_name text,
  p_cards jsonb,
  p_note_markdown text,
  p_source text,
  p_canvas_file_metadata jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  now_ts timestamptz := pg_catalog.now();
  card_rec record;
  inserted_count integer := 0;
  normalized_source text := coalesce(nullif(p_source, ''), 'manual');
  normalized_metadata jsonb := coalesce(p_canvas_file_metadata, '{}'::jsonb);
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_canvas_id is null or p_canvas_id = '' then
    raise exception 'missing canvas id' using errcode = '22023';
  end if;

  if p_name is null or pg_catalog.btrim(p_name) = '' then
    raise exception 'missing canvas name' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_cards, '[]'::jsonb)) <> 'array' then
    raise exception 'cards must be a JSON array' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_array_length(coalesce(p_cards, '[]'::jsonb)) > 500 then
    raise exception 'canvas exceeds 500 cards' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(normalized_metadata) <> 'object' then
    raise exception 'canvas file metadata must be a JSON object' using errcode = '22023';
  end if;

  if normalized_source not in ('manual', 'imported', 'auto-draw') then
    raise exception 'invalid canvas source' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('save-canvas-v2-' || p_canvas_id)
  );

  delete from public.canvas_cards
  where canvas_id = p_canvas_id;

  insert into public.canvases (
    id,
    name,
    type,
    status,
    card_count,
    note_markdown,
    scenario,
    source,
    auto_draw_run_id,
    canvas_file_metadata,
    created_at,
    updated_at
  )
  values (
    p_canvas_id,
    pg_catalog.btrim(p_name),
    'saved',
    'active',
    0,
    coalesce(p_note_markdown, ''),
    '',
    normalized_source,
    '',
    normalized_metadata,
    now_ts,
    now_ts
  )
  on conflict (id) do update
  set
    name = excluded.name,
    type = excluded.type,
    status = excluded.status,
    note_markdown = excluded.note_markdown,
    scenario = excluded.scenario,
    source = excluded.source,
    auto_draw_run_id = excluded.auto_draw_run_id,
    canvas_file_metadata = excluded.canvas_file_metadata,
    updated_at = excluded.updated_at;

  for card_rec in
    select *
    from pg_catalog.jsonb_to_recordset(coalesce(p_cards, '[]'::jsonb)) as card(
      id text,
      card_id text,
      deck_type text,
      x double precision,
      y double precision,
      labels jsonb,
      is_reversed boolean,
      polarity text,
      source_deck_index integer,
      draw_sequence integer,
      placed_sequence integer,
      auto_draw_reason text,
      position_label text,
      match_score double precision
    )
    order by coalesce(draw_sequence, 0), id
  loop
    insert into public.canvas_cards (
      canvas_id,
      id,
      card_id,
      deck_type,
      x,
      y,
      labels,
      is_reversed,
      polarity,
      source_deck_index,
      draw_sequence,
      placed_sequence,
      auto_draw_reason,
      position_label,
      match_score,
      created_at,
      updated_at
    )
    values (
      p_canvas_id,
      card_rec.id,
      card_rec.card_id,
      card_rec.deck_type,
      coalesce(card_rec.x, 0),
      coalesce(card_rec.y, 0),
      coalesce(
        array(
          select pg_catalog.jsonb_array_elements_text(
            coalesce(card_rec.labels, '[]'::jsonb)
          )
        ),
        '{}'::text[]
      ),
      coalesce(card_rec.is_reversed, false),
      card_rec.polarity,
      card_rec.source_deck_index,
      card_rec.draw_sequence,
      card_rec.placed_sequence,
      card_rec.auto_draw_reason,
      card_rec.position_label,
      card_rec.match_score,
      now_ts,
      now_ts
    );

    inserted_count := inserted_count + 1;
  end loop;

  update public.canvases
  set
    card_count = inserted_count,
    updated_at = now_ts
  where id = p_canvas_id;

  return pg_catalog.jsonb_build_object(
    'canvas_id', p_canvas_id,
    'card_count', inserted_count
  );
end;
$$;

drop function if exists public.apply_auto_draw_result(
  jsonb,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer,
  jsonb
);

revoke all on function public.replace_working_canvas_v2(text, jsonb, text, text, jsonb)
  from public, anon;
revoke all on function public.save_canvas_snapshot_v2(text, text, jsonb, text, text, jsonb)
  from public, anon;

grant execute on function public.replace_working_canvas_v2(text, jsonb, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.save_canvas_snapshot_v2(text, text, jsonb, text, text, jsonb)
  to authenticated, service_role;
