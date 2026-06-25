import { supabase } from '@/integrations/supabase/client';
import { 
  Contact, 
  StatMetric, 
  TeamMember, 
  Appointment, 
  Deal,
  DBConversation,
  DBMessage,
  UIConversation,
  transformDBToUIConversation
} from '../types';
import { MOCK_CONTACTS, MOCK_TEAM, MOCK_APPOINTMENTS, MOCK_DEALS } from '../constants';
import { ORDER_STATUSES } from '@/hooks/useAutomations';

// Helper function to get current user ID
const getCurrentUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  return user.id;
};

// Cache for system stage IDs (Ganho/Perdido) - keyed by user_id for multi-tenant
const systemStagesCacheByUser: Map<string, { ganhoId: string | null; perdidoId: string | null }> = new Map();

// Helper function to get system stage IDs dynamically
const getSystemStageIds = async (): Promise<{ ganhoId: string | null; perdidoId: string | null }> => {
  const userId = await getCurrentUserId();
  
  if (systemStagesCacheByUser.has(userId)) {
    return systemStagesCacheByUser.get(userId)!;
  }
  
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, title, is_system')
    .eq('is_system', true)
    .eq('is_active', true);
  
  const ganhoStage = stages?.find(s => s.title.toLowerCase() === 'ganho');
  const perdidoStage = stages?.find(s => s.title.toLowerCase() === 'perdido');
  
  const result = {
    ganhoId: ganhoStage?.id || null,
    perdidoId: perdidoStage?.id || null
  };
  
  systemStagesCacheByUser.set(userId, result);
  return result;
};

// Clear cache (call when stages are modified)
export const clearStagesCache = () => {
  systemStagesCacheByUser.clear();
};

/**
 * Executes active `pipeline.deal.won` automation rules for the given deal.
 * Finds the deal's contact + conversation and sends the configured WhatsApp template.
 * Called after a deal is moved to / marked as "Ganho".
 */
const firePipelineAutomations = async (dealId: string): Promise<void> => {
  try {
    // 1. Get active pipeline.deal.won automation rules
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('trigger_topic', 'pipeline.deal.won')
      .eq('active', true);

    if (rulesError || !rules?.length) return;

    // 2. Get deal + contact data
    const { data: deal } = await supabase
      .from('deals')
      .select('id, title, company, value, contact_id, contact:contacts(id, name, call_name, phone_number, email)')
      .eq('id', dealId)
      .single();

    if (!deal) return;

    const contact = deal.contact as any;
    const contactName: string = contact?.name || contact?.call_name || contact?.phone_number || '';
    const contactPhone: string = contact?.phone_number || '';
    const contactEmail: string = contact?.email || '';

    // 3. Fetch last order for this contact
    let lastOrder: any = null;
    if (deal.contact_id) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('woo_order_id, status, total, currency')
        .eq('contact_id', deal.contact_id)
        .order('order_created_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      lastOrder = orderData;
    }

    // 4. Build variable-interpolation context
    const context: Record<string, string> = {
      'deal.title':   deal.title   || '',
      'deal.company': deal.company || '',
      'deal.value':   new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                        .format(deal.value || 0),
      'contact.name':  contactName,
      'contact.phone': contactPhone,
      'contact.email': contactEmail,
      'order.number': lastOrder ? String(lastOrder.woo_order_id) : '',
      'order.total':  lastOrder
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
            .format(Number(lastOrder.total) || 0)
        : '',
      'order.status': lastOrder?.status || '',
    };

    // 5. Find the contact's most-recent conversation
    if (!deal.contact_id) {
      console.warn('[Pipeline Automation] Deal has no contact_id — cannot send WhatsApp');
      return;
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', deal.contact_id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      console.warn(`[Pipeline Automation] No conversation found for contact ${deal.contact_id}`);
      return;
    }

    // 6. Execute each matching rule
    for (const rule of rules) {
      if (rule.action_type !== 'whatsapp_message') continue;
      const cfg: Record<string, any> = (rule.action_config as Record<string, any>) || {};
      if (!cfg.template_id) continue;

      try {
        // Fetch approved template
        const { data: template } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .eq('id', cfg.template_id)
          .single();

        if (!template) continue;

        // Resolve variable values from context
        const variablePaths: string[] = Array.isArray(cfg.variables) ? cfg.variables : [];
        const variableValues = variablePaths.map((p: string) => context[p] ?? '');

        // Interpolate template body
        const bodyComponent = ((template.components as any[]) || []).find(
          (c: any) => (c.type || '').toUpperCase() === 'BODY'
        );
        const bodyText: string = bodyComponent?.text || '';
        const interpolatedBody = bodyText.replace(
          /\{\{\s*(\d+)\s*\}\}/g,
          (_: string, n: string) => variableValues[parseInt(n, 10) - 1] ?? `{{${n}}}`
        );

        const variablesRecord: Record<string, string> = {};
        variableValues.forEach((v, i) => { variablesRecord[`{{${i + 1}}}`] = v; });

        // Send via existing template pipeline (adds to send_queue + triggers whatsapp-sender)
        await api.sendTemplateMessage(conversation.id, {
          template: {
            id: template.id,
            name: template.name,
            language: template.language || 'pt_BR',
            category: template.category || 'MARKETING',
            components: (template.components as any[]) || [],
          },
          variables: variablesRecord,
          interpolatedBody,
        });

        // Log success
        await supabase.from('automation_logs').insert({
          rule_id: rule.id,
          event_id: null,
          status: 'success',
          result: {
            trigger: 'pipeline.deal.won',
            deal_id: dealId,
            contact_id: deal.contact_id,
            conversation_id: conversation.id,
          },
          executed_at: new Date().toISOString(),
        });
      } catch (ruleErr) {
        console.error(`[Pipeline Automation] Rule ${rule.id} failed:`, ruleErr);
        try {
          await supabase.from('automation_logs').insert({
            rule_id: rule.id,
            event_id: null,
            status: 'failed',
            result: {
              trigger: 'pipeline.deal.won',
              deal_id: dealId,
              error: ruleErr instanceof Error ? ruleErr.message : 'Unknown error',
            },
            executed_at: new Date().toISOString(),
          });
        } catch { /* ignore log failure */ }
      }
    }
  } catch (err) {
    console.error('[Pipeline Automation] Fatal error:', err);
  }
};

// Helper functions for dashboard metrics
const formatResponseTime = (ms: number): string => {
  if (!ms || ms === 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const calculateTrend = (today: number, yesterday: number): string => {
  if (yesterday === 0) return today > 0 ? '+100%' : '0%';
  const diff = ((today - yesterday) / yesterday) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const getDayName = (date: Date): string => {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return days[date.getDay()];
};

const getDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const api = {
  /**
   * Fetch dashboard metrics with real data from Supabase
   * @param days - Number of days to fetch (1 = today, 7 = last 7 days, 30 = last 30 days)
   */
  fetchDashboardMetrics: async (days: number = 1): Promise<StatMetric[]> => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    // Period start
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);
    const periodStartStr = periodStart.toISOString();
    
    // Previous period for comparison
    const prevPeriodEnd = new Date(periodStart);
    prevPeriodEnd.setMilliseconds(-1);
    const prevPeriodEndStr = prevPeriodEnd.toISOString();
    
    const prevPeriodStart = new Date(periodStart);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - days);
    const prevPeriodStartStr = prevPeriodStart.toISOString();

    try {
      // Fetch all metrics in parallel
      const [
        messagesPeriodResult,
        messagesPrevResult,
        contactsPeriodResult,
        contactsPrevResult,
        wonDealsPeriodResult,
        wonDealsPrevResult,
        appointmentsPeriodResult,
        appointmentsPrevResult,
        avgResponseResult
      ] = await Promise.all([
        // Atendimentos = conversas únicas com atividade no período
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .gte('last_message_at', periodStartStr),
        // Atendimentos no período anterior
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .gte('last_message_at', prevPeriodStartStr)
          .lt('last_message_at', periodStartStr),
        // New contacts in period
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', periodStartStr),
        // New contacts in previous period
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        // Won deals in period
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .not('won_at', 'is', null)
          .gte('won_at', periodStartStr),
        // Won deals in previous period
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .not('won_at', 'is', null)
          .gte('won_at', prevPeriodStartStr)
          .lt('won_at', periodStartStr),
        // Appointments in period
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', periodStartStr),
        // Appointments in previous period
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        // Average response time (for the period)
        supabase
          .from('messages')
          .select('nina_response_time')
          .not('nina_response_time', 'is', null)
          .gt('nina_response_time', 0)
          .gte('sent_at', periodStartStr)
      ]);

      const atendimentosPeriod = messagesPeriodResult.count || 0;
      const atendimentosPrev = messagesPrevResult.count || 0;
      const contactsPeriod = contactsPeriodResult.count || 0;
      const contactsPrev = contactsPrevResult.count || 0;
      
      // Conversões = deals ganhos + appointments agendados
      const conversionsPeriod = (wonDealsPeriodResult.count || 0) + (appointmentsPeriodResult.count || 0);
      const conversionsPrev = (wonDealsPrevResult.count || 0) + (appointmentsPrevResult.count || 0);
      
      const responseTimes = (avgResponseResult.data?.map(m => m.nina_response_time).filter((v): v is number => v !== null && v !== undefined)) || [];
      const avgResponseMs = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      return [
        {
          label: 'Atendimentos',
          value: atendimentosPeriod.toString(),
          trend: calculateTrend(atendimentosPeriod, atendimentosPrev),
          trendUp: atendimentosPeriod >= atendimentosPrev
        },
        {
          label: 'Conversões',
          value: conversionsPeriod.toString(),
          trend: calculateTrend(conversionsPeriod, conversionsPrev),
          trendUp: conversionsPeriod >= conversionsPrev
        },
        {
          label: 'Tempo Médio',
          value: formatResponseTime(avgResponseMs),
          trend: '-',
          trendUp: true
        },
        {
          label: 'Novos Leads',
          value: contactsPeriod.toString(),
          trend: calculateTrend(contactsPeriod, contactsPrev),
          trendUp: contactsPeriod >= contactsPrev
        }
      ];
    } catch (error) {
      console.error('[API] Error fetching dashboard metrics:', error);
      // Return fallback metrics
      return [
        { label: 'Atendimentos', value: '0', trend: '0%', trendUp: true },
        { label: 'Conversões', value: '0', trend: '0%', trendUp: true },
        { label: 'Tempo Médio', value: '0s', trend: '-', trendUp: true },
        { label: 'Novos Leads', value: '0', trend: '0%', trendUp: true }
      ];
    }
  },

  /**
   * Fetch chart data for the specified number of days
   * @param days - Number of days to fetch
   */
  fetchChartData: async (days: number = 7): Promise<any[]> => {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);

    try {
      const [messagesResult, dealsResult, appointmentsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('sent_at')
          .gte('sent_at', periodStart.toISOString()),
        supabase
          .from('deals')
          .select('won_at')
          .not('won_at', 'is', null)
          .gte('won_at', periodStart.toISOString()),
        supabase
          .from('appointments')
          .select('created_at')
          .gte('created_at', periodStart.toISOString())
      ]);

      // Group messages by day
      const messagesMap = new Map<string, number>();
      (messagesResult.data || []).forEach(m => {
        const dateStr = getDateString(new Date(m.sent_at));
        messagesMap.set(dateStr, (messagesMap.get(dateStr) || 0) + 1);
      });

      // Group conversions by day (deals + appointments)
      const conversionsMap = new Map<string, number>();
      (dealsResult.data || []).forEach(d => {
        if (d.won_at) {
          const dateStr = getDateString(new Date(d.won_at));
          conversionsMap.set(dateStr, (conversionsMap.get(dateStr) || 0) + 1);
        }
      });
      (appointmentsResult.data || []).forEach(a => {
        if (a.created_at) {
          const dateStr = getDateString(new Date(a.created_at));
          conversionsMap.set(dateStr, (conversionsMap.get(dateStr) || 0) + 1);
        }
      });

      // Generate days
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = getDateString(date);
        
        // Format name based on number of days
        let name: string;
        if (days === 1) {
          name = 'Hoje';
        } else if (days <= 7) {
          name = getDayName(date);
        } else {
          name = `${date.getDate()}/${date.getMonth() + 1}`;
        }
        
        result.push({
          name,
          chats: messagesMap.get(dateStr) || 0,
          sales: conversionsMap.get(dateStr) || 0
        });
      }

      return result;
    } catch (error) {
      console.error('[API] Error fetching chart data:', error);
      // Return empty data
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        result.push({
          name: days === 1 ? 'Hoje' : (days <= 7 ? getDayName(date) : `${date.getDate()}/${date.getMonth() + 1}`),
          chats: 0,
          sales: 0
        });
      }
      return result;
    }
  },

  /**
   * Create a new contact
   */
  createContact: async (input: { name: string; phone: string; email?: string; isBusiness?: boolean; companyName?: string | null }): Promise<Contact> => {
    const { data: { user } } = await supabase.auth.getUser();
    const phoneDigits = (input.phone || '').replace(/\D/g, '');
    if (!phoneDigits) throw new Error('Telefone é obrigatório');

    const isBusiness = !!input.isBusiness;
    const companyName = isBusiness ? (input.companyName?.trim() || null) : null;

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        name: input.name?.trim() || null,
        call_name: input.name?.trim() || null,
        phone_number: phoneDigits,
        email: input.email?.trim() || null,
        is_business: isBusiness,
        company_name: companyName,
        user_id: user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating contact:', error);
      throw error;
    }

    return {
      id: data.id,
      name: data.name || data.call_name || data.phone_number,
      phone: data.phone_number,
      email: data.email || '',
      status: 'lead' as const,
      lastContact: new Date(data.last_activity).toLocaleDateString('pt-BR'),
      isBusiness: !!(data as any).is_business,
      companyName: (data as any).company_name ?? null,
    };
  },

  /**
   * Get an existing conversation for the contact, or create one.
   * Reactivates a finalized conversation if needed.
   */
  getOrCreateConversationForContact: async (contactId: string): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: existing, error: selErr } = await supabase
      .from('conversations')
      .select('id, is_active')
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selErr) {
      console.error('[API] Error finding conversation:', selErr);
      throw selErr;
    }

    if (existing) {
      if (!existing.is_active) {
        const { error: updErr } = await supabase
          .from('conversations')
          .update({ is_active: true, status: 'human', last_message_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (updErr) {
          console.error('[API] Error reactivating conversation:', updErr);
          throw updErr;
        }
      }
      return existing.id;
    }

    const { data: created, error: insErr } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId,
        status: 'human',
        is_active: true,
        user_id: user?.id ?? null,
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[API] Error creating conversation:', insErr);
      throw insErr;
    }

    return created.id;
  },

  /**
   * Fetch contacts from database
   */
  fetchContacts: async (): Promise<Contact[]> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[API] Error fetching contacts:', error);
      return []; // Return empty array on error
    }

    if (!data || data.length === 0) {
      return []; // Return empty array if no data
    }

    return data.map(c => ({
      id: c.id,
      name: c.name || c.call_name || c.phone_number,
      phone: c.phone_number,
      email: c.email || '',
      status: 'lead' as const, // Map from tags or client_memory in future
      lastContact: c.last_activity, // ISO string; component formats it
      isBusiness: !!(c as any).is_business,
      companyName: (c as any).company_name ?? null,
    }));
  },

  /**
   * Fetch team members from database
   */
  fetchTeam: async (): Promise<TeamMember[]> => {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        *,
        team:teams(*),
        function:team_functions(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching team members:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role as 'admin' | 'manager' | 'agent',
      status: m.status as 'active' | 'invited' | 'disabled',
      avatar: m.avatar || `https://ui-avatars.com/api/?name=${m.name.replace(' ', '+')}&background=random`,
      lastActive: m.last_active || undefined,
      team_id: m.team_id,
      function_id: m.function_id,
      weight: m.weight ?? undefined,
      user_id: (m as any).user_id ?? null,
      team: m.team as any,
      function: m.function as any
    }));
  },

  /**
   * Create team member and send invitation email via Supabase Auth.
   */
  createTeamMember: async (member: {
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'agent';
    team_id?: string;
    function_id?: string;
    weight?: number;
    redirectTo?: string;
  }): Promise<TeamMember> => {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('team_members')
      .insert({
        name: member.name,
        email: member.email,
        role: member.role,
        team_id: member.team_id,
        function_id: member.function_id,
        weight: member.weight || 1,
        status: 'invited',
        user_id: null,
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team member:', error);
      throw error;
    }

    // Send invitation email — best-effort (don't block on failure)
    try {
      const redirectTo = member.redirectTo ?? (typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined);
      const { error: inviteErr } = await supabase.functions.invoke('invite-user', {
        body: { memberId: data.id, redirectTo },
      });
      if (inviteErr) {
        console.warn('[API] invite-user function warning:', inviteErr.message);
      }
    } catch (inviteEx) {
      console.warn('[API] invite-user call failed (non-blocking):', inviteEx);
    }

    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as 'admin' | 'manager' | 'agent',
      status: data.status as 'active' | 'invited' | 'disabled',
      avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name.replace(' ', '+')}&background=random`,
      team_id: data.team_id,
      function_id: data.function_id,
      weight: data.weight ?? undefined,
    };
  },

  /**
   * Update team member
   */
  updateTeamMember: async (id: string, updates: Partial<{
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'agent';
    status: 'active' | 'invited' | 'disabled';
    team_id: string | null;
    function_id: string | null;
    weight: number;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team member:', error);
      throw error;
    }
  },

  /**
   * Delete team member
   */
  deleteTeamMember: async (id: string): Promise<void> => {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { memberId: id },
    });
    if (error) {
      console.error('[API] Error deleting team member:', error);
      throw error;
    }
    if (data && (data as any).error) {
      throw new Error((data as any).error);
    }
  },


  /**
   * Sync team_members with auth.users:
   * - links existing invited members to their auth account by email
   * - creates a member entry for any auth user not yet listed
   */
  syncTeamMembers: async (): Promise<{ linked: number; created: number }> => {
    const { data, error } = await (supabase as any).rpc('sync_team_members_with_auth');
    if (error) {
      console.error('[API] Error syncing team members:', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      linked: Number(row?.linked ?? 0),
      created: Number(row?.created ?? 0),
    };
  },

  /**
   * Fetch teams
   */
  fetchTeams: async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching teams:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create team
   */
  createTeam: async (team: { name: string; description?: string; color?: string }) => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        description: team.description,
        color: team.color || '#3b82f6',
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update team
   */
  updateTeam: async (id: string, updates: Partial<{ name: string; description: string; color: string }>) => {
    const { error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team:', error);
      throw error;
    }
  },

  /**
   * Delete team
   */
  deleteTeam: async (id: string) => {
    const { error } = await supabase
      .from('teams')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team:', error);
      throw error;
    }
  },

  /**
   * Fetch team functions
   */
  fetchTeamFunctions: async () => {
    const { data, error } = await supabase
      .from('team_functions')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching team functions:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create team function
   */
  createTeamFunction: async (func: { name: string; description?: string }) => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('team_functions')
      .insert({
        name: func.name,
        description: func.description,
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team function:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update team function
   */
  updateTeamFunction: async (id: string, updates: Partial<{ name: string; description: string }>) => {
    const { error } = await supabase
      .from('team_functions')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team function:', error);
      throw error;
    }
  },

  /**
   * Delete team function
   */
  deleteTeamFunction: async (id: string) => {
    const { error } = await supabase
      .from('team_functions')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team function:', error);
      throw error;
    }
  },

  /**
   * Fetch appointments from database
   */
  fetchAppointments: async (): Promise<Appointment[]> => {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        contact:contacts(id, name, phone_number)
      `)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('[API] Error fetching appointments:', error);
      return []; // Return empty array on error
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      time: a.time,
      duration: a.duration,
      type: a.type as 'demo' | 'meeting' | 'support' | 'followup',
      description: a.description ?? undefined,
      attendees: a.attendees || [],
      contact_id: a.contact_id ?? undefined,
      contact: a.contact ? {
        id: a.contact.id,
        name: a.contact.name,
        phone_number: a.contact.phone_number
      } : undefined,
      metadata: a.metadata as Appointment['metadata']
    }));
  },

  /**
   * Create new appointment
   */
  createAppointment: async (appointment: {
    title: string;
    description?: string;
    date: string;
    time: string;
    duration?: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    attendees?: string[];
    contact_id?: string;
    meeting_url?: string;
  }): Promise<Appointment> => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        title: appointment.title,
        description: appointment.description,
        date: appointment.date,
        time: appointment.time,
        duration: appointment.duration || 60,
        type: appointment.type,
        attendees: appointment.attendees || [],
        contact_id: appointment.contact_id,
        meeting_url: appointment.meeting_url,
        status: 'scheduled',
        user_id: userId
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating appointment:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      date: data.date,
      time: data.time,
      duration: data.duration,
      type: data.type as 'demo' | 'meeting' | 'support' | 'followup',
      description: data.description ?? undefined,
      attendees: data.attendees || []
    };
  },

  /**
   * Update existing appointment
   */
  updateAppointment: async (id: string, updates: Partial<{
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    attendees: string[];
    meeting_url: string;
    status: string;
    contact_id: string;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating appointment:', error);
      throw error;
    }
  },

  /**
   * Delete appointment
   */
  deleteAppointment: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting appointment:', error);
      throw error;
    }
  },
  
  /**
   * Fetch pipeline/deals with real data
   */
  fetchPipeline: async (): Promise<Deal[]> => {
    const { data, error } = await supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(name, call_name, phone_number, email, client_memory),
        owner:team_members(name, avatar)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching pipeline:', error);
      return [];
    }

    // Buscar conversation IDs para cada deal com contact_id
    const contactIds = (data?.filter(d => d.contact_id).map(d => d.contact_id) || []).filter((id): id is string => id !== null);
    
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, contact_id')
      .in('contact_id', contactIds);

    const convMap = new Map(conversations?.map(c => [c.contact_id, c.id]) || []);

    // Buscar último pedido por contato (orders já vinculados pelo automation-runner)
    const orderMap = new Map<string, any>();
    if (contactIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('woo_order_id,status,total,currency,order_created_at,contact_id')
        .in('contact_id', contactIds)
        .order('order_created_at', { ascending: false, nullsFirst: false });
      (orders || []).forEach((o: any) => {
        if (o.contact_id && !orderMap.has(o.contact_id)) orderMap.set(o.contact_id, o);
      });
    }
    const statusLabelMap = new Map(ORDER_STATUSES.map(s => [s.slug, s.label]));

    return (data || []).map((d: any) => {
      const o = d.contact_id ? orderMap.get(d.contact_id) : null;
      return {
        id: d.id,
        title: d.title,
        company: d.company || d.contact?.name || d.contact?.call_name || 'Sem empresa',
        value: Number(d.value) || 0,
        stage: d.stage,
        stageId: d.stage_id,
        ownerAvatar: d.owner?.avatar || 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
        ownerId: d.owner_id,
        ownerName: d.owner?.name,
        tags: d.tags || [],
        dueDate: d.due_date,
        priority: (d.priority || 'medium') as 'low' | 'medium' | 'high',
        contactId: d.contact_id,
        contactName: d.contact?.name || d.contact?.call_name,
        contactPhone: d.contact?.phone_number,
        contactEmail: d.contact?.email,
        wonAt: d.won_at,
        lostAt: d.lost_at,
        lostReason: d.lost_reason,
        clientMemory: d.contact?.client_memory || null,
        conversationId: convMap.get(d.contact_id) || undefined,
        lastOrder: o ? {
          wooOrderId: Number(o.woo_order_id),
          status: o.status || 'unknown',
          statusLabel: statusLabelMap.get(o.status) || o.status || 'Pedido',
          total: Number(o.total) || 0,
          currency: o.currency || 'BRL',
          createdAt: o.order_created_at,
        } : undefined,
      };
    });
  },

  // Pipeline Stages CRUD
  fetchPipelineStages: async (): Promise<any[]> => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching pipeline stages:', error);
      throw error;
    }

    return data.map(stage => ({
      id: stage.id,
      title: stage.title,
      color: stage.color,
      position: stage.position,
      isSystem: stage.is_system,
      isActive: stage.is_active,
      isAiManaged: stage.is_ai_managed || false,
      aiTriggerCriteria: stage.ai_trigger_criteria
    }));
  },

  createPipelineStage: async (stage: { title: string; color: string; isAiManaged?: boolean; aiTriggerCriteria?: string }): Promise<any> => {
    const userId = await getCurrentUserId();
    
    // Get the highest position for all active stages
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('position')
      .eq('is_active', true)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = stages && stages.length > 0 ? stages[0].position + 1 : 0;

    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({
        title: stage.title,
        color: stage.color,
        position: nextPosition,
        is_system: false,
        is_active: true,
        is_ai_managed: stage.isAiManaged || false,
        ai_trigger_criteria: stage.aiTriggerCriteria || null,
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pipeline stage:', error);
      throw error;
    }

    // Clear cache since stages changed
    clearStagesCache();

    return {
      id: data.id,
      title: data.title,
      color: data.color,
      position: data.position,
      isSystem: data.is_system,
      isActive: data.is_active,
      isAiManaged: data.is_ai_managed || false,
      aiTriggerCriteria: data.ai_trigger_criteria
    };
  },

  updatePipelineStage: async (id: string, updates: any): Promise<void> => {
    const dbUpdates: any = {};
    
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isAiManaged !== undefined) dbUpdates.is_ai_managed = updates.isAiManaged;
    if (updates.aiTriggerCriteria !== undefined) dbUpdates.ai_trigger_criteria = updates.aiTriggerCriteria;

    const { error } = await supabase
      .from('pipeline_stages')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating pipeline stage:', error);
      throw error;
    }
    
    // Clear cache since stages changed
    clearStagesCache();
  },

  deletePipelineStage: async (id: string, moveToStageId?: string): Promise<void> => {
    // If moveToStageId is provided, move all deals to that stage first
    if (moveToStageId) {
      const { error: moveError } = await supabase
        .from('deals')
        .update({ stage_id: moveToStageId })
        .eq('stage_id', id);

      if (moveError) {
        console.error('Error moving deals:', moveError);
        throw moveError;
      }
    }

    // Delete the stage
    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting pipeline stage:', error);
      throw error;
    }
    
    // Clear cache since stages changed
    clearStagesCache();
  },

  reorderPipelineStages: async (stageIds: string[]): Promise<void> => {
    // Update position for each stage
    const updates = stageIds.map((id, index) => 
      supabase
        .from('pipeline_stages')
        .update({ position: index })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Error reordering stages:', errors);
      throw errors[0].error;
    }
  },

  /**
   * Create a new deal
   */
  createDeal: async (deal: {
    contact_id: string;
    title: string;
    company?: string;
    value?: number;
    stage?: string;
    stage_id?: string;
    priority?: string;
    tags?: string[];
    due_date?: string;
    owner_id?: string;
    notes?: string;
  }): Promise<Deal> => {
    const userId = await getCurrentUserId();

    const dealData: any = { ...deal, user_id: userId };

    // stage_id é NOT NULL sem default. Se não foi informado, usar o primeiro estágio ativo do pipeline.
    if (!dealData.stage_id) {
      const { data: firstStage, error: stageError } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (stageError) {
        console.error('[API] Error fetching first pipeline stage:', stageError);
        throw stageError;
      }
      if (!firstStage) {
        throw new Error('Nenhum estágio de pipeline configurado. Configure a pipeline primeiro.');
      }
      dealData.stage_id = firstStage.id;
    }

    const { data, error } = await supabase
      .from('deals')
      .insert([dealData])
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating deal:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      company: data.company || 'Sem empresa',
      value: Number(data.value) || 0,
      stage: data.stage || 'new',
      stageId: data.stage_id,
      ownerAvatar: 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
      tags: data.tags || [],
      dueDate: data.due_date ?? undefined,
      priority: data.priority as 'low' | 'medium' | 'high',
    };
  },

  /**
   * Update a deal
   */
  updateDeal: async (id: string, updates: Partial<{
    title: string;
    company: string;
    value: number;
    stage: string;
    priority: string;
    tags: string[];
    due_date: string;
    owner_id: string;
    notes: string;
    lost_reason: string;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating deal:', error);
      throw error;
    }
  },

  /**
   * Delete a deal
   */
  deleteDeal: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting deal:', error);
      throw error;
    }
  },

  /**
   * Move deal to a new stage
   * Clears won_at/lost_at/lost_reason when moving away from Ganho/Perdido
   */
  moveDealStage: async (id: string, newStageId: string): Promise<void> => {
    const { ganhoId, perdidoId } = await getSystemStageIds();

    // Build update object - clear won_at/lost_at if moving away from those stages
    const updates: Record<string, any> = { stage_id: newStageId };

    if (newStageId !== ganhoId && newStageId !== perdidoId) {
      updates.won_at = null;
      updates.lost_at = null;
      updates.lost_reason = null;
      updates.stage = 'in_progress';
    }

    // If moving to Ganho via drag-and-drop, record the timestamp
    if (newStageId === ganhoId) {
      updates.stage = 'won';
      updates.won_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error moving deal stage:', error);
      throw error;
    }

    // Fire pipeline automations when deal is dragged to Ganho
    if (newStageId === ganhoId) {
      firePipelineAutomations(id);
    }
  },

  /**
   * Mark deal as won
   */
  markDealWon: async (dealId: string): Promise<void> => {
    const { ganhoId } = await getSystemStageIds();

    if (!ganhoId) {
      console.error('[API] Ganho stage not found');
      throw new Error('Stage "Ganho" not found in pipeline');
    }

    const { error } = await supabase
      .from('deals')
      .update({
        stage: 'won',
        stage_id: ganhoId,
        won_at: new Date().toISOString()
      })
      .eq('id', dealId);

    if (error) {
      console.error('[API] Error marking deal as won:', error);
      throw error;
    }

    // Fire pipeline automations after marking deal as won
    firePipelineAutomations(dealId);
  },

  /**
   * Mark deal as lost with reason
   */
  markDealLost: async (dealId: string, reason: string): Promise<void> => {
    const { perdidoId } = await getSystemStageIds();
    
    if (!perdidoId) {
      console.error('[API] Perdido stage not found');
      throw new Error('Stage "Perdido" not found in pipeline');
    }
    
    const { error } = await supabase
      .from('deals')
      .update({ 
        stage: 'lost',
        stage_id: perdidoId,
        lost_at: new Date().toISOString(),
        lost_reason: reason
      })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error marking deal as lost:', error);
      throw error;
    }
  },

  /**
   * Update deal owner
   */
  updateDealOwner: async (dealId: string, ownerId: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update({ owner_id: ownerId })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error updating deal owner:', error);
      throw error;
    }
  },

  /**
   * Fetch activities for a deal
   */
  fetchDealActivities: async (dealId: string): Promise<any[]> => {
    const { data, error } = await supabase
      .from('deal_activities')
      .select(`
        *,
        created_by_member:team_members!deal_activities_created_by_fkey(name)
      `)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching deal activities:', error);
      throw error;
    }
    
    return data || [];
  },

  /**
   * Create a new deal activity
   */
  createDealActivity: async (activity: {
    dealId: string;
    type: 'note' | 'call' | 'email' | 'meeting' | 'task';
    title: string;
    description?: string;
    scheduledAt?: string;
    createdBy?: string;
  }): Promise<any> => {
    const { data, error } = await supabase
      .from('deal_activities')
      .insert({
        deal_id: activity.dealId,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        scheduled_at: activity.scheduledAt,
        created_by: activity.createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating deal activity:', error);
      throw error;
    }
    
    return data;
  },

  /**
   * Update a deal activity
   */
  updateDealActivity: async (id: string, updates: {
    title?: string;
    description?: string;
    scheduledAt?: string;
    isCompleted?: boolean;
  }): Promise<void> => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.scheduledAt !== undefined) dbUpdates.scheduled_at = updates.scheduledAt;
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }

    const { error } = await supabase
      .from('deal_activities')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating deal activity:', error);
      throw error;
    }
  },

  /**
   * Delete a deal activity
   */
  deleteDealActivity: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('deal_activities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting deal activity:', error);
      throw error;
    }
  },

  /**
   * Fetch conversations with messages from database
   */
  fetchConversations: async (opts?: { active?: boolean; queue?: 'sales' | 'support' | 'all' }): Promise<UIConversation[]> => {
    const isActive = opts?.active ?? true;
    const queue = opts?.queue ?? 'all';
    console.log('[API] Fetching conversations from Supabase, active=', isActive, 'queue=', queue);
    
    let query = supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('is_active', isActive)
      .order('last_message_at', { ascending: false })
      .limit(500);

    if (queue !== 'all') {
      query = query.eq('queue', queue);
    }

    const { data: conversations, error: convError } = await query;

    if (convError) {
      console.error('[API] Error fetching conversations:', convError);
      throw convError;
    }

    if (!conversations || conversations.length === 0) {
      console.log('[API] No conversations found');
      return [];
    }

    console.log(`[API] Found ${conversations.length} conversations`);

    // Fetch messages for each conversation
    const conversationsWithMessages: UIConversation[] = await Promise.all(
      conversations.map(async (conv) => {
        const { data: messages, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(300);

        if (msgError) {
          console.error(`[API] Error fetching messages for ${conv.id}:`, msgError);
        }

        return transformDBToUIConversation(
          conv as unknown as DBConversation,
          (messages || []) as unknown as DBMessage[]
        );
      })
    );

    return conversationsWithMessages;
  },

  /** Move a conversation to a different queue ('sales' | 'support'). */
  moveConversationQueue: async (
    conversationId: string,
    queue: 'sales' | 'support',
    opts?: { reasonKey?: string | null }
  ): Promise<void> => {
    // Fetch current tags so we can add/remove `motivo:*` tags accordingly
    const { data: current, error: fetchErr } = await supabase
      .from('conversations')
      .select('tags')
      .eq('id', conversationId)
      .maybeSingle();
    if (fetchErr) {
      console.error('[API] Error reading conversation tags:', fetchErr);
      throw fetchErr;
    }

    const currentTags: string[] = Array.isArray(current?.tags) ? current!.tags as string[] : [];
    // Strip any existing motivo:* tags
    let nextTags = currentTags.filter((t) => !t.startsWith('motivo:'));
    if (queue === 'support') {
      const key = opts?.reasonKey || 'nao_classificado';
      nextTags = [...nextTags, `motivo:${key}`];
    }

    const { error } = await supabase
      .from('conversations')
      .update({ queue, tags: nextTags, updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    if (error) {
      console.error('[API] Error moving conversation queue:', error);
      throw error;
    }
  },

  /**
   * Aggregate support ticket counts and reason breakdown for the dashboard.
   */
  fetchSupportSummary: async (
    days: number = 1
  ): Promise<{
    total: number;
    active: number;
    finished: number;
    trend: string;
    trendUp: boolean;
    reasons: { key: string; label: string; count: number }[];
  }> => {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);
    const periodStartStr = periodStart.toISOString();

    const prevPeriodEnd = new Date(periodStart);
    prevPeriodEnd.setMilliseconds(-1);
    const prevPeriodStart = new Date(periodStart);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - days);
    const prevPeriodStartStr = prevPeriodStart.toISOString();
    const prevPeriodEndStr = prevPeriodEnd.toISOString();

    try {
      const { labelForReasonKey } = await import('@/lib/supportReasons');

      const [periodRes, prevRes] = await Promise.all([
        supabase
          .from('conversations')
          .select('id, is_active, tags')
          .eq('queue', 'support')
          .gte('started_at', periodStartStr),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('queue', 'support')
          .gte('started_at', prevPeriodStartStr)
          .lt('started_at', periodStartStr),
      ]);

      const rows = (periodRes.data || []) as Array<{ id: string; is_active: boolean; tags: string[] | null }>;
      const total = rows.length;
      const active = rows.filter((r) => r.is_active).length;
      const finished = total - active;
      const prevTotal = prevRes.count || 0;

      // Aggregate motivo:* tags
      const counts = new Map<string, number>();
      for (const r of rows) {
        const tags = Array.isArray(r.tags) ? r.tags : [];
        const motivos = tags.filter((t) => typeof t === 'string' && t.startsWith('motivo:'));
        if (motivos.length === 0) {
          counts.set('nao_classificado', (counts.get('nao_classificado') || 0) + 1);
        } else {
          for (const m of motivos) {
            const key = m.slice('motivo:'.length);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }

      const reasons = Array.from(counts.entries())
        .map(([key, count]) => ({ key, label: labelForReasonKey(key), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      return {
        total,
        active,
        finished,
        trend: calculateTrend(total, prevTotal),
        trendUp: total >= prevTotal,
        reasons,
      };
    } catch (error) {
      console.error('[API] Error fetching support summary:', error);
      return { total: 0, active: 0, finished: 0, trend: '0%', trendUp: true, reasons: [] };
    }
  },

  /**
   * Sticky auto-assign: if a conversation has no responsible user and the current
   * sender is mapped to a team_member, become the responsible. Safe to call on
   * every outgoing human message — it's a no-op when already assigned.
   */
  _autoAssignIfUnassigned: async (
    conversationId: string,
    contactId: string,
    currentAssignedUserId: string | null,
    senderAuthUserId: string | null,
  ): Promise<void> => {
    try {
      if (currentAssignedUserId || !senderAuthUserId) return;
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', senderAuthUserId)
        .maybeSingle();
      if (!member?.id) return;
      await api.assignConversation(conversationId, member.id, contactId);
      console.log('[API] Auto-assigned conversation', conversationId, 'to team member', member.id);
    } catch (err) {
      console.warn('[API] Auto-assign skipped due to error:', err);
    }
  },

  /**
   * Send a message (insert into send_queue for human messages)
   * Returns the ID of the created message
   */
  sendMessage: async (conversationId: string, content: string, opts?: { replyToId?: string | null }): Promise<string> => {
    console.log(`[API] Sending message to conversation ${conversationId}`);

    // Capture current auth user (auth may be disabled — tolerate null)
    let senderUserId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      senderUserId = user?.id ?? null;
    } catch {
      senderUserId = null;
    }

    // Get conversation to find contact_id + current owner (for sticky auto-assign)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('contact_id, assigned_user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[API] Error getting conversation:', convError);
      throw new Error('Conversation not found');
    }

    // Sticky auto-assign before persisting the message
    await api._autoAssignIfUnassigned(
      conversationId,
      conversation.contact_id,
      conversation.assigned_user_id,
      senderUserId,
    );

    // First create the message record with status 'processing'
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: content,
        type: 'text',
        from_type: 'human',
        status: 'processing',
        sent_at: new Date().toISOString(),
        reply_to_id: opts?.replyToId || null,
        metadata: senderUserId ? { sender_user_id: senderUserId } : {}
      })
      .select('id')
      .single();

    if (msgError || !msgData) {
      console.error('[API] Error creating message record:', msgError);
      throw new Error('Failed to create message record');
    }

    console.log('[API] Message created with ID:', msgData.id);

    // Then queue message for sending WITH message_id reference
    const { error: sendError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        content: content,
        from_type: 'human',
        message_type: 'text',
        priority: 2, // Higher priority for human messages
        message_id: msgData.id,  // Reference to the pre-created message
        metadata: senderUserId ? { sender_user_id: senderUserId } : {}
      });

    if (sendError) {
      console.error('[API] Error queuing message:', sendError);
      throw sendError;
    }

    console.log('[API] Message queued for sending');

    // Trigger whatsapp-sender to process the queue immediately
    try {
      console.log('[API] Triggering whatsapp-sender...');
      const { error: triggerError } = await supabase.functions.invoke('whatsapp-sender');
      
      if (triggerError) {
        console.error('[API] Error triggering whatsapp-sender:', triggerError);
        // Don't throw - message is in queue and will be processed eventually
      } else {
        console.log('[API] whatsapp-sender triggered successfully');
      }
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender:', err);
      // Don't throw - message is in queue
    }

    return msgData.id;
  },

  /**
   * Send an approved WhatsApp template (works inside or outside the 24h window).
   */
  sendTemplateMessage: async (
    conversationId: string,
    payload: {
      template: { id: string; name: string; language: string; category: string; components: any[] };
      variables: Record<string, string>;
      interpolatedBody: string;
    }
  ): Promise<string> => {
    console.log(`[API] Sending template "${payload.template.name}" to conversation ${conversationId}`);

    let senderUserId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      senderUserId = user?.id ?? null;
    } catch {
      senderUserId = null;
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('contact_id, assigned_user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversation not found');
    }

    await api._autoAssignIfUnassigned(
      conversationId,
      conversation.contact_id,
      conversation.assigned_user_id,
      senderUserId,
    );

    const templateMeta = {
      name: payload.template.name,
      language: payload.template.language,
      category: payload.template.category,
      components: payload.template.components,
      variables: payload.variables,
    };

    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: payload.interpolatedBody,
        type: 'text',
        from_type: 'human',
        status: 'processing',
        sent_at: new Date().toISOString(),
        metadata: {
          ...(senderUserId ? { sender_user_id: senderUserId } : {}),
          template: templateMeta,
        },
      })
      .select('id')
      .single();

    if (msgError || !msgData) {
      throw new Error('Failed to create template message record');
    }

    const { error: sendError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        content: payload.interpolatedBody,
        from_type: 'human',
        message_type: 'text',
        priority: 2,
        message_id: msgData.id,
        metadata: {
          ...(senderUserId ? { sender_user_id: senderUserId } : {}),
          template: templateMeta,
        },
      });

    if (sendError) throw sendError;

    try {
      await supabase.functions.invoke('whatsapp-sender');
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender for template:', err);
    }

    return msgData.id;
  },

  /**
   * Send a media message (image, audio, document).
   * Uploads the file to whatsapp-media bucket and queues for sending.
   */
  sendMediaMessage: async (
    conversationId: string,
    file: File,
    opts: { mediaType: 'image' | 'audio' | 'document'; caption?: string; replyToId?: string | null }
  ): Promise<{ id: string; mediaUrl: string }> => {
    console.log(`[API] Sending ${opts.mediaType} to conversation ${conversationId}`);

    // Capture current auth user (auth may be disabled — tolerate null)
    let senderUserId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      senderUserId = user?.id ?? null;
    } catch {
      senderUserId = null;
    }

    // 1) Get conversation -> contact_id + current owner (sticky auto-assign)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('contact_id, assigned_user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[API] Error getting conversation:', convError);
      throw new Error('Conversation not found');
    }

    await api._autoAssignIfUnassigned(
      conversationId,
      conversation.contact_id,
      conversation.assigned_user_id,
      senderUserId,
    );

    // 2) Upload file to storage bucket
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `outbound/${conversationId}/${Date.now()}-${safeName}`;

    // Force a correct contentType for audio so Meta doesn't see application/octet-stream.
    let resolvedContentType = file.type || 'application/octet-stream';
    if (opts.mediaType === 'audio') {
      const lower = safeName.toLowerCase();
      if (lower.endsWith('.ogg') || lower.endsWith('.opus')) resolvedContentType = 'audio/ogg';
      else if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) resolvedContentType = 'audio/mp4';
      else if (lower.endsWith('.mp3')) resolvedContentType = 'audio/mpeg';
      else if (lower.endsWith('.aac')) resolvedContentType = 'audio/aac';
      else if (lower.endsWith('.amr')) resolvedContentType = 'audio/amr';
    }
    console.log('[API] Uploading media', { path, resolvedContentType, fileType: file.type, size: file.size });

    const { error: uploadErr } = await supabase.storage
      .from('whatsapp-media')
      .upload(path, file, {
        contentType: resolvedContentType,
        upsert: false,
      });

    if (uploadErr) {
      console.error('[API] Upload error:', uploadErr);
      throw new Error('Falha ao enviar arquivo: ' + uploadErr.message);
    }

    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    console.log('[API] Public URL:', publicUrl);

    // 3) Create message record
    const content = opts.caption?.trim() || file.name;
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content,
        type: opts.mediaType,
        from_type: 'human',
        status: 'processing',
        media_url: publicUrl,
        media_type: file.type || null,
        sent_at: new Date().toISOString(),
        reply_to_id: opts.replyToId || null,
        metadata: senderUserId ? { sender_user_id: senderUserId } : {},
      })
      .select('id')
      .single();

    if (msgError || !msgData) {
      console.error('[API] Error creating media message record:', msgError);
      throw new Error('Failed to create message record');
    }

    // 4) Queue for sending
    const { error: sendError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        content,
        from_type: 'human',
        message_type: opts.mediaType,
        media_url: publicUrl,
        priority: 2,
        message_id: msgData.id,
        metadata: senderUserId ? { sender_user_id: senderUserId } : {},
      });

    if (sendError) {
      console.error('[API] Error queuing media message:', sendError);
      throw sendError;
    }

    // 5) Trigger sender
    try {
      await supabase.functions.invoke('whatsapp-sender');
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender:', err);
    }

    return { id: msgData.id, mediaUrl: publicUrl };
  },

  /**
   * Update conversation status (nina/human/paused).
   * When transitioning to 'human', automatically:
   *  - sends a friendly message to the customer informing a human is taking over
   *  - creates an internal platform notification
   */
  updateConversationStatus: async (
    conversationId: string,
    status: 'nina' | 'human' | 'paused'
  ): Promise<void> => {
    // Read the previous status so we only trigger side-effects on a real transition.
    const { data: prev } = await supabase
      .from('conversations')
      .select('status, contact_id, contacts:contact_id(name, call_name, phone_number)')
      .eq('id', conversationId)
      .maybeSingle();

    const { error } = await supabase
      .from('conversations')
      .update({ status })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error updating conversation status:', error);
      throw error;
    }

    console.log(`[API] Conversation ${conversationId} status updated to ${status}`);

    // Side-effects: only when actually transitioning into 'human' from a different state.
    if (status === 'human' && prev && prev.status !== 'human' && prev.contact_id) {
      try {
        // 1) Friendly message to the customer (queued via send_queue).
        await supabase.from('send_queue').insert({
          conversation_id: conversationId,
          contact_id: prev.contact_id,
          content: 'Olá! Um de nossos atendentes acabou de entrar na conversa e vai te ajudar a partir de agora. ✨',
          from_type: 'human',
          message_type: 'text',
          priority: 2,
          metadata: { reason: 'human_takeover_announcement' },
        });

        // 2) Internal notification for the team.
        const c: any = (prev as any).contacts;
        const contactName = c?.name || c?.call_name || c?.phone_number || 'Cliente';
        await supabase.from('notifications').insert({
          type: 'human_takeover',
          title: `Atendente assumiu: ${contactName}`,
          body: 'A conversa foi transferida para atendimento humano.',
          conversation_id: conversationId,
          contact_id: prev.contact_id,
          metadata: { triggered_by: 'manual' },
        });

        // 3) Trigger the sender so the message goes out without waiting for the cron.
        const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
        if (projectId) {
          fetch(`https://${projectId}.supabase.co/functions/v1/whatsapp-sender`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).catch((e) => console.warn('[API] whatsapp-sender trigger failed:', e));
        }
      } catch (sideErr) {
        console.error('[API] Side-effect on takeover failed:', sideErr);
      }
    }
  },

  /**
   * Finalize a conversation (soft-close, marks as inactive)
   */
  endConversation: async (
    conversationId: string,
    options?: { sendClosingMessage?: boolean },
  ): Promise<void> => {
    const sendClosingMessage = options?.sendClosingMessage !== false;
    if (sendClosingMessage) {
      // Send a short closing message to the customer before marking the conversation inactive.
      // We reuse the regular sendMessage pipeline so the message appears in chat history,
      // is delivered via WhatsApp, and gets the attendant name prefix.
      try {
        const { CLOSING_MESSAGE_TEXT } = await import('@/constants');
        await api.sendMessage(conversationId, CLOSING_MESSAGE_TEXT);
      } catch (closingErr) {
        // Don't block the close action if the closing message fails to enqueue.
        console.error('[API] Failed to send closing message, proceeding to finalize:', closingErr);
      }
    }

    const { error } = await supabase
      .from('conversations')
      .update({ is_active: false, status: 'paused' })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error ending conversation:', error);
      throw error;
    }
    console.log(`[API] Conversation ${conversationId} finalized`);
  },

  /**
   * Reopen a previously finalized conversation
   */
  reopenConversation: async (conversationId: string): Promise<void> => {
    const { error } = await supabase
      .from('conversations')
      .update({ is_active: true, status: 'human' })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error reopening conversation:', error);
      throw error;
    }
    console.log(`[API] Conversation ${conversationId} reopened`);
  },

  /**
   * Mark all unread messages in a conversation as read
   */
  markMessagesAsRead: async (conversationId: string): Promise<void> => {
    const { error } = await supabase
      .from('messages')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('from_type', 'user')
      .in('status', ['sent', 'delivered']);

    if (error) {
      console.error('[API] Error marking messages as read:', error);
      throw error;
    }

    console.log(`[API] Messages marked as read for conversation ${conversationId}`);
  },

  /**
   * Assign conversation to a team member and sync with deal
   */
  assignConversation: async (conversationId: string, userId: string | null, contactId: string): Promise<void> => {
    // Update conversation
    const { error: convError } = await supabase
      .from('conversations')
      .update({ assigned_user_id: userId })
      .eq('id', conversationId);

    if (convError) {
      console.error('[API] Error assigning conversation:', convError);
      throw convError;
    }

    // Update deal(s) with same contact_id
    const { error: dealError } = await supabase
      .from('deals')
      .update({ owner_id: userId })
      .eq('contact_id', contactId);

    if (dealError) {
      console.error('[API] Error updating deal owner:', dealError);
      throw dealError;
    }

    console.log(`[API] Conversation ${conversationId} and deals assigned to user ${userId}`);
  },

  /**
   * Update contact notes
   */
  updateContactNotes: async (contactId: string, notes: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ notes })
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error updating contact notes:', error);
      throw error;
    }
  },

  /**
   * Update contact basic fields (name, email)
   */
  updateContact: async (
    contactId: string,
    fields: { name?: string | null; email?: string | null; isBusiness?: boolean; companyName?: string | null }
  ): Promise<void> => {
    const payload: Record<string, any> = {};
    if (fields.name !== undefined) payload.name = fields.name?.trim() || null;
    if (fields.email !== undefined) payload.email = fields.email?.trim() || null;
    if (fields.isBusiness !== undefined) {
      payload.is_business = !!fields.isBusiness;
      if (!fields.isBusiness) payload.company_name = null;
    }
    if (fields.companyName !== undefined && fields.isBusiness !== false) {
      payload.company_name = fields.companyName?.trim() || null;
    }

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error updating contact:', error);
      throw error;
    }
  },

  /**
   * Delete contact and all related data (cascade)
   */
  deleteContact: async (contactId: string): Promise<void> => {
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone_number')
      .eq('id', contactId)
      .maybeSingle();

    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId);
    const convIds = (convs || []).map((c: any) => c.id);

    const { data: deals } = await supabase
      .from('deals')
      .select('id')
      .eq('contact_id', contactId);
    const dealIds = (deals || []).map((d: any) => d.id);

    if (convIds.length > 0) {
      // Limpa filas vinculadas à conversa antes de apagar mensagens (evita FK errors)
      await supabase.from('send_queue').delete().in('conversation_id', convIds);
      await supabase.from('nina_processing_queue').delete().in('conversation_id', convIds);

      // Limpa filas que referenciam mensagens via whatsapp_message_id (sem FK direto)
      const { data: msgs } = await supabase
        .from('messages')
        .select('whatsapp_message_id')
        .in('conversation_id', convIds)
        .not('whatsapp_message_id', 'is', null);
      const wamids = (msgs || [])
        .map((m: any) => m.whatsapp_message_id)
        .filter(Boolean);
      if (wamids.length > 0) {
        await supabase.from('message_processing_queue').delete().in('whatsapp_message_id', wamids);
        await supabase.from('message_grouping_queue').delete().in('whatsapp_message_id', wamids);
      }

      await supabase.from('messages').delete().in('conversation_id', convIds);
      await supabase.from('conversation_states').delete().in('conversation_id', convIds);
    }

    await supabase.from('conversation_activities').delete().eq('contact_id', contactId);

    if (convIds.length > 0) {
      await supabase.from('conversations').delete().in('id', convIds);
    }

    if (dealIds.length > 0) {
      await supabase.from('deal_activities').delete().in('deal_id', dealIds);
    }
    await supabase.from('deals').delete().eq('contact_id', contactId);

    if (contact?.phone_number) {
      await supabase.from('contact_cooldowns').delete().eq('contact_phone', contact.phone_number);
    }

    await supabase.from('notifications').delete().eq('contact_id', contactId);

    const { error } = await supabase.from('contacts').delete().eq('id', contactId);
    if (error) {
      console.error('[API] Error deleting contact:', error);
      throw error;
    }
  },

  /**
   * Block/unblock contact
   */
  toggleContactBlock: async (contactId: string, blocked: boolean, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ 
        is_blocked: blocked,
        blocked_at: blocked ? new Date().toISOString() : null,
        blocked_reason: blocked ? reason : null
      })
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error toggling contact block:', error);
      throw error;
    }
  },

  /**
   * Fetch tag definitions
   */
  fetchTagDefinitions: async () => {
    const { data, error } = await supabase
      .from('tag_definitions')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true });
    
    if (error) {
      console.error('[API] Error fetching tag definitions:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Update contact tags
   */
  updateContactTags: async (contactId: string, tags: string[]): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ tags })
      .eq('id', contactId);
    
    if (error) {
      console.error('[API] Error updating contact tags:', error);
      throw error;
    }
  },

  /**
   * Create new tag definition
   */
  createTagDefinition: async (tag: { key: string; label: string; color: string; category: string }) => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('tag_definitions')
      .insert({
        key: tag.key,
        label: tag.label,
        color: tag.color,
        category: tag.category,
        is_active: true,
        user_id: null
      })
      .select()
      .single();
    
    if (error) {
      console.error('[API] Error creating tag definition:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch recent messages for a conversation (for deal drawer)
   */
  fetchConversationMessages: async (conversationId: string, limit: number = 10): Promise<any[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, from_type, type, sent_at, media_url')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[API] Error fetching conversation messages:', error);
      return [];
    }

    return (data || []).reverse(); // Reverter para ordem cronológica
  },
};
