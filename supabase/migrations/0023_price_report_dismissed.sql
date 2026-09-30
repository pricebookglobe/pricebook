-- Lets a merchant dismiss a price-accuracy report from their Notifications
-- feed without deleting the underlying report — the report itself still
-- has to count toward the Registered Items report badge and the Overview
-- "price reports" summary, which both read price_reports directly.
alter table price_reports add column if not exists dismissed_at timestamptz;
