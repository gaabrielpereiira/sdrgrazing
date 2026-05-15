import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { 
  UIConversation, 
  UIMessage,
  DBMessage,
  DBConversation,
  transformDBToUIMessage,
  transformDBToUIConversation,
  formatRelativeTime,
  MessageDirection,
  MessageType
} from '@/types';
import { toast } from 'sonner';

export function useConversations(options?: { active?: boolean; queue?: 'sales' | 'support' | 'all' }) {
  const isActiveFilter = options?.active ?? true;
  const queueFilter = options?.queue ?? 'all';
  const [conversations, setConversations] = useState<UIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  
  // Polling fallback when Realtime fails
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Track processed message IDs to prevent duplicates across re-renders
  const processedMessageIds = useRef(new Set<string>());
  
  // Track conversation IDs being fetched to prevent duplicate fetches
  const fetchingConversationIds = useRef(new Set<string>());

  // Diagnostic wrapper: detect when a conversation loses messages or disappears
  const setConversationsTracked = useCallback(
    (updater: UIConversation[] | ((prev: UIConversation[]) => UIConversation[])) => {
      setConversations(prev => {
        const next = typeof updater === 'function'
          ? (updater as (p: UIConversation[]) => UIConversation[])(prev)
          : updater;
        try {
          for (const nc of next) {
            const old = prev.find(p => p.id === nc.id);
            if (old && nc.messages.length < old.messages.length) {
              console.error(
                '[Debug] ⚠️ Mensagens diminuíram em',
                nc.id,
                `(${old.messages.length} → ${nc.messages.length})`,
                'contato:', (nc as any).contact?.name || (nc as any).contactName,
                'stack:', new Error().stack
              );
            }
          }
          for (const p of prev) {
            if (!next.some(n => n.id === p.id)) {
              console.warn(
                '[Debug] ⚠️ Conversa removida do estado:',
                p.id,
                'contato:', (p as any).contact?.name || (p as any).contactName
              );
            }
          }
        } catch (e) {
          // never let debug code break state
        }
        return next;
      });
    },
    []
  );

  // Fetch a single conversation and add it to state
  const fetchAndAddConversation = useCallback(async (conversationId: string) => {
    // Prevent duplicate fetches
    if (fetchingConversationIds.current.has(conversationId)) {
      console.log('[Realtime] Already fetching conversation:', conversationId);
      return;
    }
    
    fetchingConversationIds.current.add(conversationId);
    console.log('[Realtime] 🔍 Fetching new conversation:', conversationId);
    
    try {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`*, contact:contacts(*)`)
        .eq('id', conversationId)
        .maybeSingle();
      
      if (convError || !convData) {
        console.error('[Realtime] Error fetching conversation:', convError);
        return;
      }

      // Skip if conversation doesn't match the active queue filter
      if (queueFilter !== 'all' && (convData as any).queue !== queueFilter) {
        console.log('[Realtime] Conversation queue mismatch, skipping:', (convData as any).queue);
        return;
      }
      
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .limit(300);
      
      if (msgError) {
        console.error('[Realtime] Error fetching messages:', msgError);
      }
      
      const uiConversation = transformDBToUIConversation(
        convData as unknown as DBConversation,
        (messages || []) as DBMessage[]
      );
      
      // Add new conversation to state (at top, sorted by recency)
      setConversationsTracked(prev => {
        // Check if already added by another event
        if (prev.some(c => c.id === uiConversation.id)) {
          console.log('[Realtime] Conversation already in state, skipping add');
          return prev;
        }
        console.log('[Realtime] ✅ Adding new conversation to state:', uiConversation.id);
        return [uiConversation, ...prev];
      });
      
      // Mark messages as processed
      (messages || []).forEach(m => processedMessageIds.current.add(m.id));
      
    } catch (err) {
      console.error('[Realtime] Error in fetchAndAddConversation:', err);
    } finally {
      fetchingConversationIds.current.delete(conversationId);
    }
  }, [queueFilter]);

  // Initial fetch
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchConversations({ active: isActiveFilter, queue: queueFilter });

      setConversationsTracked(prev => {
        const prevById = new Map(prev.map(c => [c.id, c]));
        const merged = data.map(fresh => {
          const old = prevById.get(fresh.id);
          if (!old) return fresh;
          const byId = new Map<string, typeof fresh.messages[number]>();
          for (const m of fresh.messages) byId.set(m.id, m);
          for (const m of old.messages) {
            if (m.id.startsWith('temp-') || !byId.has(m.id)) byId.set(m.id, m);
            else byId.set(m.id, m);
          }
          const union = Array.from(byId.values()).sort((a, b) => {
            const ta = new Date(a.timestamp || 0).getTime();
            const tb = new Date(b.timestamp || 0).getTime();
            return ta - tb;
          });
          return { ...fresh, messages: union };
        });
        const freshIds = new Set(data.map(c => c.id));
        const orphans = prev.filter(c =>
          !freshIds.has(c.id) &&
          c.isActive === isActiveFilter &&
          (queueFilter === 'all' || (c as any).queue === queueFilter)
        );
        processedMessageIds.current.clear();
        for (const c of merged) for (const m of c.messages) processedMessageIds.current.add(m.id);
        for (const c of orphans) for (const m of c.messages) processedMessageIds.current.add(m.id);
        return [...merged, ...orphans];
      });
    } catch (err) {
      console.error('[useConversations] Error fetching:', err);
      setError('Erro ao carregar conversas');
      toast.error('Erro ao carregar conversas');
    } finally {
      setLoading(false);
    }
  }, [isActiveFilter, queueFilter]);

  // Polling helpers
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    console.log('[Realtime] 🔄 Starting polling fallback (10s interval)');
    setRealtimeConnected(false);
    pollingIntervalRef.current = setInterval(() => {
      console.log('[Realtime] 📡 Polling: fetching conversations...');
      fetchConversations();
    }, 10000);
  }, [fetchConversations]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('[Realtime] ✅ Stopping polling fallback (Realtime reconnected)');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setRealtimeConnected(true);
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    fetchConversations();

    console.log('[Realtime] Setting up real-time subscriptions...');

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('[Realtime] 📩 New message received:', payload.new);
          const newMessage = payload.new as DBMessage;
          
          // Early duplicate check using processed IDs set
          if (processedMessageIds.current.has(newMessage.id)) {
            console.log('[Realtime] Message already processed (by ID), skipping:', newMessage.id);
            return;
          }
          
          setConversationsTracked(prev => {
            // Check if conversation exists in our state
            const conversationExists = prev.some(c => c.id === newMessage.conversation_id);
            
            if (!conversationExists) {
              // Message from a new conversation - fetch it asynchronously
              console.log('[Realtime] Message from unknown conversation, fetching async...');
              fetchAndAddConversation(newMessage.conversation_id);
              return prev; // Return prev, async fetch will update state
            }

            return prev.map(conv => {
              if (conv.id === newMessage.conversation_id) {
                const uiMessage = transformDBToUIMessage(newMessage);
                
                // Check if message already exists by ID
                const existsById = conv.messages.some(m => m.id === uiMessage.id);
                if (existsById) {
                  console.log('[Realtime] Message already exists by ID in conversation, skipping');
                  return conv;
                }

                // Check if message already exists by whatsapp_message_id (for deduplication)
                if (newMessage.whatsapp_message_id) {
                  const existsByWAId = conv.messages.some(m => 
                    m.whatsappMessageId === newMessage.whatsapp_message_id
                  );
                  if (existsByWAId) {
                    console.log('[Realtime] Message already exists by whatsapp_message_id, skipping');
                    return conv;
                  }
                }

                // Check for temp message with same content and fromType (optimistic update)
                const tempMessageIndex = conv.messages.findIndex(m => 
                  m.id.startsWith('temp-') && 
                  m.content === uiMessage.content &&
                  m.fromType === uiMessage.fromType
                );
                
                if (tempMessageIndex !== -1) {
                  // Replace temp message with real one from database
                  console.log('[Realtime] Replacing temp message with real message');
                  const updatedMessages = [...conv.messages];
                  updatedMessages[tempMessageIndex] = uiMessage;
                  
                  // Track the new real ID
                  processedMessageIds.current.add(uiMessage.id);
                  
                  return {
                    ...conv,
                    messages: updatedMessages,
                    lastMessage: newMessage.content || '',
                    lastMessageTime: formatRelativeTime(newMessage.sent_at),
                    lastMessageAt: newMessage.sent_at
                  };
                }

                // Normal flow for truly new messages (from contacts, Nina, etc)
                console.log('[Realtime] Adding new message:', uiMessage.id);
                
                // Track this message as processed
                processedMessageIds.current.add(uiMessage.id);
                
                return {
                  ...conv,
                  messages: [...conv.messages, uiMessage],
                  lastMessage: newMessage.content || '',
                  lastMessageTime: formatRelativeTime(newMessage.sent_at),
                  lastMessageAt: newMessage.sent_at,
                  // Increment unread if it's from user
                  unreadCount: newMessage.from_type === 'user' 
                    ? conv.unreadCount + 1 
                    : conv.unreadCount
                };
              }
              return conv;
            });
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('[Realtime] Message updated:', payload.new);
          const updatedMessage = payload.new as DBMessage;
          
          setConversationsTracked(prev => {
            return prev.map(conv => {
              if (conv.id === updatedMessage.conversation_id) {
                return {
                  ...conv,
                  messages: conv.messages.map(msg => {
                    if (msg.id === updatedMessage.id) {
                      return transformDBToUIMessage(updatedMessage);
                    }
                    return msg;
                  })
                };
              }
              return conv;
            });
          });
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Messages channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Successfully connected to messages channel');
          stopPolling();
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Error connecting to messages channel:', err);
          startPolling();
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] ⚠️ Connection timed out, starting polling fallback...');
          startPolling();
        }
      });

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          console.log('[Realtime] 🆕 New conversation INSERT detected:', payload.new);
          const newConv = payload.new as any;
          
          // Check if already in state
          setConversationsTracked(prev => {
            if (prev.some(c => c.id === newConv.id)) {
              console.log('[Realtime] Conversation already in state from INSERT');
              return prev;
            }
            // Not in state - fetch it
            fetchAndAddConversation(newConv.id);
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          console.log('[Realtime] Conversation UPDATE:', payload.new);
          const updated = payload.new as any;
          
          // Always update fields in place — never remove from state on is_active flip,
          // otherwise the user perceives "the conversation lost its history" when another
          // operator/edge-fn finalizes (or reopens) the chat they're viewing.
          setConversationsTracked(prev => {
            const exists = prev.some(c => c.id === updated.id);
            const matchesQueue = queueFilter === 'all' || updated.queue === queueFilter;
            if (!exists) {
              if (updated.is_active === isActiveFilter && matchesQueue) {
                console.log('[Realtime] Conversation entered current filter — fetching:', updated.id);
                fetchAndAddConversation(updated.id);
              }
              return prev;
            }
            // If the conversation moved out of the queue this view tracks, remove it
            if (!matchesQueue) {
              console.log('[Realtime] Conversation left queue, removing from view:', updated.id);
              return prev.filter(c => c.id !== updated.id);
            }
            return prev.map(conv => {
              if (conv.id === updated.id) {
                return {
                  ...conv,
                  status: updated.status,
                  isActive: updated.is_active,
                  assignedTeam: updated.assigned_team,
                  queue: updated.queue,
                } as any;
              }
              return conv;
            });
          });
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Conversations channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Successfully connected to conversations channel');
          stopPolling();
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] ❌ Error connecting to conversations channel:', err);
          startPolling();
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] ⚠️ Conversations channel timed out, starting polling fallback...');
          startPolling();
        }
      });

    // Cleanup
    return () => {
      console.log('[Realtime] Cleaning up subscriptions');
      stopPolling();
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [fetchConversations, fetchAndAddConversation, startPolling, stopPolling]);

  // Send message
  const sendMessage = useCallback(async (conversationId: string, content: string, opts?: { replyToId?: string | null }) => {
    if (!content.trim()) return;

    // Optimistic update with temporary ID
    const tempId = `temp-${Date.now()}`;
    const tempMessage: UIMessage = {
      id: tempId,
      content,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: MessageDirection.OUTGOING,
      type: MessageType.TEXT,
      status: 'sent',
      fromType: 'human',
      mediaUrl: null,
      whatsappMessageId: null,
      replyToId: opts?.replyToId || null,
      sentAt: new Date().toISOString()
    };

    setConversationsTracked(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: [...conv.messages, tempMessage],
            lastMessage: content,
            lastMessageTime: formatRelativeTime(new Date().toISOString()),
            lastMessageAt: new Date().toISOString()
          };
        }
        return conv;
      });
    });

    try {
      // The realtime handler will detect and replace the temp message automatically
      await api.sendMessage(conversationId, content, { replyToId: opts?.replyToId || null });
    } catch (err) {
      console.error('[useConversations] Error sending message:', err);
      toast.error('Erro ao enviar mensagem');
      
      // Remove optimistic message on error
      setConversationsTracked(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return {
              ...conv,
              messages: conv.messages.filter(m => m.id !== tempId)
            };
          }
          return conv;
        });
      });
    }
  }, []);

  // Send a media message (image, audio, document)
  const sendMediaMessage = useCallback(async (
    conversationId: string,
    file: File,
    opts: { mediaType: 'image' | 'audio' | 'document'; caption?: string; replyToId?: string | null }
  ) => {
    const tempId = `temp-${Date.now()}`;
    const objectUrl = URL.createObjectURL(file);
    const uiType =
      opts.mediaType === 'image' ? MessageType.IMAGE :
      opts.mediaType === 'audio' ? MessageType.AUDIO :
      MessageType.DOCUMENT;

    const tempMessage: UIMessage = {
      id: tempId,
      content: opts.caption?.trim() || file.name,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: MessageDirection.OUTGOING,
      type: uiType,
      status: 'sent',
      fromType: 'human',
      mediaUrl: objectUrl,
      whatsappMessageId: null,
      replyToId: opts.replyToId || null,
      sentAt: new Date().toISOString(),
    };

    setConversationsTracked(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        return {
          ...conv,
          messages: [...conv.messages, tempMessage],
          lastMessage: opts.mediaType === 'image' ? '📷 Imagem' : opts.mediaType === 'audio' ? '🎵 Áudio' : '📄 Documento',
          lastMessageTime: formatRelativeTime(new Date().toISOString()),
          lastMessageAt: new Date().toISOString(),
        };
      }
      return conv;
    }));

    try {
      await api.sendMediaMessage(conversationId, file, opts);
    } catch (err: any) {
      console.error('[useConversations] Error sending media:', err);
      toast.error(err?.message || 'Erro ao enviar arquivo');
      setConversationsTracked(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, messages: conv.messages.filter(m => m.id !== tempId) };
        }
        return conv;
      }));
    }
  }, []);

  // Update conversation status
  const updateStatus = useCallback(async (
    conversationId: string, 
    status: 'nina' | 'human' | 'paused'
  ) => {
    try {
      await api.updateConversationStatus(conversationId, status);
      
      setConversationsTracked(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return { ...conv, status };
          }
          return conv;
        });
      });

      const statusLabels = {
        nina: 'IA ativada',
        human: 'Atendimento humano ativado',
        paused: 'Conversa pausada'
      };
      toast.success(statusLabels[status]);
    } catch (err) {
      console.error('[useConversations] Error updating status:', err);
      toast.error('Erro ao atualizar status');
    }
  }, []);

  // Mark messages as read
  const markAsRead = useCallback(async (conversationId: string) => {
    // Optimistic UI update
    setConversationsTracked(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unreadCount: 0 };
        }
        return conv;
      });
    });

    // Persist to database
    try {
      await api.markMessagesAsRead(conversationId);
      console.log('[useConversations] Messages marked as read in database');
    } catch (err) {
      console.error('[useConversations] Error marking messages as read:', err);
      // Don't revert UI on error (better UX)
    }
  }, []);

  // Assign conversation (and sync with deal)
  const assignConversation = useCallback(async (conversationId: string, userId: string | null) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return;

    // Optimistic UI update
    setConversationsTracked(prev => {
      return prev.map(c => {
        if (c.id === conversationId) {
          return { ...c, assignedUserId: userId };
        }
        return c;
      });
    });

    // Persist to database
    try {
      await api.assignConversation(conversationId, userId, conv.contactId);
      console.log('[useConversations] Conversation and deal assigned');
    } catch (err) {
      console.error('[useConversations] Error assigning conversation:', err);
      // Revert on error
      setConversationsTracked(prev => {
        return prev.map(c => {
          if (c.id === conversationId) {
            return { ...c, assignedUserId: conv.assignedUserId };
          }
          return c;
        });
      });
    }
  }, [conversations]);

  // Finalize a conversation (close)
  const endConversation = useCallback(async (
    conversationId: string,
    options?: { sendClosingMessage?: boolean },
  ) => {
    // Optimistic: remove from current view
    setConversationsTracked(prev => prev.filter(c => c.id !== conversationId));
    try {
      await api.endConversation(conversationId, options);
      toast.success('Conversa finalizada');
    } catch (err) {
      console.error('[useConversations] Error ending conversation:', err);
      toast.error('Erro ao finalizar conversa');
      fetchConversations();
    }
  }, [fetchConversations]);

  // Reopen a finalized conversation
  const reopenConversation = useCallback(async (conversationId: string) => {
    setConversationsTracked(prev => prev.filter(c => c.id !== conversationId));
    try {
      await api.reopenConversation(conversationId);
      toast.success('Conversa reaberta');
    } catch (err) {
      console.error('[useConversations] Error reopening conversation:', err);
      toast.error('Erro ao reabrir conversa');
      fetchConversations();
    }
  }, [fetchConversations]);

  // Send a WhatsApp template message
  const sendTemplateMessage = useCallback(async (
    conversationId: string,
    payload: {
      template: { id: string; name: string; language: string; category: string; components: any[] };
      variables: Record<string, string>;
      interpolatedBody: string;
    }
  ) => {
    const tempId = `temp-${Date.now()}`;
    const tempMessage: UIMessage = {
      id: tempId,
      content: payload.interpolatedBody,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: MessageDirection.OUTGOING,
      type: MessageType.TEXT,
      status: 'sent',
      fromType: 'human',
      mediaUrl: null,
      whatsappMessageId: null,
      replyToId: null,
      sentAt: new Date().toISOString(),
    };

    setConversationsTracked(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        return {
          ...conv,
          messages: [...conv.messages, tempMessage],
          lastMessage: payload.interpolatedBody,
          lastMessageTime: formatRelativeTime(new Date().toISOString()),
          lastMessageAt: new Date().toISOString(),
        };
      }
      return conv;
    }));

    try {
      await api.sendTemplateMessage(conversationId, payload);
      toast.success('Template enviado');
    } catch (err: any) {
      console.error('[useConversations] Error sending template:', err);
      toast.error(err?.message || 'Erro ao enviar template');
      setConversationsTracked(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, messages: conv.messages.filter(m => m.id !== tempId) };
        }
        return conv;
      }));
      throw err;
    }
  }, []);

  // Force-reload the messages of a single conversation from the server.
  // Used when the user opens a chat, so the panel always reflects DB truth
  // even if the in-memory list was mutated by realtime/polling.
  const reloadConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .limit(500);
      if (msgError) {
        console.error('[reloadConversationMessages] error:', msgError);
        return;
      }
      const ascending = (messages || []).slice().reverse() as DBMessage[];
      const uiMsgs = ascending.map(transformDBToUIMessage);
      setConversationsTracked(prev => prev.map(conv => {
        if (conv.id !== conversationId) return conv;
        // Preserve any optimistic temp messages not yet persisted
        const tempOnly = conv.messages.filter(m => m.id.startsWith('temp-'));
        const merged = [...uiMsgs, ...tempOnly].sort((a, b) =>
          new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
        );
        for (const m of uiMsgs) processedMessageIds.current.add(m.id);
        return { ...conv, messages: merged };
      }));
    } catch (err) {
      console.error('[reloadConversationMessages] unexpected:', err);
    }
  }, []);

  return {
    conversations,
    loading,
    error,
    realtimeConnected,
    sendMessage,
    sendMediaMessage,
    sendTemplateMessage,
    updateStatus,
    markAsRead,
    assignConversation,
    endConversation,
    reopenConversation,
    reloadConversationMessages,
    refetch: fetchConversations
  };
}
