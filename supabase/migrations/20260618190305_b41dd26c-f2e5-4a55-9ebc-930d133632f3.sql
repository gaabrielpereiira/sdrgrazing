ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_processed_status text;
UPDATE public.orders SET last_processed_status = status WHERE last_processed_status IS NULL;