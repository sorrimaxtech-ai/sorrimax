-- 0010 · Provider de WhatsApp (uazapi + evolution) por instância
do $$ begin
  create type public.wa_provider as enum ('uazapi','evolution','meta');
exception when duplicate_object then null; end $$;

alter table public.whatsapp_instances
  add column if not exists provider  public.wa_provider not null default 'uazapi',
  add column if not exists api_url    text,   -- ex: https://grupodiamond.uazapi.com
  add column if not exists api_token  text;   -- token da instância (uazapi) / apikey (evolution)

-- token de envio: uazapi usa api_token; evolution usa apikey. Unifica leitura.
comment on column public.whatsapp_instances.api_token is 'uazapi: instance token; evolution: instance apikey';
