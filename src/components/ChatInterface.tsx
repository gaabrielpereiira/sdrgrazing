import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, MoreVertical, Phone, Paperclip, Send, Check, CheckCheck, 
  Smile, Play, Loader2, MessageSquare, Info, X, Mail, 
  Tag, Bot, User, Pause, Brain, Plus, XCircle, RotateCcw, ImageIcon, Bell, AlertTriangle,
  FileText, Music, Reply, Pencil, Upload
} from 'lucide-react';
import { MessageDirection, MessageType, UIConversation, UIMessage, ConversationStatus, TagDefinition, formatRelativeTime } from '../types';
import { Button } from './Button';
import { useConversations } from '../hooks/useConversations';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { api } from '@/services/api';
import { TagSelector } from './TagSelector';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from './ui/alert-dialog';
import { ActivitiesPanel } from './chat/ActivitiesPanel';
import { useAllPendingActivities } from '@/hooks/useConversationActivities';
import EmojiPicker, { Theme, EmojiStyle, type EmojiClickData } from 'emoji-picker-react';

const ChatInterface: React.FC = () => {
  const [chatTab, setChatTab] = useState<'active' | 'finished'>('active');
  const { conversations, loading, sendMessage, sendMediaMessage, updateStatus, markAsRead, assignConversation, endConversation, reopenConversation } = useConversations({ active: chatTab === 'active' });
  const { sdrName, companyName } = useCompanySettings();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [showProfileInfo, setShowProfileInfo] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [notesValue, setNotesValue] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  // Tick a cada 60s para reformatar tempos relativos (Agora -> 1min -> Ontem...)
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Attachments
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; mediaType: 'image' | 'audio' | 'document'; previewUrl: string } | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Reply-to feature
  const [replyingTo, setReplyingTo] = useState<UIMessage | null>(null);

  // Drag-and-drop state
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  // Inline contact name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Audio player state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  
  const activeChat = conversations.find(c => c.id === selectedChatId);
  const pendingActivities = useAllPendingActivities();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const assignedMember = activeChat?.assignedUserId
    ? teamMembers.find(m => m.id === activeChat.assignedUserId)
    : null;
  
  // Format audio time helper
  const formatAudioTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load tag definitions and team members
  useEffect(() => {
    api.fetchTagDefinitions().then(setAvailableTags).catch(err => {
      console.error('Error loading tags:', err);
      toast.error('Erro ao carregar tags');
    });

    api.fetchTeam().then(setTeamMembers).catch(err => {
      console.error('Error loading team members:', err);
    });
  }, []);

  // Auto-select first conversation or from URL param
  useEffect(() => {
    // Check for conversation param in URL
    const urlParams = new URLSearchParams(window.location.search);
    const conversationParam = urlParams.get('conversation');
    
    if (conversationParam && conversations.some(c => c.id === conversationParam)) {
      setSelectedChatId(conversationParam);
    } else if (conversations.length > 0 && (!selectedChatId || !conversations.some(c => c.id === selectedChatId))) {
      setSelectedChatId(conversations[0].id);
    } else if (conversations.length === 0) {
      setSelectedChatId(null);
    }
  }, [conversations, selectedChatId]);

  // Reset selection when switching tabs
  useEffect(() => {
    setSelectedChatId(null);
  }, [chatTab]);

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedChatId && (activeChat?.unreadCount ?? 0) > 0) {
      markAsRead(selectedChatId);
    }
  }, [selectedChatId, activeChat?.unreadCount, markAsRead]);

  // Sync notes value with active chat
  useEffect(() => {
    if (activeChat) {
      setNotesValue(activeChat.notes || '');
    }
  }, [activeChat?.id]);

  // Handle notes save on blur
  const handleNotesBlur = async () => {
    if (!activeChat || notesValue === (activeChat.notes || '')) return;
    
    setIsSavingNotes(true);
    try {
      await api.updateContactNotes(activeChat.contactId, notesValue);
      toast.success('Notas salvas');
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Erro ao salvar notas');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeChat) {
      scrollToBottom();
    }
  }, [activeChat?.id, selectedChatId]); 

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages]);

  const handleToggleTag = async (tagKey: string) => {
    if (!activeChat) return;
    
    const currentTags = activeChat.tags || [];
    const newTags = currentTags.includes(tagKey)
      ? currentTags.filter(t => t !== tagKey)
      : [...currentTags, tagKey];
    
    try {
      await api.updateContactTags(activeChat.contactId, newTags);
      toast.success('Tag atualizada');
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error('Erro ao atualizar tag');
    }
  };

  const handleCreateTag = async (tag: { key: string; label: string; color: string; category: string }) => {
    try {
      const newTag = await api.createTagDefinition(tag);
      setAvailableTags(prev => [...prev, newTag]);
      toast.success('Tag criada com sucesso');
      
      // Adicionar a tag ao contato automaticamente
      if (activeChat) {
        await handleToggleTag(tag.key);
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Erro ao criar tag');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    const content = inputText.trim();
    const replyId = replyingTo?.id && !replyingTo.id.startsWith('temp-') ? replyingTo.id : null;
    setInputText('');
    setReplyingTo(null);
    
    await sendMessage(activeChat.id, content, { replyToId: replyId });
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    const input = messageInputRef.current;
    const emoji = emojiData.emoji;
    const start = input?.selectionStart ?? inputText.length;
    const end = input?.selectionEnd ?? inputText.length;
    const newText = inputText.slice(0, start) + emoji + inputText.slice(end);
    setInputText(newText);
    requestAnimationFrame(() => {
      input?.focus();
      const pos = start + emoji.length;
      input?.setSelectionRange(pos, pos);
    });
  };

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!activeChat) return;
    await updateStatus(activeChat.id, status);
  };

  const MAX_SIZE_BY_TYPE: Record<'image' | 'audio' | 'document', number> = {
    image: 5 * 1024 * 1024,       // 5 MB
    audio: 16 * 1024 * 1024,      // 16 MB
    document: 100 * 1024 * 1024,  // 100 MB
  };

  const handlePickAttachment = (mediaType: 'image' | 'audio' | 'document') => {
    setAttachMenuOpen(false);
    const ref =
      mediaType === 'image' ? imageInputRef :
      mediaType === 'audio' ? audioInputRef : documentInputRef;
    ref.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'audio' | 'document') => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting same file
    if (!file) return;

    const maxSize = MAX_SIZE_BY_TYPE[mediaType];
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Máximo ${(maxSize / 1024 / 1024).toFixed(0)} MB para ${mediaType}.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment({ file, mediaType, previewUrl });
    setAttachmentCaption('');
  };

  const cancelAttachment = () => {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    setAttachmentCaption('');
  };

  const handleSendAttachment = async () => {
    if (!pendingAttachment || !activeChat || isUploading) return;
    setIsUploading(true);
    const replyId = replyingTo?.id && !replyingTo.id.startsWith('temp-') ? replyingTo.id : null;
    try {
      await sendMediaMessage(activeChat.id, pendingAttachment.file, {
        mediaType: pendingAttachment.mediaType,
        caption: pendingAttachment.mediaType === 'image' ? attachmentCaption : undefined,
        replyToId: replyId,
      });
      setReplyingTo(null);
      cancelAttachment();
    } finally {
      setIsUploading(false);
    }
  };

  // Detect media type from File MIME
  const detectMediaType = (file: File): 'image' | 'audio' | 'document' => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  };

  // Accept any File and open the preview panel (used by drag/drop and paste)
  const acceptFile = (file: File) => {
    const mediaType = detectMediaType(file);
    const maxSize = MAX_SIZE_BY_TYPE[mediaType];
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Máximo ${(maxSize / 1024 / 1024).toFixed(0)} MB para ${mediaType}.`);
      return;
    }
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment({ file, mediaType, previewUrl });
    setAttachmentCaption('');
  };

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    if (chatTab === 'finished' || !activeChat) return;
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (chatTab === 'finished' || !activeChat) return;
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    if (chatTab === 'finished' || !activeChat) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptFile(file);
  };

  // Paste (Ctrl+V) handler — captures pasted images/files from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (chatTab === 'finished' || !activeChat) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          acceptFile(file);
          return;
        }
      }
    }
  };

  // Inline name editing
  const startEditName = () => {
    if (!activeChat) return;
    setNameDraft(activeChat.contactName);
    setIsEditingName(true);
  };
  const saveName = async () => {
    if (!activeChat) return;
    const newName = nameDraft.trim();
    if (!newName || newName === activeChat.contactName) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await api.updateContact(activeChat.contactId, { name: newName });
      toast.success('Nome atualizado');
      setIsEditingName(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao atualizar nome');
    } finally {
      setSavingName(false);
    }
  };

  // Scroll to a specific message (for reply-quote click)
  const scrollToMessage = (messageId: string) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-cyan-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400'), 1500);
    }
  };

  // A conversa está "pendente" quando:
  //  - a última mensagem foi enviada pelo cliente (ainda não respondemos), OU
  //  - a IA encaminhou para humano (status = 'human') e nenhum humano respondeu ainda.
  // A tag desaparece automaticamente quando um humano envia mensagem (fromType === 'human').
  const isPending = (chat: UIConversation): boolean => {
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg?.fromType === 'user') return true;
    if (chat.status === 'human' && lastMsg?.fromType !== 'human') return true;
    if (!lastMsg && chat.unreadCount > 0) return true;
    return false;
  };

  const filteredConversations = conversations
    .filter(chat => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        chat.contactName.toLowerCase().includes(query) ||
        chat.contactPhone.includes(query) ||
        chat.lastMessage.toLowerCase().includes(query)
      );
    })
    // Ordenação estável: pendentes primeiro, demais mantêm a ordem por last_message_at
    // que já vem do hook useConversations.
    .map((chat, index) => ({ chat, index }))
    .sort((a, b) => {
      const pa = isPending(a.chat) ? 1 : 0;
      const pb = isPending(b.chat) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return a.index - b.index;
    })
    .map(({ chat }) => chat);

  const renderStatusBadge = (status: ConversationStatus) => {
    const config = {
      nina: { label: sdrName, icon: Bot, color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
      human: { label: 'Humano', icon: User, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      paused: { label: 'Pausado', icon: Pause, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
    };
    const { label, icon: Icon, color } = config[status];
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 ${color}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const renderMessageContent = (msg: UIMessage) => {
    if (msg.type === MessageType.IMAGE) {
      if (!msg.mediaUrl) {
        return (
          <div className="mb-1 flex items-center gap-2 px-3 py-6 rounded-lg bg-slate-900/60 border border-slate-700/50 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            Baixando imagem do WhatsApp...
          </div>
        );
      }
      return (
        <div className="mb-1 group relative">
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
            <img 
              src={msg.mediaUrl} 
              alt={msg.content || 'Imagem'} 
              className="rounded-lg max-w-full h-auto max-h-72 object-cover border border-slate-700/50 shadow-lg cursor-zoom-in"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://placehold.co/300x200/1e293b/cbd5e1?text=Erro+Imagem';
              }}
            />
          </a>
          {msg.content && msg.content !== '[imagem recebida]' && (
            <p className="text-xs mt-1.5 opacity-90">{msg.content}</p>
          )}
        </div>
      );
    }

    if (msg.type === MessageType.AUDIO) {
      // Audio still being downloaded from WhatsApp servers
      if (!msg.mediaUrl) {
        const mediaId = msg.metadata?.media_id;
        const retryDownload = async () => {
          if (!mediaId) return;
          try {
            const { supabase } = await import('@/integrations/supabase/client');
            toast.info('Baixando áudio...');
            const { error } = await supabase.functions.invoke('download-whatsapp-media', {
              body: { message_id: msg.id, media_id: mediaId }
            });
            if (error) throw error;
            toast.success('Áudio baixado, atualizando...');
          } catch (e: any) {
            toast.error('Falha ao baixar áudio: ' + (e.message || 'erro'));
          }
        };
        return (
          <div className="flex items-center gap-2 min-w-[220px] py-2 text-xs opacity-80">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Carregando áudio…</span>
            {mediaId && (
              <button
                onClick={retryDownload}
                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/10 transition"
                title="Tentar baixar novamente"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Recarregar</span>
              </button>
            )}
          </div>
        );
      }

      const isPlaying = playingAudioId === msg.id;
      const duration = audioDurations[msg.id] || 0;
      const progress = audioProgress[msg.id] || 0;
      
      const togglePlay = () => {
        const audio = audioRefs.current[msg.id];
        if (!audio) return;
        
        if (isPlaying) {
          audio.pause();
          setPlayingAudioId(null);
        } else {
          // Pause all other audios
          Object.values(audioRefs.current).forEach(a => a.pause());
          audio.play();
          setPlayingAudioId(msg.id);
        }
      };

      return (
        <div className="flex items-center gap-3 min-w-[220px] py-1">
          {/* Hidden audio element */}
          {msg.mediaUrl && (
            <audio
              ref={el => { if (el) audioRefs.current[msg.id] = el; }}
              src={msg.mediaUrl}
              onLoadedMetadata={(e) => {
                const audio = e.currentTarget;
                setAudioDurations(prev => ({ ...prev, [msg.id]: audio.duration }));
              }}
              onTimeUpdate={(e) => {
                const audio = e.currentTarget;
                setAudioProgress(prev => ({ ...prev, [msg.id]: audio.currentTime }));
              }}
              onEnded={() => setPlayingAudioId(null)}
            />
          )}
          
          {/* Play/Pause button */}
          <button 
            onClick={togglePlay}
            disabled={!msg.mediaUrl}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all shadow-md ${
              msg.direction === MessageDirection.OUTGOING 
                ? 'bg-white text-cyan-600 hover:bg-cyan-50 disabled:opacity-50' 
                : 'bg-cyan-500 text-white hover:bg-cyan-400 disabled:opacity-50'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
            )}
          </button>
          
          {/* Progress bar and duration */}
          <div className="flex-1 flex flex-col gap-1 justify-center h-9">
            <div 
              className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${
                msg.direction === MessageDirection.OUTGOING ? 'bg-white/30' : 'bg-slate-600'
              }`}
              onClick={(e) => {
                const audio = audioRefs.current[msg.id];
                if (!audio || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                audio.currentTime = percent * duration;
              }}
            >
              <div 
                className={`h-full rounded-full transition-all ${
                  msg.direction === MessageDirection.OUTGOING ? 'bg-white' : 'bg-cyan-400'
                }`}
                style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
              />
            </div>
            <span className={`text-[10px] font-medium ${
              msg.direction === MessageDirection.OUTGOING ? 'text-cyan-100' : 'text-slate-400'
            }`}>
              {formatAudioTime(progress)} / {formatAudioTime(duration)}
            </span>
          </div>
        </div>
      );
    }

    if (msg.type === MessageType.DOCUMENT) {
      return (
        <div className="mb-1">
          <a
            href={msg.mediaUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition ${
              msg.direction === MessageDirection.OUTGOING
                ? 'bg-white/10 border-white/20 hover:bg-white/15'
                : 'bg-slate-900/60 border-slate-700/50 hover:bg-slate-900'
            }`}
          >
            <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${
              msg.direction === MessageDirection.OUTGOING ? 'bg-white/20' : 'bg-cyan-500/20'
            }`}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{msg.content || 'Documento'}</p>
              <p className="text-[10px] opacity-70">Toque para abrir</p>
            </div>
          </a>
        </div>
      );
    }

    return <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

  if (loading) {
    return (
      <div className="flex h-full bg-slate-950 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-500">Sincronizando conversas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-950 rounded-tl-2xl overflow-hidden border-t border-l border-slate-800/50 shadow-2xl">
      
      {/* Left Sidebar: Chat List */}
      <div className="w-80 lg:w-96 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-md z-20 flex-shrink-0">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800/50">
          <h2 className="text-lg font-bold text-white mb-3 px-1">Conversas</h2>
          <Tabs value={chatTab} onValueChange={(v) => setChatTab(v as 'active' | 'finished')} className="mb-3">
            <TabsList className="grid grid-cols-2 w-full h-9">
              <TabsTrigger value="active" className="text-xs">Ativas</TabsTrigger>
              <TabsTrigger value="finished" className="text-xs">Finalizadas</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar conversa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none text-slate-200 placeholder:text-slate-600 transition-all"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
              <p className="text-xs mt-1 opacity-70">As conversas aparecerão aqui quando receberem mensagens</p>
            </div>
          ) : (
            filteredConversations.map((chat) => (
              <div 
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`flex items-center p-4 cursor-pointer transition-all duration-200 border-b border-slate-800/30 hover:bg-slate-800/50 ${
                  selectedChatId === chat.id 
                    ? 'bg-slate-800/80 border-l-2 border-l-cyan-500' 
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-slate-700 to-slate-900">
                    <img 
                      src={chat.contactAvatar} 
                      alt={chat.contactName} 
                      className="w-full h-full rounded-full object-cover border border-slate-800" 
                    />
                  </div>
                  {chat.unreadCount > 0 ? (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-cyan-500 border-2 border-slate-900 rounded-full animate-pulse"></span>
                  ) : (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-slate-600 border-2 border-slate-900 rounded-full"></span>
                  )}
                </div>
                
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className={`text-sm font-semibold truncate ${selectedChatId === chat.id ? 'text-white' : 'text-slate-300'}`}>
                      {chat.contactName}
                    </h3>
                    <span className="text-[10px] text-slate-500 font-medium">{chat.lastMessageAt ? formatRelativeTime(chat.lastMessageAt) : chat.lastMessageTime}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {chat.messages[chat.messages.length - 1]?.type === MessageType.IMAGE ? '📷 Imagem' : 
                     chat.messages[chat.messages.length - 1]?.type === MessageType.AUDIO ? '🎵 Áudio' : 
                     chat.messages[chat.messages.length - 1]?.type === MessageType.DOCUMENT ? '📄 Documento' :
                     chat.lastMessage || 'Sem mensagens'}
                  </p>
                  
                  <div className="flex items-center mt-2 gap-1.5">
                    {renderStatusBadge(chat.status)}
                    {isPending(chat) && (
                      <span
                        className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] rounded-md font-medium flex items-center gap-1 animate-pulse"
                        title="Aguardando resposta"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Pendente
                      </span>
                    )}
                    {pendingActivities[chat.id] && (() => {
                      const due = new Date(pendingActivities[chat.id].nextAt).getTime() <= Date.now();
                      return (
                        <span
                          className={`px-1.5 py-0.5 border text-[10px] rounded-md font-medium flex items-center gap-1 ${
                            due
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                          title={`${due ? 'Tarefa no horário! ' : 'Lembrete: '}${new Date(pendingActivities[chat.id].nextAt).toLocaleString('pt-BR')}`}
                        >
                          <Bell className="w-2.5 h-2.5" />
                          {pendingActivities[chat.id].count}
                        </span>
                      );
                    })()}
                    {chat.assignedUserId && (() => {
                      const m = teamMembers.find(tm => tm.id === chat.assignedUserId);
                      if (!m) return null;
                      return (
                        <img
                          src={m.avatar}
                          alt={m.name}
                          title={`Responsável: ${m.name}`}
                          className="w-4 h-4 rounded-full ring-1 ring-slate-700"
                        />
                      );
                    })()}
                    {chat.tags.slice(0, 1).map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-[10px] rounded-md font-medium">
                        {tag}
                      </span>
                    ))}
                    {chat.unreadCount > 0 && (
                      <span className="ml-auto bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-[10px] font-bold px-1.5 h-4 min-w-[1rem] flex items-center justify-center rounded-full shadow-lg shadow-cyan-500/20">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Area: Chat Window & Profile */}
      {activeChat ? (
        <div className="flex-1 flex overflow-hidden bg-[#0B0E14]">
          {/* Main Chat Content */}
          <div
            className="flex-1 flex flex-col min-w-0 relative"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

            {/* Drag overlay */}
            {isDraggingFile && (
              <div className="absolute inset-0 z-30 bg-cyan-500/10 backdrop-blur-sm border-4 border-dashed border-cyan-400/60 rounded-lg flex flex-col items-center justify-center pointer-events-none">
                <Upload className="w-12 h-12 text-cyan-300 mb-3 animate-bounce" />
                <p className="text-lg font-semibold text-cyan-200">Solte para enviar</p>
                <p className="text-xs text-cyan-300/70 mt-1">Imagens, áudios ou documentos</p>
              </div>
            )}

            {/* Chat Header */}
            <div className="h-16 px-6 flex items-center justify-between bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-10 shrink-0">
              <div 
                className="flex items-center p-1.5 -ml-1.5 rounded-lg pr-3 group/header"
              >
                <div className="relative cursor-pointer" onClick={() => setShowProfileInfo(!showProfileInfo)}>
                  <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-9 h-9 rounded-full ring-2 ring-slate-800" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
                </div>
                <div className="ml-3">
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                    {isEditingName ? (
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                          if (e.key === 'Escape') { setIsEditingName(false); }
                        }}
                        disabled={savingName}
                        className="bg-slate-950 border border-cyan-500/50 rounded-md px-2 py-0.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-cyan-500/50 min-w-[160px]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={startEditName}
                        title="Clique para editar o nome do contato"
                        className="inline-flex items-center gap-1.5 hover:text-cyan-300 transition-colors"
                      >
                        {activeChat.contactName}
                        <Pencil className="w-3 h-3 opacity-0 group-hover/header:opacity-60 transition-opacity" />
                      </button>
                    )}
                    {renderStatusBadge(activeChat.status)}
                    {isPending(activeChat) && (
                      <span
                        className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] rounded-md font-medium flex items-center gap-1 animate-pulse"
                        title="Aguardando resposta"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Pendente
                      </span>
                    )}
                    {assignedMember ? (
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-medium border bg-cyan-500/10 text-cyan-300 border-cyan-500/30 flex items-center gap-1"
                        title={`Atendente responsável: ${assignedMember.name}`}
                      >
                        <img src={assignedMember.avatar} alt={assignedMember.name} className="w-3.5 h-3.5 rounded-full" />
                        {assignedMember.name}
                      </span>
                    ) : activeChat.status === 'human' ? (
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-medium border bg-orange-500/10 text-orange-300 border-orange-500/30 flex items-center gap-1"
                        title="Nenhum atendente atribuído"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Sem responsável
                      </span>
                    ) : null}
                  </h2>
                  <p className="text-xs text-cyan-500 font-medium">{activeChat.contactPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Status control buttons */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'nina' ? 'bg-violet-500/20 text-violet-400' : ''}`}
                  onClick={() => handleStatusChange('nina')}
                  title={`Ativar ${sdrName} (IA)`}
                >
                  <Bot className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'human' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                  onClick={() => handleStatusChange('human')}
                  title="Assumir conversa"
                >
                  <User className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'paused' ? 'bg-amber-500/20 text-amber-400' : ''}`}
                  onClick={() => handleStatusChange('paused')}
                  title="Pausar conversa"
                >
                  <Pause className="w-5 h-5" />
                </Button>
                <div className="h-6 w-px bg-slate-800 mx-1"></div>
                {chatTab === 'active' ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-rose-400"
                        title="Finalizar conversa"
                      >
                        <XCircle className="w-5 h-5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-900 border-slate-800">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Finalizar esta conversa?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                          A conversa será movida para a aba "Finalizadas". Você ainda poderá consultar todo o histórico e reabrir quando quiser.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-rose-600 hover:bg-rose-500 text-white"
                          onClick={() => {
                            if (activeChat) endConversation(activeChat.id);
                          }}
                        >
                          Finalizar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-emerald-400"
                    title="Reabrir conversa"
                    onClick={() => {
                      if (activeChat) reopenConversation(activeChat.id);
                    }}
                  >
                    <RotateCcw className="w-5 h-5" />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${showProfileInfo ? 'bg-slate-800 text-cyan-400' : ''}`} 
                  onClick={() => setShowProfileInfo(!showProfileInfo)} 
                  title="Ver Informações"
                >
                  <Info className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  disabled
                  title="Em breve: Mais opções"
                  className="text-slate-500 cursor-not-allowed opacity-50"
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-0">
              {activeChat.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                  <p className="text-xs mt-1 opacity-70">Envie uma mensagem para iniciar a conversa</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center my-6">
                    <span className="px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium rounded-full shadow-sm backdrop-blur-sm">Hoje</span>
                  </div>

                  {(() => {
                    const msgsById = new Map(activeChat.messages.map(m => [m.id, m]));
                    const previewFor = (m: UIMessage) => {
                      if (m.type === MessageType.IMAGE) return '📷 Imagem';
                      if (m.type === MessageType.AUDIO) return '🎵 Áudio';
                      if (m.type === MessageType.DOCUMENT) return '📄 ' + (m.content || 'Documento');
                      return m.content || '';
                    };
                    const authorFor = (m: UIMessage) => {
                      if (m.fromType === 'user') return activeChat.contactName;
                      if (m.fromType === 'nina') return sdrName;
                      return 'Você';
                    };
                    return activeChat.messages.map((msg) => {
                      const isOutgoing = msg.direction === MessageDirection.OUTGOING;
                      const replied = msg.replyToId ? msgsById.get(msg.replyToId) : null;
                      return (
                        <div
                          key={msg.id}
                          data-msg-id={msg.id}
                          className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all rounded-lg`}
                        >
                          <div className={`flex items-center gap-2 max-w-[75%] ${isOutgoing ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'} flex-1 min-w-0`}>
                              <div
                                className={`px-5 py-3 rounded-2xl shadow-md relative text-sm leading-relaxed ${
                                  isOutgoing
                                    ? msg.fromType === 'nina'
                                      ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-sm shadow-violet-900/20'
                                      : 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white rounded-tr-sm shadow-cyan-900/20'
                                    : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50'
                                }`}
                              >
                                {replied && (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(replied.id)}
                                    className={`mb-2 w-full text-left px-2.5 py-1.5 rounded-md border-l-2 text-xs transition ${
                                      isOutgoing
                                        ? 'bg-white/10 border-white/60 hover:bg-white/15'
                                        : 'bg-slate-900/60 border-cyan-400 hover:bg-slate-900'
                                    }`}
                                    title="Ir para mensagem original"
                                  >
                                    <p className={`font-semibold text-[11px] mb-0.5 ${isOutgoing ? 'text-white/90' : 'text-cyan-300'}`}>
                                      {authorFor(replied)}
                                    </p>
                                    <p className={`truncate ${isOutgoing ? 'text-white/80' : 'text-slate-400'}`}>
                                      {previewFor(replied)}
                                    </p>
                                  </button>
                                )}
                                {renderMessageContent(msg)}
                              </div>

                              <div className="flex items-center mt-1.5 gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity px-1">
                                {isOutgoing && msg.fromType === 'nina' && (
                                  <Bot className="w-3 h-3 text-violet-400" />
                                )}
                                {isOutgoing && msg.fromType === 'human' && (
                                  <User className="w-3 h-3 text-cyan-400" />
                                )}
                                <span className="text-[10px] text-slate-500 font-medium">{msg.timestamp}</span>
                                {isOutgoing && (
                                  msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-cyan-500" /> :
                                  msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-slate-500" /> :
                                  <Check className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </div>
                            </div>
                            {chatTab === 'active' && !msg.id.startsWith('temp-') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingTo(msg);
                                  requestAnimationFrame(() => messageInputRef.current?.focus());
                                }}
                                title="Responder esta mensagem"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {chatTab === 'finished' ? (
              <div className="p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-sm z-10">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <XCircle className="w-5 h-5 text-rose-400" />
                    <span>Esta conversa foi finalizada. Reabra para enviar novas mensagens.</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => activeChat && reopenConversation(activeChat.id)}
                    className="text-emerald-400 hover:text-emerald-300 gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reabrir
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-sm z-10">
                {/* Hidden file inputs */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e, 'image')}
                />
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/ogg,audio/mp4,audio/aac,audio/x-m4a"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e, 'audio')}
                />
                <input
                  ref={documentInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e, 'document')}
                />

                {/* Attachment preview card */}
                {pendingAttachment && (
                  <div className="max-w-4xl mx-auto mb-3 p-3 rounded-xl border border-cyan-500/30 bg-slate-950/80 flex items-center gap-3">
                    {pendingAttachment.mediaType === 'image' ? (
                      <img
                        src={pendingAttachment.previewUrl}
                        alt="preview"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400">
                        {pendingAttachment.mediaType === 'audio' ? <Music className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{pendingAttachment.file.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {(pendingAttachment.file.size / 1024).toFixed(1)} KB · {pendingAttachment.mediaType}
                      </p>
                      {pendingAttachment.mediaType === 'image' && (
                        <input
                          type="text"
                          value={attachmentCaption}
                          onChange={(e) => setAttachmentCaption(e.target.value)}
                          placeholder="Adicionar legenda (opcional)…"
                          className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-500/60"
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={cancelAttachment}
                      disabled={isUploading}
                      className="text-slate-400 hover:text-white rounded-full"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSendAttachment}
                      disabled={isUploading}
                      className="rounded-full px-4 h-10 text-sm bg-cyan-500 hover:bg-cyan-400"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span className="ml-2">Enviar</span>
                    </Button>
                  </div>
                )}

                {/* Reply preview banner */}
                {replyingTo && (
                  <div className="max-w-4xl mx-auto mb-2 flex items-stretch gap-0 rounded-lg overflow-hidden border border-slate-800 bg-slate-950/80">
                    <div className="w-1 bg-cyan-400" />
                    <div className="flex-1 px-3 py-2 min-w-0">
                      <p className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
                        <Reply className="w-3 h-3" />
                        Respondendo a {replyingTo.fromType === 'user' ? activeChat.contactName : replyingTo.fromType === 'nina' ? sdrName : 'Você'}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {replyingTo.type === MessageType.IMAGE ? '📷 Imagem' :
                         replyingTo.type === MessageType.AUDIO ? '🎵 Áudio' :
                         replyingTo.type === MessageType.DOCUMENT ? `📄 ${replyingTo.content || 'Documento'}` :
                         replyingTo.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="px-3 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Cancelar resposta"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex items-end gap-3 max-w-4xl mx-auto">
                  <div className="flex items-center gap-1">
                    <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Inserir emoji"
                          className="text-slate-300 hover:text-cyan-400 rounded-full"
                        >
                          <Smile className="w-5 h-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="p-0 border-slate-700 bg-transparent shadow-xl w-auto"
                      >
                        <EmojiPicker
                          onEmojiClick={handleEmojiSelect}
                          theme={Theme.DARK}
                          emojiStyle={EmojiStyle.NATIVE}
                          width={340}
                          height={400}
                          searchPlaceholder="Buscar emoji..."
                          previewConfig={{ showPreview: false }}
                          lazyLoadEmojis
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
                      <PopoverTrigger asChild>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          title="Anexar arquivo"
                          className="text-slate-300 hover:text-cyan-400 rounded-full"
                        >
                          <Paperclip className="w-5 h-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="w-52 p-1.5 bg-slate-900 border-slate-700">
                        <button
                          type="button"
                          onClick={() => handlePickAttachment('image')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800 transition"
                        >
                          <ImageIcon className="w-4 h-4 text-cyan-400" />
                          Imagem
                          <span className="ml-auto text-[10px] text-slate-500">5MB</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePickAttachment('audio')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800 transition"
                        >
                          <Music className="w-4 h-4 text-violet-400" />
                          Áudio
                          <span className="ml-auto text-[10px] text-slate-500">16MB</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePickAttachment('document')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-200 hover:bg-slate-800 transition"
                        >
                          <FileText className="w-4 h-4 text-emerald-400" />
                          Documento
                          <span className="ml-auto text-[10px] text-slate-500">100MB</span>
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 focus-within:ring-2 focus-within:ring-cyan-500/30 focus-within:border-cyan-500/50 transition-all shadow-inner">
                    <textarea
                      ref={messageInputRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={activeChat.status === 'nina' ? `${sdrName} está respondendo automaticamente...` : 'Digite sua mensagem... (cole imagens com Ctrl+V ou arraste arquivos)'}
                      className="w-full bg-transparent border-none p-3.5 max-h-32 min-h-[48px] text-sm text-slate-200 focus:ring-0 resize-none outline-none placeholder:text-slate-600"
                      rows={1}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={!inputText.trim()}
                    className={`rounded-full w-12 h-12 p-0 transition-all ${
                      inputText.trim() 
                        ? 'shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-5 h-5 ml-0.5" />
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Right Profile Sidebar (CRM View) */}
          <div 
            className={`${showProfileInfo ? 'w-80 border-l border-slate-800 opacity-100' : 'w-0 opacity-0 border-none'} transition-all duration-300 ease-in-out bg-slate-900/95 flex-shrink-0 flex flex-col overflow-hidden`}
          >
            <div className="w-80 h-full flex flex-col">
              {/* Header */}
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 flex-shrink-0">
                <span className="font-semibold text-white">Informações do Lead</span>
                <button 
                  onClick={() => setShowProfileInfo(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {/* Identity */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-500 to-teal-600 shadow-xl mb-4">
                    <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-full h-full rounded-full object-cover border-2 border-slate-900" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{activeChat.contactName}</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {activeChat.clientMemory.lead_profile.lead_stage === 'new' ? 'Novo Lead' : 
                     activeChat.clientMemory.lead_profile.lead_stage === 'qualified' ? 'Lead Qualificado' :
                     activeChat.clientMemory.lead_profile.lead_stage}
                  </p>
                </div>

                {/* Details List */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dados de Contato</h4>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Telefone</span>
                      <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
                    </div>
                  </div>

                  {activeChat.contactEmail && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Email</span>
                        <span className="text-slate-200 font-medium">{activeChat.contactEmail}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* AI Memory Section */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Memória do(a) {sdrName}
                  </h4>
                  
                  {activeChat.clientMemory.lead_profile.interests.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-xs text-slate-400">Interesses</span>
                      <p className="text-sm text-slate-200 mt-1">
                        {activeChat.clientMemory.lead_profile.interests.join(', ')}
                      </p>
                    </div>
                  )}

                  {activeChat.clientMemory.sales_intelligence.pain_points.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-xs text-slate-400">Dores Identificadas</span>
                      <p className="text-sm text-slate-200 mt-1">
                        {activeChat.clientMemory.sales_intelligence.pain_points.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-400">Próxima Ação Sugerida</span>
                    <p className="text-sm text-slate-200 mt-1">
                      {activeChat.clientMemory.sales_intelligence.next_best_action === 'qualify' ? 'Qualificar lead' :
                       activeChat.clientMemory.sales_intelligence.next_best_action === 'demo' ? 'Agendar demonstração' :
                       activeChat.clientMemory.sales_intelligence.next_best_action}
                    </p>
                  </div>

                  <div className="text-xs text-slate-500 text-center">
                    Total de conversas: {activeChat.clientMemory.interaction_summary.total_conversations}
                  </div>
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Assigned User */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Responsável
                  </h4>
                  <select
                    value={activeChat.assignedUserId || ''}
                    onChange={(e) => {
                      const userId = e.target.value || null;
                      assignConversation(activeChat.id, userId);
                      toast.success('Conversa atribuída. Deal atualizado automaticamente.');
                    }}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all"
                  >
                    <option value="">Não atribuído</option>
                    {teamMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Activities & Reminders */}
                <ActivitiesPanel
                  conversationId={activeChat.id}
                  contactId={activeChat.contactId}
                  contactName={activeChat.contactName}
                />

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Tags */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    Tags
                    <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
                      <PopoverTrigger asChild>
                        <button className="text-cyan-500 hover:text-cyan-400 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0 bg-slate-900 border-slate-700" align="end">
                        <TagSelector 
                          availableTags={availableTags}
                          selectedTags={activeChat.tags || []}
                          onToggleTag={handleToggleTag}
                          onCreateTag={handleCreateTag}
                        />
                      </PopoverContent>
                    </Popover>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeChat.tags && activeChat.tags.length > 0 ? (
                      activeChat.tags.map(tagKey => {
                        const tagDef = availableTags.find(t => t.key === tagKey);
                        return (
                          <span 
                            key={tagKey}
                            style={{ 
                              backgroundColor: tagDef?.color ? `${tagDef.color}20` : 'rgba(59, 130, 246, 0.2)',
                              borderColor: tagDef?.color || '#3b82f6'
                            }}
                            className="px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 group hover:brightness-110 transition-all"
                          >
                            <span className="text-slate-200">{tagDef?.label || tagKey}</span>
                            <button
                              onClick={() => handleToggleTag(tagKey)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-slate-400 hover:text-slate-200" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 italic">Nenhuma tag adicionada</p>
                    )}
                  </div>
                </div>

                {/* Notes Area */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    Notas Internas
                    {isSavingNotes && <Loader2 className="w-3 h-3 animate-spin text-cyan-500" />}
                  </h4>
                  <textarea 
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none resize-none transition-all"
                    rows={4}
                    placeholder="Adicione observações sobre este lead..."
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    onBlur={handleNotesBlur}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0B0E14] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center p-8 text-center max-w-md">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800 relative group">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl group-hover:bg-cyan-500/30 transition-all duration-1000"></div>
              <MessageSquare className="w-10 h-10 text-cyan-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{companyName} Workspace</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              {conversations.length === 0 
                ? 'Aguardando novas conversas. Configure o webhook do WhatsApp para começar a receber mensagens.'
                : 'Selecione uma conversa ao lado para iniciar o atendimento inteligente.'}
            </p>
            <div className="mt-8 flex gap-3 text-xs text-slate-500 font-mono bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-800/50">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {sdrName} Online
              </span>
              <span className="w-px h-4 bg-slate-800"></span>
              <span>{conversations.length} conversas</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
