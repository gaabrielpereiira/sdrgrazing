import React, { useEffect, useState } from 'react';
import { Plus, Phone, MessageSquare, Calendar as CalendarIcon, Sparkles, Check, Trash2, Clock, User } from 'lucide-react';
import { useConversationActivities, ConversationActivity, ActivityType } from '@/hooks/useConversationActivities';
import { ActivityModal } from './ActivityModal';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  conversationId: string;
  contactId: string;
  contactName?: string;
}

const TYPE_ICON: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  message: MessageSquare,
  meeting: CalendarIcon,
  other: Sparkles,
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const overdue = diffMs < 0;
  const absMins = Math.abs(Math.round(diffMs / 60000));

  let rel: string;
  if (absMins < 60) rel = `${absMins}min`;
  else if (absMins < 60 * 24) rel = `${Math.round(absMins / 60)}h`;
  else rel = `${Math.round(absMins / (60 * 24))}d`;

  const fmt = `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return { rel: overdue ? `há ${rel}` : `em ${rel}`, fmt, overdue };
}

const ActivityItem: React.FC<{
  activity: ConversationActivity;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  assigneeName?: string | null;
  assigneeAvatar?: string | null;
}> = ({ activity, onComplete, onDelete, assigneeName, assigneeAvatar }) => {
  const Icon = TYPE_ICON[activity.activity_type] || Sparkles;
  const { rel, fmt, overdue } = formatWhen(activity.scheduled_at);
  const isDone = activity.is_completed;

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isDone
          ? 'bg-slate-900/40 border-slate-800 opacity-60'
          : overdue
          ? 'bg-rose-500/5 border-rose-500/40'
          : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${
            isDone ? 'bg-slate-700/50 text-slate-500' : overdue ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/15 text-cyan-400'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-slate-500' : 'text-slate-100'}`}>
            {activity.title}
          </p>
          {activity.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{activity.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
            <Clock className={`w-3 h-3 ${overdue && !isDone ? 'text-rose-400' : 'text-slate-500'}`} />
            <span className={overdue && !isDone ? 'text-rose-300 font-medium' : 'text-slate-400'}>
              {fmt}
            </span>
            <span className="text-slate-600">·</span>
            <span className={overdue && !isDone ? 'text-rose-400' : 'text-slate-500'}>{rel}</span>
          </div>
          {assigneeName && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
              {assigneeAvatar ? (
                <img src={assigneeAvatar} alt={assigneeName} className="w-3.5 h-3.5 rounded-full" />
              ) : (
                <User className="w-3 h-3" />
              )}
              <span className="truncate">{assigneeName}</span>
            </div>
          )}
        </div>
        {!isDone && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onComplete(activity.id)}
              className="w-6 h-6 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/15"
              title="Concluir"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(activity.id)}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
              title="Remover"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ActivitiesPanel: React.FC<Props> = ({ conversationId, contactId, contactName }) => {
  const { activities, createActivity, completeActivity, deleteActivity } = useConversationActivities(conversationId);
  const [modalOpen, setModalOpen] = useState(false);

  const pending = activities.filter(a => !a.is_completed);
  const done = activities.filter(a => a.is_completed).slice(0, 3);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 shrink-0" />
          <span className="truncate">Atividades & Lembretes</span>
          {pending.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] normal-case font-semibold whitespace-nowrap ${
                formatWhen(pending[0].scheduled_at).overdue
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
              title={pending.length > 1 ? `Próxima de ${pending.length} pendentes` : 'Próxima atividade'}
            >
              {formatWhen(pending[0].scheduled_at).fmt}
            </span>
          )}
        </span>
        <button
          onClick={() => setModalOpen(true)}
          className="text-cyan-500 hover:text-cyan-400 transition-colors"
          title="Nova atividade"
        >
          <Plus className="w-4 h-4" />
        </button>
      </h4>

      <div className="space-y-2">
        {pending.length === 0 && done.length === 0 ? (
          <button
            onClick={() => setModalOpen(true)}
            className="w-full p-4 rounded-lg border border-dashed border-slate-700 text-xs text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
          >
            Nenhuma atividade agendada.
            <br />
            <span className="text-cyan-500">+ Criar lembrete</span>
          </button>
        ) : (
          <>
            {pending.map(a => (
              <ActivityItem key={a.id} activity={a} onComplete={completeActivity} onDelete={deleteActivity} />
            ))}
            {done.length > 0 && (
              <details className="mt-2">
                <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-400">
                  Concluídas recentes ({done.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {done.map(a => (
                    <ActivityItem key={a.id} activity={a} onComplete={completeActivity} onDelete={deleteActivity} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <ActivityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        conversationId={conversationId}
        contactId={contactId}
        contactName={contactName}
        onCreate={createActivity}
      />
    </div>
  );
};
