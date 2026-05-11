
-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sdr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';
