create or replace function public.ensure_random_decks(
  p_deck_type text,
  p_cards jsonb,
  p_deck_count integer default 3
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  target_count integer := greatest(1, least(coalesce(p_deck_count, 3), 10));
  existing_count integer;
  deck_index integer;
  card_rec record;
  decks_json jsonb;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_deck_type not in ('iching', 'tarot') then
    raise exception 'invalid deck type' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('ensure-random-decks-' || p_deck_type));

  select count(*)
  into existing_count
  from public.random_decks
  where deck_type = p_deck_type;

  if existing_count = 0 then
    for deck_index in 1..target_count loop
      insert into public.random_decks (
        deck_type,
        id,
        name,
        order_index,
        total_cards,
        remaining_cards,
        is_default,
        created_at,
        updated_at
      )
      values (
        p_deck_type,
        'deck-' || deck_index,
        case when p_deck_type = 'iching' then 'Deck ' else 'Tarot ' end || deck_index,
        deck_index,
        jsonb_array_length(coalesce(p_cards, '[]'::jsonb)),
        jsonb_array_length(coalesce(p_cards, '[]'::jsonb)),
        deck_index <= 3,
        now_ts,
        now_ts
      );

      for card_rec in
        select *
        from jsonb_to_recordset(coalesce(p_cards, '[]'::jsonb)) as card(
          id text,
          number integer,
          sort_order integer
        )
        order by coalesce(sort_order, number, 0), id
      loop
        insert into public.random_deck_cards (
          deck_type,
          deck_id,
          id,
          source_card_id,
          number,
          current_location,
          draw_sequence,
          sort_order,
          added_at,
          updated_at
        )
        values (
          p_deck_type,
          'deck-' || deck_index,
          card_rec.id,
          card_rec.id,
          card_rec.number,
          'deck',
          null,
          coalesce(card_rec.sort_order, card_rec.number, 0),
          now_ts,
          now_ts
        );
      end loop;
    end loop;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', deck_rows.id,
        'orderIndex', deck_rows.order_index,
        'cardIds', deck_rows.card_ids
      )
      order by deck_rows.order_index, deck_rows.id
    ),
    '[]'::jsonb
  )
  into decks_json
  from (
    select
      decks.id,
      decks.order_index,
      coalesce(
        (
          select jsonb_agg(cards.source_card_id order by cards.sort_order, cards.id)
          from public.random_deck_cards cards
          where cards.deck_type = decks.deck_type
            and cards.deck_id = decks.id
            and cards.current_location = 'deck'
        ),
        '[]'::jsonb
      ) as card_ids
    from public.random_decks decks
    where decks.deck_type = p_deck_type
  ) deck_rows;

  return jsonb_build_object(
    'deck_count', coalesce(jsonb_array_length(decks_json), 0),
    'decks', decks_json
  );
end;
$$;

create or replace function public.set_random_deck_count(
  p_deck_type text,
  p_cards jsonb,
  p_deck_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  target_count integer := greatest(1, least(coalesce(p_deck_count, 3), 10));
  deck_index integer;
  card_rec record;
  remaining_count integer;
  decks_json jsonb;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_deck_type not in ('iching', 'tarot') then
    raise exception 'invalid deck type' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('set-random-deck-count-' || p_deck_type));

  delete from public.random_decks
  where deck_type = p_deck_type
    and (
      order_index > target_count
      or id not in (
        select 'deck-' || generate_series(1, target_count)
      )
    );

  for deck_index in 1..target_count loop
    insert into public.random_decks (
      deck_type,
      id,
      name,
      order_index,
      total_cards,
      remaining_cards,
      is_default,
      created_at,
      updated_at
    )
    values (
      p_deck_type,
      'deck-' || deck_index,
      case when p_deck_type = 'iching' then 'Deck ' else 'Tarot ' end || deck_index,
      deck_index,
      jsonb_array_length(coalesce(p_cards, '[]'::jsonb)),
      jsonb_array_length(coalesce(p_cards, '[]'::jsonb)),
      deck_index <= 3,
      now_ts,
      now_ts
    )
    on conflict (deck_type, id) do update
    set
      name = excluded.name,
      order_index = excluded.order_index,
      total_cards = excluded.total_cards,
      is_default = excluded.is_default,
      updated_at = excluded.updated_at;

    for card_rec in
      select *
      from jsonb_to_recordset(coalesce(p_cards, '[]'::jsonb)) as card(
        id text,
        number integer,
        sort_order integer
      )
      order by coalesce(sort_order, number, 0), id
    loop
      insert into public.random_deck_cards (
        deck_type,
        deck_id,
        id,
        source_card_id,
        number,
        current_location,
        draw_sequence,
        sort_order,
        added_at,
        updated_at
      )
      values (
        p_deck_type,
        'deck-' || deck_index,
        card_rec.id,
        card_rec.id,
        card_rec.number,
        'deck',
        null,
        coalesce(card_rec.sort_order, card_rec.number, 0),
        now_ts,
        now_ts
      )
      on conflict (deck_type, deck_id, id) do nothing;
    end loop;

    select count(*)
    into remaining_count
    from public.random_deck_cards
    where deck_type = p_deck_type
      and deck_id = 'deck-' || deck_index
      and current_location = 'deck';

    update public.random_decks
    set
      remaining_cards = remaining_count,
      updated_at = now_ts
    where deck_type = p_deck_type
      and id = 'deck-' || deck_index;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', deck_rows.id,
        'orderIndex', deck_rows.order_index,
        'cardIds', deck_rows.card_ids
      )
      order by deck_rows.order_index, deck_rows.id
    ),
    '[]'::jsonb
  )
  into decks_json
  from (
    select
      decks.id,
      decks.order_index,
      coalesce(
        (
          select jsonb_agg(cards.source_card_id order by cards.sort_order, cards.id)
          from public.random_deck_cards cards
          where cards.deck_type = decks.deck_type
            and cards.deck_id = decks.id
            and cards.current_location = 'deck'
        ),
        '[]'::jsonb
      ) as card_ids
    from public.random_decks decks
    where decks.deck_type = p_deck_type
  ) deck_rows;

  return jsonb_build_object(
    'deck_count', coalesce(jsonb_array_length(decks_json), 0),
    'decks', decks_json
  );
end;
$$;

create or replace function public.shuffle_random_decks(p_deck_type text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  deck_rec record;
  deck_size integer;
  shuffled_deck_count integer := 0;
  deck_count integer := 0;
  decks_json jsonb;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_deck_type not in ('iching', 'tarot') then
    raise exception 'invalid deck type' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('shuffle-random-decks-' || p_deck_type));

  for deck_rec in
    select id
    from public.random_decks
    where deck_type = p_deck_type
    order by order_index, id
  loop
    deck_count := deck_count + 1;

    select count(*)
    into deck_size
    from public.random_deck_cards
    where deck_type = p_deck_type
      and deck_id = deck_rec.id
      and current_location = 'deck';

    if deck_size > 1 then
      with shuffled as (
        select
          id,
          row_number() over (order by random()) - 1 as next_sort_order
        from public.random_deck_cards
        where deck_type = p_deck_type
          and deck_id = deck_rec.id
          and current_location = 'deck'
      )
      update public.random_deck_cards cards
      set
        sort_order = shuffled.next_sort_order,
        updated_at = now_ts
      from shuffled
      where cards.deck_type = p_deck_type
        and cards.deck_id = deck_rec.id
        and cards.id = shuffled.id;

      shuffled_deck_count := shuffled_deck_count + 1;
    end if;

    update public.random_decks
    set
      remaining_cards = deck_size,
      updated_at = now_ts
    where deck_type = p_deck_type
      and id = deck_rec.id;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', deck_rows.id,
        'orderIndex', deck_rows.order_index,
        'cardIds', deck_rows.card_ids
      )
      order by deck_rows.order_index, deck_rows.id
    ),
    '[]'::jsonb
  )
  into decks_json
  from (
    select
      decks.id,
      decks.order_index,
      coalesce(
        (
          select jsonb_agg(cards.source_card_id order by cards.sort_order, cards.id)
          from public.random_deck_cards cards
          where cards.deck_type = decks.deck_type
            and cards.deck_id = decks.id
            and cards.current_location = 'deck'
        ),
        '[]'::jsonb
      ) as card_ids
    from public.random_decks decks
    where decks.deck_type = p_deck_type
  ) deck_rows;

  return jsonb_build_object(
    'deck_count', deck_count,
    'shuffled_deck_count', shuffled_deck_count,
    'decks', decks_json
  );
end;
$$;

create or replace function public.remove_card_from_working_canvas(
  p_spread_card_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  removed_card public.canvas_cards%rowtype;
  target_deck_id text;
  remaining_count integer;
  did_return_card boolean := false;
  next_card_count integer;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_spread_card_id is null or p_spread_card_id = '' then
    raise exception 'missing spread card id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('working-canvas-remove'));

  delete from public.canvas_cards
  where canvas_id = 'working-canvas'
    and id = p_spread_card_id
  returning *
  into removed_card;

  if not found then
    raise exception 'canvas card not found' using errcode = 'P0002';
  end if;

  if removed_card.source_deck_index is not null then
    target_deck_id := 'deck-' || (removed_card.source_deck_index + 1);

    update public.random_deck_cards
    set
      current_location = 'deck',
      draw_sequence = null,
      updated_at = now_ts
    where deck_type = removed_card.deck_type
      and deck_id = target_deck_id
      and source_card_id = removed_card.card_id
      and current_location = 'canvas';

    get diagnostics remaining_count = row_count;
    did_return_card := remaining_count > 0;

    select count(*)
    into remaining_count
    from public.random_deck_cards
    where deck_type = removed_card.deck_type
      and deck_id = target_deck_id
      and current_location = 'deck';

    update public.random_decks
    set
      remaining_cards = remaining_count,
      updated_at = now_ts
    where deck_type = removed_card.deck_type
      and id = target_deck_id;
  end if;

  select count(*)
  into next_card_count
  from public.canvas_cards
  where canvas_id = 'working-canvas';

  update public.canvases
  set
    card_count = next_card_count,
    updated_at = now_ts
  where id = 'working-canvas';

  return jsonb_build_object(
    'card_count', next_card_count,
    'returned_card', did_return_card
  );
end;
$$;

create or replace function public.save_canvas_snapshot(
  p_canvas_id text,
  p_name text,
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

  if p_canvas_id is null or p_canvas_id = '' then
    raise exception 'missing canvas id' using errcode = '22023';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'missing canvas name' using errcode = '22023';
  end if;

  if normalized_source not in ('manual', 'auto-draw') then
    normalized_source := 'manual';
  end if;

  perform pg_advisory_xact_lock(hashtext('save-canvas-' || p_canvas_id));

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
    created_at,
    updated_at
  )
  values (
    p_canvas_id,
    btrim(p_name),
    'saved',
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
      p_canvas_id,
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
  where id = p_canvas_id;

  return jsonb_build_object(
    'canvas_id', p_canvas_id,
    'card_count', inserted_count
  );
end;
$$;

create or replace function public.apply_auto_draw_result(
  p_cards jsonb,
  p_note_markdown text,
  p_scenario text,
  p_script text,
  p_run_id text,
  p_created_label_group jsonb,
  p_created_labels jsonb,
  p_master_data_version text,
  p_model text,
  p_provider text,
  p_reasoning_effort text,
  p_elapsed_ms integer,
  p_endpoint_host text,
  p_card_limit integer,
  p_structured_output jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  card_rec record;
  label_rec record;
  inserted_count integer := 0;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_run_id is null or p_run_id = '' then
    raise exception 'missing auto draw run id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('apply-auto-draw'));

  if p_created_label_group is not null and p_created_label_group ? 'id' then
    insert into public.label_groups (
      id,
      name,
      sort_order,
      created_at,
      updated_at
    )
    values (
      p_created_label_group ->> 'id',
      p_created_label_group ->> 'name',
      nullif(p_created_label_group ->> 'sortOrder', '')::integer,
      now_ts,
      now_ts
    )
    on conflict (id) do update
    set
      name = excluded.name,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at;
  end if;

  for label_rec in
    select *
    from jsonb_to_recordset(coalesce(p_created_labels, '[]'::jsonb)) as label(
      id text,
      name text,
      group_id text,
      sort_order integer
    )
  loop
    insert into public.labels (
      id,
      name,
      group_id,
      sort_order,
      created_at,
      updated_at
    )
    values (
      label_rec.id,
      label_rec.name,
      label_rec.group_id,
      label_rec.sort_order,
      now_ts,
      now_ts
    )
    on conflict (id) do update
    set
      name = excluded.name,
      group_id = excluded.group_id,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at;
  end loop;

  if coalesce(p_master_data_version, '') <> '' then
    insert into public.app_cache (
      id,
      version,
      updated_at
    )
    values (
      'master_data',
      p_master_data_version,
      now_ts
    )
    on conflict (id) do update
    set
      version = excluded.version,
      updated_at = excluded.updated_at;
  end if;

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
    'auto-draw',
    p_run_id,
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

  insert into public.auto_draw_runs (
    id,
    scenario,
    script,
    model,
    provider,
    reasoning_effort,
    elapsed_ms,
    endpoint_host,
    card_limit,
    returned_card_count,
    status,
    applied_canvas_id,
    structured_output,
    created_at,
    updated_at
  )
  values (
    p_run_id,
    coalesce(p_scenario, ''),
    coalesce(p_script, ''),
    coalesce(p_model, ''),
    coalesce(p_provider, 'freemodel.dev'),
    coalesce(p_reasoning_effort, ''),
    p_elapsed_ms,
    coalesce(p_endpoint_host, ''),
    p_card_limit,
    inserted_count,
    'applied',
    'working-canvas',
    p_structured_output,
    now_ts,
    now_ts
  )
  on conflict (id) do update
  set
    scenario = excluded.scenario,
    script = excluded.script,
    model = excluded.model,
    provider = excluded.provider,
    reasoning_effort = excluded.reasoning_effort,
    elapsed_ms = excluded.elapsed_ms,
    endpoint_host = excluded.endpoint_host,
    card_limit = excluded.card_limit,
    returned_card_count = excluded.returned_card_count,
    status = excluded.status,
    applied_canvas_id = excluded.applied_canvas_id,
    structured_output = excluded.structured_output,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'card_count', inserted_count,
    'master_data_version', coalesce(p_master_data_version, '')
  );
end;
$$;

revoke all on function public.ensure_random_decks(text, jsonb, integer) from public, anon;
revoke all on function public.set_random_deck_count(text, jsonb, integer) from public, anon;
revoke all on function public.shuffle_random_decks(text) from public, anon;
revoke all on function public.remove_card_from_working_canvas(text) from public, anon;
revoke all on function public.save_canvas_snapshot(text, text, jsonb, text, text, text, text) from public, anon;
revoke all on function public.apply_auto_draw_result(jsonb, text, text, text, text, jsonb, jsonb, text, text, text, text, integer, text, integer, jsonb) from public, anon;

grant execute on function public.ensure_random_decks(text, jsonb, integer) to authenticated, service_role;
grant execute on function public.set_random_deck_count(text, jsonb, integer) to authenticated, service_role;
grant execute on function public.shuffle_random_decks(text) to authenticated, service_role;
grant execute on function public.remove_card_from_working_canvas(text) to authenticated, service_role;
grant execute on function public.save_canvas_snapshot(text, text, jsonb, text, text, text, text) to authenticated, service_role;
grant execute on function public.apply_auto_draw_result(jsonb, text, text, text, text, jsonb, jsonb, text, text, text, text, integer, text, integer, jsonb) to authenticated, service_role;
