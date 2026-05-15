ALTER TABLE public.send_queue DROP CONSTRAINT IF EXISTS send_queue_message_id_fkey;
ALTER TABLE public.send_queue ADD CONSTRAINT send_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_reply_to_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.message_grouping_queue DROP CONSTRAINT IF EXISTS message_grouping_queue_message_id_fkey;
ALTER TABLE public.message_grouping_queue ADD CONSTRAINT message_grouping_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;