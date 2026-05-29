-- ============================================================
-- Limpeza de conversas duplicadas criadas por bug de formato
-- de telefone (com/sem DDI 55).
--
-- O que este script faz:
--   1. Identifica grupos de conversas ativas que pertencem a
--      contatos com o mesmo sufixo de telefone (últimos 11 dígitos).
--   2. Dentro de cada grupo, escolhe a conversa mais ANTIGA como
--      a conversa legítima (original).
--   3. Reatribui todas as mensagens das conversas duplicadas para
--      a conversa original.
--   4. Desativa (is_active = false) as conversas duplicadas.
--
-- É seguro rodar múltiplas vezes (idempotente).
-- ============================================================

DO $$
DECLARE
  rec            RECORD;
  kept_conv_id   UUID;
  dup_conv_id    UUID;
  moved_count    INT;
  total_moved    INT := 0;
  total_closed   INT := 0;
BEGIN

  -- Para cada par de conversas ativas com o mesmo telefone (sufixo de 11 dígitos),
  -- escolhe a mais antiga como keeper e fecha as demais.
  FOR rec IN
    WITH phone_contacts AS (
      -- Normaliza o telefone para os últimos 11 dígitos
      SELECT
        id AS contact_id,
        RIGHT(REGEXP_REPLACE(COALESCE(phone_number, whatsapp_id, ''), '\D', '', 'g'), 11) AS phone_tail
      FROM contacts
      WHERE COALESCE(phone_number, whatsapp_id) IS NOT NULL
    ),
    active_convs AS (
      SELECT
        c.id AS conv_id,
        c.contact_id,
        c.created_at,
        pc.phone_tail
      FROM conversations c
      JOIN phone_contacts pc ON pc.contact_id = c.contact_id
      WHERE c.is_active = true
        AND pc.phone_tail != ''
        AND LENGTH(pc.phone_tail) >= 8
    ),
    grouped AS (
      SELECT
        phone_tail,
        -- Conversa mais antiga = keeper
        MIN(created_at)  AS oldest_created_at,
        COUNT(*)         AS conv_count,
        -- Lista ordenada: keeper primeiro, duplicatas depois
        ARRAY_AGG(conv_id ORDER BY created_at ASC) AS conv_ids
      FROM active_convs
      GROUP BY phone_tail
      HAVING COUNT(*) > 1
    )
    SELECT phone_tail, conv_ids, conv_count
    FROM grouped
  LOOP
    -- Primeira entrada do array é a conversa keeper (mais antiga)
    kept_conv_id := rec.conv_ids[1];

    RAISE NOTICE 'Telefone=%: % conversas ativas → keeper=%',
      rec.phone_tail, rec.conv_count, kept_conv_id;

    -- Para cada conversa duplicada (todas exceto a primeira)
    FOR i IN 2..array_length(rec.conv_ids, 1) LOOP
      dup_conv_id := rec.conv_ids[i];

      -- Move as mensagens da duplicata para a keeper
      UPDATE messages
        SET conversation_id = kept_conv_id
        WHERE conversation_id = dup_conv_id;

      GET DIAGNOSTICS moved_count = ROW_COUNT;
      total_moved := total_moved + moved_count;

      -- Fecha a conversa duplicada
      UPDATE conversations
        SET is_active = false,
            status    = 'paused'
        WHERE id = dup_conv_id;

      total_closed := total_closed + 1;

      RAISE NOTICE '  → fechou conversa duplicada=%  msgs movidas=%',
        dup_conv_id, moved_count;
    END LOOP;
  END LOOP;

  RAISE NOTICE '==============================';
  RAISE NOTICE 'Limpeza concluída:';
  RAISE NOTICE '  Conversas fechadas : %', total_closed;
  RAISE NOTICE '  Mensagens movidas  : %', total_moved;
  RAISE NOTICE '==============================';
END;
$$;
