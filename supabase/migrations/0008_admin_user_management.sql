-- A denormalized mirror of "is this account banned in auth.users" so the
-- admin user list can show status without an extra Admin API call per row.
-- The real enforcement is Supabase's own ban_duration (set via the Admin
-- API in app/api/admin/users/[id]/freeze) — GoTrue itself refuses logins
-- for a banned user, this column is display-only.
alter table users add column if not exists is_frozen boolean not null default false;
