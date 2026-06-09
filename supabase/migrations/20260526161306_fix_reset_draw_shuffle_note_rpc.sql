create or replace function public.is_app_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'yetiandi@iching.local';
$$;

alter table if exists public.iching_cards_master enable row level security;
alter table if exists public.label_groups enable row level security;
alter table if exists public.labels enable row level security;
alter table if exists public.app_cache enable row level security;
alter table if exists public.canvases enable row level security;
alter table if exists public.canvas_cards enable row level security;
alter table if exists public.random_decks enable row level security;
alter table if exists public.random_deck_cards enable row level security;
alter table if exists public.auto_draw_runs enable row level security;

grant usage on schema public to authenticated, service_role;
grant execute on function public.is_app_user() to authenticated, service_role;

revoke all on
  public.iching_cards_master,
  public.label_groups,
  public.labels,
  public.app_cache,
  public.canvases,
  public.canvas_cards,
  public.random_decks,
  public.random_deck_cards,
  public.auto_draw_runs
from anon;

grant select, insert, update, delete on
  public.iching_cards_master,
  public.label_groups,
  public.labels,
  public.app_cache,
  public.canvases,
  public.canvas_cards,
  public.random_decks,
  public.random_deck_cards,
  public.auto_draw_runs
to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'canvases'
      and policyname = 'App user can manage canvases'
  ) then
    create policy "App user can manage canvases"
      on public.canvases
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'canvas_cards'
      and policyname = 'App user can manage canvas cards'
  ) then
    create policy "App user can manage canvas cards"
      on public.canvas_cards
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'random_decks'
      and policyname = 'App user can manage random decks'
  ) then
    create policy "App user can manage random decks"
      on public.random_decks
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'random_deck_cards'
      and policyname = 'App user can manage random deck cards'
  ) then
    create policy "App user can manage random deck cards"
      on public.random_deck_cards
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'iching_cards_master'
      and policyname = 'App user can manage iching cards'
  ) then
    create policy "App user can manage iching cards"
      on public.iching_cards_master
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'label_groups'
      and policyname = 'App user can manage label groups'
  ) then
    create policy "App user can manage label groups"
      on public.label_groups
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'labels'
      and policyname = 'App user can manage labels'
  ) then
    create policy "App user can manage labels"
      on public.labels
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_cache'
      and policyname = 'App user can manage app cache'
  ) then
    create policy "App user can manage app cache"
      on public.app_cache
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'auto_draw_runs'
      and policyname = 'App user can manage auto draw runs'
  ) then
    create policy "App user can manage auto draw runs"
      on public.auto_draw_runs
      for all
      to authenticated
      using ((select public.is_app_user()))
      with check ((select public.is_app_user()));
  end if;
end $$;

create or replace function public.reset_working_canvas_and_decks(
  p_iching_cards jsonb,
  p_tarot_cards jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  deck_index integer;
  card_rec record;
  target_deck_type text;
  target_cards jsonb;
  target_total integer;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('working-canvas-reset'));

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
    deck_count,
    created_at,
    updated_at
  )
  values (
    'working-canvas',
    'Working Canvas',
    'working',
    'active',
    0,
    '',
    '',
    'manual',
    '',
    3,
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
    deck_count = excluded.deck_count,
    updated_at = excluded.updated_at;

  delete from public.random_deck_cards
  where deck_type in ('iching', 'tarot');

  delete from public.random_decks
  where deck_type in ('iching', 'tarot');

  for target_deck_type, target_cards in
    select *
    from (values
      ('iching'::text, coalesce(p_iching_cards, '[]'::jsonb)),
      ('tarot'::text, coalesce(p_tarot_cards, '[]'::jsonb))
    ) as deck_input(deck_type, cards)
  loop
    target_total := jsonb_array_length(target_cards);

    for deck_index in 1..3 loop
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
        target_deck_type,
        'deck-' || deck_index,
        case when target_deck_type = 'iching' then 'Deck ' else 'Tarot ' end || deck_index,
        deck_index,
        target_total,
        target_total,
        true,
        now_ts,
        now_ts
      );

      for card_rec in
        select *
        from jsonb_to_recordset(target_cards) as card(
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
          target_deck_type,
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
  end loop;
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

  return jsonb_build_object(
    'deck_count', deck_count,
    'shuffled_deck_count', shuffled_deck_count
  );
end;
$$;

create or replace function public.draw_card_to_working_canvas(
  p_spread_card_id text,
  p_card_id text,
  p_deck_type text,
  p_source_deck_index integer,
  p_x double precision,
  p_y double precision
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  target_deck_id text;
  next_sequence integer;
  deck_card public.random_deck_cards%rowtype;
  remaining_count integer;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_deck_type not in ('iching', 'tarot') then
    raise exception 'invalid deck type' using errcode = '22023';
  end if;

  if p_spread_card_id is null or p_spread_card_id = '' then
    raise exception 'missing spread card id' using errcode = '22023';
  end if;

  if p_card_id is null or p_card_id = '' then
    raise exception 'missing card id' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('working-canvas-draw'));

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
    '',
    '',
    'manual',
    '',
    now_ts,
    now_ts
  )
  on conflict (id) do nothing;

  select coalesce(max(draw_sequence), 0) + 1
  into next_sequence
  from public.canvas_cards
  where canvas_id = 'working-canvas';

  if p_source_deck_index is not null then
    if p_source_deck_index < 0 then
      raise exception 'invalid deck index' using errcode = '22023';
    end if;

    target_deck_id := 'deck-' || (p_source_deck_index + 1);

    select *
    into deck_card
    from public.random_deck_cards
    where deck_type = p_deck_type
      and deck_id = target_deck_id
      and source_card_id = p_card_id
      and current_location = 'deck'
    order by sort_order, id
    for update;

    if not found then
      raise exception 'card is not available in selected deck' using errcode = 'P0002';
    end if;

    update public.random_deck_cards
    set
      current_location = 'canvas',
      draw_sequence = next_sequence,
      updated_at = now_ts
    where deck_type = deck_card.deck_type
      and deck_id = deck_card.deck_id
      and id = deck_card.id;

    select count(*)
    into remaining_count
    from public.random_deck_cards
    where deck_type = p_deck_type
      and deck_id = target_deck_id
      and current_location = 'deck';

    update public.random_decks
    set
      remaining_cards = remaining_count,
      updated_at = now_ts
    where deck_type = p_deck_type
      and id = target_deck_id;
  end if;

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
    created_at,
    updated_at
  )
  values (
    'working-canvas',
    p_spread_card_id,
    p_card_id,
    p_deck_type,
    p_x,
    p_y,
    '{}',
    false,
    null,
    p_source_deck_index,
    next_sequence,
    next_sequence,
    now_ts,
    now_ts
  );

  update public.canvases
  set
    card_count = (
      select count(*)
      from public.canvas_cards
      where canvas_id = 'working-canvas'
    ),
    updated_at = now_ts
  where id = 'working-canvas';

  return jsonb_build_object(
    'id', p_spread_card_id,
    'cardId', p_card_id,
    'deckType', p_deck_type,
    'x', p_x,
    'y', p_y,
    'labels', '[]'::jsonb,
    'isReversed', false,
    'polarity', null,
    'sourceDeckIndex', p_source_deck_index,
    'drawSequence', next_sequence,
    'placedSequence', next_sequence
  );
end;
$$;

revoke all on function public.reset_working_canvas_and_decks(jsonb, jsonb) from public, anon;
revoke all on function public.shuffle_random_decks(text) from public, anon;
revoke all on function public.draw_card_to_working_canvas(text, text, text, integer, double precision, double precision) from public, anon;

grant execute on function public.reset_working_canvas_and_decks(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.shuffle_random_decks(text) to authenticated, service_role;
grant execute on function public.draw_card_to_working_canvas(text, text, text, integer, double precision, double precision) to authenticated, service_role;
