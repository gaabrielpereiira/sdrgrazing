CREATE UNIQUE INDEX IF NOT EXISTS nina_processing_queue_message_id_unique
  ON public.nina_processing_queue(message_id)
  WHERE status IN ('pending','processing','completed');