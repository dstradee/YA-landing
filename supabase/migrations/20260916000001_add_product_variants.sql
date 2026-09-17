-- ==============================================================================
-- YA DELIVERY - MIGRACIÓN: VARIANTES Y SUBPRODUCTOS EN TABLA PRODUCTS
-- Archivo: supabase/migrations/20260916000001_add_product_variants.sql
-- ==============================================================================
-- 1. Añade la columna 'has_variants' a la tabla products (idempotente).
--    Default: false, NOT NULL.
-- 2. Añade las columnas complementarias 'variants_title' y 'variants' (JSONB).
-- 3. Notifica a PostgREST para recargar la caché de esquemas inmediatamente.
-- ==============================================================================

DO $$
BEGIN
    -- 1. Columna has_variants (NOT NULL DEFAULT false)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'has_variants'
    ) THEN
        ALTER TABLE public.products
        ADD COLUMN has_variants BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- 2. Columna variants_title (TEXT DEFAULT NULL)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'variants_title'
    ) THEN
        ALTER TABLE public.products
        ADD COLUMN variants_title TEXT DEFAULT NULL;
    END IF;

    -- 3. Columna variants (JSONB DEFAULT NULL)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'variants'
    ) THEN
        ALTER TABLE public.products
        ADD COLUMN variants JSONB DEFAULT NULL;
    END IF;
END $$;

-- Índice para consultas sobre productos con variantes
CREATE INDEX IF NOT EXISTS idx_products_has_variants ON public.products(has_variants);

-- Asegurar que ningún producto existente quede con NULL en has_variants
UPDATE public.products
SET has_variants = false
WHERE has_variants IS NULL;

-- Notificar a PostgREST para recargar la caché del esquema en Supabase de forma inmediata
NOTIFY pgrst, 'reload schema';
