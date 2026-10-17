-- Tokens now have a purpose: 'ingest' (health data API) or 'mcp' (the chat-app connector). A token only works for its own purpose.
alter table public.api_tokens
  add column kind text not null default 'ingest' check (kind in ('ingest', 'mcp'));
