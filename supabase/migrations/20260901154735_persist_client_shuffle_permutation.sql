create or replace function public.shuffle_random_decks_v2(
  p_deck_type text,
  p_decks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  expected_deck_count integer;
  requested_deck_count integer;
  invalid_deck_count integer;
  decks_json jsonb;
begin
  if not public.is_app_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_deck_type not in ('iching', 'tarot') then
    raise exception 'invalid deck type' using errcode = '22023';
  end if;

  if jsonb_typeof(p_decks) <> 'array' then
    raise exception 'invalid deck payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('shuffle-random-decks-' || p_deck_type));

  select count(*) into expected_deck_count
  from public.random_decks
  where deck_type = p_deck_type;

  select count(*) into requested_deck_count
  from jsonb_array_elements(p_decks);

  if requested_deck_count <> expected_deck_count then
    raise exception 'deck count does not match' using errcode = '22023';
  end if;

  with requested_decks as (
    select
      entry ->> 'id' as deck_id,
      entry -> 'cardIds' as card_ids
    from jsonb_array_elements(p_decks) entry
  )
  select count(*) into invalid_deck_count
  from requested_decks requested
  left join public.random_decks decks
    on decks.id = requested.deck_id
   and decks.deck_type = p_deck_type
  where decks.id is null
     or requested.deck_id is null
     or jsonb_typeof(requested.card_ids) <> 'array';

  if invalid_deck_count > 0 then
    raise exception 'invalid deck payload' using errcode = '22023';
  end if;

  with requested_decks as (
    select
      entry ->> 'id' as deck_id,
      entry -> 'cardIds' as card_ids
    from jsonb_array_elements(p_decks) entry
  ),
  requested_cards as (
    select
      requested.deck_id,
      card.value #>> '{}' as card_id,
      card.ordinality - 1 as sort_order
    from jsonb_array_elements(p_decks) entry
    cross join lateral (
      select entry ->> 'id' as deck_id, entry -> 'cardIds' as card_ids
    ) requested
    cross join lateral jsonb_array_elements_text(requested.card_ids)
      with ordinality as card(value, ordinality)
  ),
  validation as (
    select
      requested_decks.deck_id,
      count(requested.card_id) as requested_count,
      count(distinct requested.card_id) as unique_requested_count,
      count(cards.id) as matching_card_count,
      (
        select count(*)
        from public.random_deck_cards current_cards
        where current_cards.deck_type = p_deck_type
          and current_cards.deck_id = requested_decks.deck_id
          and current_cards.current_location = 'deck'
      ) as available_card_count
    from requested_decks
    left join requested_cards requested
      on requested.deck_id = requested_decks.deck_id
    left join public.random_deck_cards cards
      on cards.deck_type = p_deck_type
     and cards.deck_id = requested.deck_id
     and cards.source_card_id = requested.card_id
     and cards.current_location = 'deck'
    group by requested_decks.deck_id
  )
  select count(*) into invalid_deck_count
  from validation
  where requested_count <> unique_requested_count
     or requested_count <> matching_card_count
     or requested_count <> available_card_count;

  if invalid_deck_count > 0 then
    raise exception 'card permutation does not match deck' using errcode = '22023';
  end if;

  with requested_cards as (
    select
      requested.deck_id,
      card.value #>> '{}' as card_id,
      card.ordinality - 1 as sort_order
    from jsonb_array_elements(p_decks) entry
    cross join lateral (
      select entry ->> 'id' as deck_id, entry -> 'cardIds' as card_ids
    ) requested
    cross join lateral jsonb_array_elements_text(requested.card_ids)
      with ordinality as card(value, ordinality)
  )
  update public.random_deck_cards cards
  set sort_order = requested.sort_order, updated_at = now_ts
  from requested_cards requested
  where cards.deck_type = p_deck_type
    and cards.deck_id = requested.deck_id
    and cards.source_card_id = requested.card_id
    and cards.current_location = 'deck';

  update public.random_decks decks
  set
    remaining_cards = (
      select count(*)
      from public.random_deck_cards cards
      where cards.deck_type = decks.deck_type
        and cards.deck_id = decks.id
        and cards.current_location = 'deck'
    ),
    updated_at = now_ts
  where decks.deck_type = p_deck_type;

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
  ) into decks_json
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
    'deck_count', expected_deck_count,
    'decks', decks_json
  );
end;
$$;

revoke all on function public.shuffle_random_decks_v2(text, jsonb) from public, anon;
grant execute on function public.shuffle_random_decks_v2(text, jsonb) to authenticated, service_role;
