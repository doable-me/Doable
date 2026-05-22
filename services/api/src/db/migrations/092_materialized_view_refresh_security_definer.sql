-- 092_materialized_view_refresh_security_definer.sql
-- Make the marketplace + discover MV refresh helpers SECURITY DEFINER so the
-- runtime API (connecting as the non-superuser `doable_app` role created by
-- deployment/docker/02-roles.sh) can still trigger the periodic 5-minute
-- refresh.
--
-- Without this, the API runtime calls refresh_marketplace_featured() /
-- refresh_discover_featured() as the INVOKER role (doable_app) — but the
-- materialized views are owned by `doable`, and REFRESH MATERIALIZED VIEW
-- requires ownership. The runtime caller in packages/db/src/queries/
-- marketplace-featured.ts:50,54 would fail every 5 minutes and the featured
-- rails would stop updating after the first cycle.
--
-- SECURITY DEFINER pins execution to the function owner (the `doable`
-- migrate role), restoring REFRESH ownership while keeping the runtime
-- DB user constrained for everything else.
--
-- Also explicitly GRANTs EXECUTE to doable_app so the runtime can call them.

CREATE OR REPLACE FUNCTION public.refresh_discover_featured()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_discover_featured;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW mv_discover_featured;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_marketplace_featured()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_marketplace_featured;
EXCEPTION WHEN OTHERS THEN
  -- First refresh can't be CONCURRENTLY; fall back to plain refresh.
  REFRESH MATERIALIZED VIEW mv_marketplace_featured;
END;
$function$;

-- Explicit EXECUTE grant for doable_app. ALTER DEFAULT PRIVILEGES from
-- 02-roles.sh only covers functions created AFTER the role exists; these
-- two functions get CREATE OR REPLACE'd above as the migrate role, so the
-- grant has to be reasserted here. The IF EXISTS guard handles the Docker
-- vs bare-metal split — bare-metal installs don't run 02-roles.sh and
-- thus have no doable_app role to grant to.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'doable_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_discover_featured()    TO doable_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_marketplace_featured() TO doable_app';
  END IF;
END$$;
