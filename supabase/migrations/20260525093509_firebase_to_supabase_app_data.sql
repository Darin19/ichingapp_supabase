create or replace function public.is_app_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'yetiandi@iching.local';
$$;

create table public.iching_cards_master (
  id text primary key,
  deck_type text not null check (deck_type = 'iching'),
  number integer not null unique check (number between 1 and 64),
  sort_order integer,
  vietnamese_name text not null,
  english_name text not null,
  link1 text not null default '',
  link2 text not null default '',
  link3 text not null default '',
  content1 text not null default '',
  content2 text not null default '',
  content3 text not null default '',
  img_path text not null default '',
  image_url text,
  keywords text,
  uid text,
  created_at timestamptz,
  updated_at timestamptz
);

create table public.label_groups (
  id text primary key,
  name text not null,
  uid text,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
);

create table public.labels (
  id text primary key,
  name text not null,
  group_id text not null references public.label_groups(id) on delete cascade,
  uid text,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
);

create table public.app_cache (
  id text primary key,
  version text not null,
  updated_at timestamptz
);

create table public.canvases (
  id text primary key,
  name text not null,
  type text not null default 'saved' check (type in ('working', 'saved')),
  status text not null default 'active',
  card_count integer not null default 0,
  note_markdown text not null default '',
  scenario text not null default '',
  source text not null default 'manual' check (source in ('manual', 'auto-draw')),
  auto_draw_run_id text not null default '',
  deck_count integer,
  uid text,
  created_at timestamptz,
  updated_at timestamptz
);

create table public.canvas_cards (
  canvas_id text not null references public.canvases(id) on delete cascade,
  id text not null,
  card_id text not null,
  deck_type text check (deck_type in ('iching', 'tarot')),
  x double precision not null default 0,
  y double precision not null default 0,
  labels text[] not null default '{}',
  is_reversed boolean,
  polarity text check (polarity in ('positive', 'negative') or polarity is null),
  uid text,
  source_deck_index integer,
  draw_sequence integer,
  placed_sequence integer,
  auto_draw_reason text,
  position_label text,
  match_score double precision,
  created_at timestamptz,
  updated_at timestamptz,
  primary key (canvas_id, id)
);

create table public.random_decks (
  deck_type text not null check (deck_type in ('iching', 'tarot')),
  id text not null,
  name text not null,
  order_index integer not null,
  total_cards integer not null default 0,
  remaining_cards integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  primary key (deck_type, id)
);

create table public.random_deck_cards (
  deck_type text not null,
  deck_id text not null,
  id text not null,
  source_card_id text not null,
  number integer,
  current_location text not null default 'deck' check (current_location in ('deck', 'canvas')),
  draw_sequence integer,
  sort_order integer,
  added_at timestamptz,
  updated_at timestamptz,
  primary key (deck_type, deck_id, id),
  foreign key (deck_type, deck_id)
    references public.random_decks(deck_type, id)
    on delete cascade
);

create table public.auto_draw_runs (
  id text primary key,
  scenario text not null default '',
  script text not null default '',
  model text not null default '',
  provider text not null default '',
  reasoning_effort text not null default '',
  elapsed_ms integer,
  endpoint_host text not null default '',
  card_limit integer,
  returned_card_count integer,
  status text not null default '',
  applied_canvas_id text not null default '',
  structured_output jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create index labels_group_id_sort_order_idx
  on public.labels(group_id, sort_order, id);
create index canvases_type_created_at_idx
  on public.canvases(type, created_at desc);
create index canvas_cards_canvas_id_draw_sequence_idx
  on public.canvas_cards(canvas_id, draw_sequence);
create index random_decks_deck_type_order_index_idx
  on public.random_decks(deck_type, order_index);
create index random_deck_cards_deck_lookup_idx
  on public.random_deck_cards(deck_type, deck_id, current_location, sort_order);
create index auto_draw_runs_created_at_idx
  on public.auto_draw_runs(created_at desc);

alter table public.iching_cards_master enable row level security;
alter table public.label_groups enable row level security;
alter table public.labels enable row level security;
alter table public.app_cache enable row level security;
alter table public.canvases enable row level security;
alter table public.canvas_cards enable row level security;
alter table public.random_decks enable row level security;
alter table public.random_deck_cards enable row level security;
alter table public.auto_draw_runs enable row level security;

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

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;

create policy "App user can manage iching cards"
  on public.iching_cards_master
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage label groups"
  on public.label_groups
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage labels"
  on public.labels
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage app cache"
  on public.app_cache
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage canvases"
  on public.canvases
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage canvas cards"
  on public.canvas_cards
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage random decks"
  on public.random_decks
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage random deck cards"
  on public.random_deck_cards
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

create policy "App user can manage auto draw runs"
  on public.auto_draw_runs
  for all
  to authenticated
  using ((select public.is_app_user()))
  with check ((select public.is_app_user()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute '
      alter publication supabase_realtime add table
        public.iching_cards_master,
        public.label_groups,
        public.labels,
        public.app_cache,
        public.canvases,
        public.canvas_cards,
        public.random_decks,
        public.random_deck_cards,
        public.auto_draw_runs
    ';
  end if;
end $$;
