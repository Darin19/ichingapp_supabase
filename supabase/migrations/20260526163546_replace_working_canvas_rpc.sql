create or replace function public.replace_working_canvas(
  p_cards jsonb,
  p_note_markdown text,
  p_scenario text,
  p_source text,
  p_auto_draw_run_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  card_rec record;
  inserted_count integer := 0;
  normalized_source text := coalesce(nullif(p_source, ''), 'manual');
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if normalized_source not in ('manual', 'auto-draw') then
    normalized_source := 'manual';
  end if;

  perform pg_advisory_xact_lock(hashtext('working-canvas-replace'));

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
    created_at,
    updated_at
  )
  values (
    'working-canvas',
    'Working Canvas',
    'working',
    'active',
    0,
    coalesce(p_note_markdown, ''),
    coalesce(p_scenario, ''),
    normalized_source,
    coalesce(p_auto_draw_run_id, ''),
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
    updated_at = excluded.updated_at;

  for card_rec in
    select *
    from jsonb_to_recordset(coalesce(p_cards, '[]'::jsonb)) as card(
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
        array(select jsonb_array_elements_text(coalesce(card_rec.labels, '[]'::jsonb))),
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

  return jsonb_build_object('card_count', inserted_count);
end;
$$;

revoke all on function public.replace_working_canvas(jsonb, text, text, text, text) from public, anon;
grant execute on function public.replace_working_canvas(jsonb, text, text, text, text) to authenticated, service_role;
