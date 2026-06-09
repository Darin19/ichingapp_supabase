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

revoke all on table
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

grant select, insert, update, delete on table
  public.iching_cards_master,
  public.label_groups,
  public.labels,
  public.app_cache,
  public.canvases,
  public.canvas_cards,
  public.random_decks,
  public.random_deck_cards,
  public.auto_draw_runs
to authenticated;

grant select, insert, update, delete on table
  public.iching_cards_master,
  public.label_groups,
  public.labels,
  public.app_cache,
  public.canvases,
  public.canvas_cards,
  public.random_decks,
  public.random_deck_cards,
  public.auto_draw_runs
to service_role;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;
