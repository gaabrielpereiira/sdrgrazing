import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PlatformNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  contact_id: string | null;
  metadata: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const realtimeConnectedRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Notifications] Fetch error:', error);
      setLoading(false);
      return;
    }
    const list = (data || []) as PlatformNotification[];
    list.forEach((n) => seenIdsRef.current.add(n.id));
    const unread = list.filter((n) => !n.is_read).length;
    console.info(`[Notifications] fetched ${list.length}, unread ${unread}`);
    setNotifications(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Unique channel name to avoid collisions across mounts
    const channelName = `notifications-feed-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = payload.new as PlatformNotification;
          if (seenIdsRef.current.has(n.id)) return;
          seenIdsRef.current.add(n.id);
          console.info('[Notifications] 🔔 INSERT:', n.title);
          setNotifications((prev) => [n, ...prev].slice(0, 50));
          toast(n.title, { description: n.body || undefined });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = payload.new as PlatformNotification;
          setNotifications((prev) => prev.map((x) => (x.id === n.id ? n : x)));
        }
      )
      .subscribe((status) => {
        console.info('[Notifications] channel status:', status);
        const connected = status === 'SUBSCRIBED';
        realtimeConnectedRef.current = connected;
        setRealtimeConnected(connected);
      });

    // Polling fallback every 30s, but only while realtime isn't connected
    const pollInterval = setInterval(() => {
      if (!realtimeConnectedRef.current) fetchNotifications();
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    loading,
    unreadCount,
    realtimeConnected,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
