-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN: ELIMINACIÓN DE SOBRECARGAS OBSOLETAS DE CREATE_ORDER
-- Archivo: supabase/migrations/20260917000005_drop_obsolete_create_order_overloads.sql
-- ==============================================================================

-- 1. Eliminar la función obsoleta heredada (4 argumentos con TEXT)
DROP FUNCTION IF EXISTS public.create_order(uuid, jsonb, text, text);

-- 2. Eliminar la sobrecarga redundante (4 argumentos con enum)
DROP FUNCTION IF EXISTS public.create_order(uuid, jsonb, text, public.payment_method_type);

-- 3. Notificar a PostgREST para que recargue el esquema y reconozca únicamente la función canónica
NOTIFY pgrst, 'reload schema';
