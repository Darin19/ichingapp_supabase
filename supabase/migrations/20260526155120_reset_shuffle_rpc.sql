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
    '',
    '',
    'manual',
    '',
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

revoke all on function public.reset_working_canvas_and_decks(jsonb, jsonb) from anon;
revoke all on function public.shuffle_random_decks(text) from anon;

grant execute on function public.reset_working_canvas_and_decks(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.shuffle_random_decks(text) to authenticated, service_role;
