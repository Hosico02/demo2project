create table if not exists public.productization_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'uploaded' check (status in ('uploaded', 'queued', 'running', 'completed', 'failed')),
  source_bucket text not null default 'demo-archives',
  source_path text not null,
  output_bucket text not null default 'product-artifacts',
  output_path text,
  return_format text not null default 'zip' check (return_format = 'zip'),
  report jsonb not null default '{}'::jsonb
);

alter table public.productization_jobs enable row level security;

create policy "productization jobs are readable by authenticated users"
  on public.productization_jobs
  for select
  to authenticated
  using (true);

create policy "productization jobs are insertable by authenticated users"
  on public.productization_jobs
  for insert
  to authenticated
  with check (return_format = 'zip');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'demo-archives',
    'demo-archives',
    false,
    536870912,
    array[
      'application/zip',
      'application/x-zip-compressed',
      'application/x-7z-compressed',
      'application/vnd.rar',
      'application/x-rar-compressed',
      'application/gzip',
      'application/x-tar'
    ]
  ),
  (
    'product-artifacts',
    'product-artifacts',
    false,
    536870912,
    array['application/zip', 'application/x-zip-compressed']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
