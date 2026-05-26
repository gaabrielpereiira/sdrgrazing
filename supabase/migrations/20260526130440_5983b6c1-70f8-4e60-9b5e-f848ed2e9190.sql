
-- 1) Reconcile existing duplicates
WITH ranked AS (
  SELECT id, contact_id, last_message_at,
    ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY last_message_at DESC, created_at DESC) AS rn
  FROM public.conversations
  WHERE is_active = true
),
keepers AS (
  SELECT contact_id, id AS keep_id FROM ranked WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, k.keep_id
  FROM ranked r
  JOIN keepers k ON k.contact_id = r.contact_id
  WHERE r.rn > 1
)
UPDATE public.messages m
SET conversation_id = l.keep_id
FROM losers l
WHERE m.conversation_id = l.loser_id;

-- Mark duplicate (loser) conversations inactive
WITH ranked AS (
  SELECT id, contact_id,
    ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY last_message_at DESC, created_at DESC) AS rn
  FROM public.conversations
  WHERE is_active = true
)
UPDATE public.conversations c
SET is_active = false, status = 'paused', updated_at = now()
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 2) Unique partial index: only one active conversation per contact
CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_active_per_contact
  ON public.conversations(contact_id)
  WHERE is_active = true;
