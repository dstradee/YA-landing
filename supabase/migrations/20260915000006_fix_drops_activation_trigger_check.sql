-- ==============================================================================
-- YA - MIGRACIÓN: CORRECCIÓN DE CONSTRAINT EN DROPS (activation_trigger)
-- Archivo: supabase/migrations/20260915000006_fix_drops_activation_trigger_check.sql
-- ==============================================================================
-- Corrige el error 23514: new row for relation "drops" violates check constraint "drops_activation_trigger_check"
-- Permite como mínimo 'after_payment' y 'after_delivery', preservando todos los valores existentes:
-- 'after_payment', 'after_delivery', 'after_buy', 'manual', 'code', 'free'

-- 1. Eliminar el constraint restrictivo anterior si existe
ALTER TABLE public.drops 
    DROP CONSTRAINT IF EXISTS drops_activation_trigger_check;

-- 2. Añadir el constraint actualizado con los valores válidos completos
ALTER TABLE public.drops 
    ADD CONSTRAINT drops_activation_trigger_check 
    CHECK (activation_trigger IN ('after_payment', 'after_delivery', 'after_buy', 'manual', 'code', 'free'));

-- 3. Actualizar el valor por defecto de la columna activation_trigger
ALTER TABLE public.drops 
    ALTER COLUMN activation_trigger SET DEFAULT 'after_payment';

-- 4. Asegurar que DROP 001 — JACKPOT tenga activation_trigger = 'after_payment'
UPDATE public.drops 
SET activation_trigger = 'after_payment',
    updated_at = timezone('utc'::text, now())
WHERE drop_number = 1 OR title ILIKE '%DROP 001%';
