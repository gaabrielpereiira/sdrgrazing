# Architecture rules

- Chat counters (unread per queue, tab totals) are computed in the database via `get_queue_unread_counts` / `get_conversation_tab_counts` RPCs with debounced realtime refresh — pulling full tables to the client per event overloaded the database.
- RLS policies use `(select auth.role())` instead of `auth.role()` so the check runs once per query, not per row.
