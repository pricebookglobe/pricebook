-- Lets a merchant's own POS/inventory system call the bulk-inventory API
-- directly and automatically, authenticated with a long-lived key rather
-- than a browser login session (which an external system can't practically
-- obtain). One key per store; regenerating invalidates the old one.
alter table stores add column if not exists api_key text unique;

-- Backfill existing stores with a key so this works immediately without
-- needing every merchant to visit Settings first.
update stores set api_key = encode(gen_random_bytes(24), 'hex') where api_key is null;
