-- 1. Siapa owner tabel & apakah RLS aktif
SELECT relname AS table_name, relowner::regrole AS owner, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class WHERE relname = 'retur_barang';

-- 2. Hak akses (grant) yang ada untuk role anon/authenticated/service_role
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'retur_barang'
ORDER BY grantee, privilege_type;

-- 3. Apakah ada RLS policy yang terpasang
SELECT policyname, roles, cmd, qual
FROM pg_policies WHERE tablename = 'retur_barang';
