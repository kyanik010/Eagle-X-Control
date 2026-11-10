alter table public.device_registry add column if not exists device_name text;
alter table public.device_registry add column if not exists platform text not null default 'android';
alter table public.device_registry add column if not exists manufacturer text;
alter table public.device_registry add column if not exists model text;
alter table public.device_registry add column if not exists os_version text;
alter table public.device_registry add column if not exists app_version text;
alter table public.device_registry add constraint device_registry_platform_check check (platform in ('android','android_tv','other'));
