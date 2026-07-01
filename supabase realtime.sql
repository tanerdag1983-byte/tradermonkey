-- Stap 1: maak de publicatie aan (als deze nog niet bestaat)
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

-- Stap 2: voeg tabellen toe aan realtime publicatie
alter publication supabase_realtime add table public.positions;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.signals;
alter publication supabase_realtime add table public.news_items;
