create table if not exists public.subscription_plans (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
 name text not null check (char_length(btrim(name)) between 2 and 80),
 duration_days integer not null check (duration_days between 1 and 3650),
 price_minor_units integer check (price_minor_units is null or price_minor_units >= 0),
 currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
 id uuid primary key default gen_random_uuid(),
 device_id text not null references public.device_registry(device_id) on delete cascade,
 plan_id uuid references public.subscription_plans(id) on delete set null,
 status text not null default 'active' check (status in ('active','expired','cancelled','revoked')),
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.servers (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 1 and 120),
 server_url text not null check (server_url ~ '^https?://'),
 region text,
 priority integer not null default 100,
 is_active boolean not null default true,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.device_server_assignments (
 id uuid primary key default gen_random_uuid(),
 device_id text not null references public.device_registry(device_id) on delete cascade,
 server_id uuid not null references public.servers(id) on delete cascade,
 assigned_at timestamptz not null default now(),
 assigned_by uuid references auth.users(id) on delete set null,
 unique(device_id,server_id)
);
create table if not exists public.app_themes (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 80),
 palette jsonb not null default '{}'::jsonb,
 is_active boolean not null default true,
 is_default boolean not null default false,
 sort_order integer not null default 100,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists app_themes_single_default_idx on public.app_themes (is_default) where is_default = true;
create table if not exists public.device_theme_preferences (
 device_id text primary key references public.device_registry(device_id) on delete cascade,
 theme_id uuid not null references public.app_themes(id) on delete restrict,
 updated_at timestamptz not null default now()
);
create table if not exists public.app_messages (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 1 and 160),
 body text not null check (char_length(btrim(body)) between 1 and 5000),
 message_type text not null default 'info' check (message_type in ('info','update','warning','success')),
 target_type text not null default 'all' check (target_type in ('all','device')),
 target_device_id text references public.device_registry(device_id) on delete cascade,
 is_published boolean not null default false,
 publish_at timestamptz not null default now(),
 expires_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 check ((target_type='all' and target_device_id is null) or (target_type='device' and target_device_id is not null))
);
create table if not exists public.device_message_receipts (
 id bigserial primary key,
 message_id uuid not null references public.app_messages(id) on delete cascade,
 device_id text not null references public.device_registry(device_id) on delete cascade,
 delivered_at timestamptz not null default now(),
 acknowledged_at timestamptz,
 unique(message_id,device_id)
);
create table if not exists public.audit_logs (
 id bigserial primary key,
 actor_user_id uuid references auth.users(id) on delete set null,
 action text not null,
 entity_type text not null,
 entity_id text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists subscriptions_device_created_idx on public.subscriptions(device_id,created_at desc);
create index if not exists device_server_assignments_device_idx on public.device_server_assignments(device_id);
create index if not exists app_messages_publish_idx on public.app_messages(is_published,publish_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists servers_priority_idx on public.servers(priority);
insert into public.subscription_plans(code,name,duration_days,currency_code)
values ('monthly','اشتراك شهر',30,'USD'),('quarterly','اشتراك 3 أشهر',90,'USD'),('semiannual','اشتراك 6 أشهر',180,'USD'),('annual','اشتراك سنة',365,'USD')
on conflict (code) do nothing;
insert into public.app_themes(name,palette,is_active,is_default,sort_order)
select 'EAGLE X Royal Navy', jsonb_build_object('accent','#D5A64B','background','#0B1118','backgroundTop','#111D2B','backgroundBottom','#1A2A3A','panel','#172331','surface','#202E3D','card','#172638','selected','#2A3B4E','border','#53677E','focus','#8FB8E8','text','#F7F9FC','textSecondary','#C2CBD4','muted','#8998A9','danger','#E05252','success','#35B779','waveOne','#397D82','waveTwo','#B8894A','atmosphere','royal-navy'),true,true,1
where not exists(select 1 from public.app_themes);
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.servers enable row level security;
alter table public.device_server_assignments enable row level security;
alter table public.app_themes enable row level security;
alter table public.device_theme_preferences enable row level security;
alter table public.app_messages enable row level security;
alter table public.device_message_receipts enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.subscription_plans,public.subscriptions,public.servers,public.device_server_assignments,public.app_themes,public.device_theme_preferences,public.app_messages,public.device_message_receipts,public.audit_logs from anon,authenticated;
