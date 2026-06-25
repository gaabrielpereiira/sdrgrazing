// Shared business-hours helpers for team-aware scheduling.
// Reads per-team hours from `team_business_hours` and overrides from
// `team_holidays`. Falls back to nina_settings global hours when no team
// rows are configured.

export type BusinessHoursStatus = {
  isOpen: boolean;
  // Friendly description of next opening, e.g. "hoje às 08:00" /
  // "amanhã (segunda-feira) às 08:00".
  nextOpenLabel: string;
  teamName: string | null;
  weekday: number; // 0..6 in tz
  nowHHMM: string; // "HH:MM" in tz
  timezone: string;
  // Hours window applied for "today" (after holiday override).
  todayStart: string | null;
  todayEnd: string | null;
  source: 'team_hours' | 'holiday' | 'global_fallback' | 'closed_default';
};

const DAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WK_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function nowParts(tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const wk = parts.find(p => p.type === 'weekday')?.value || 'Mon';
  const h = parts.find(p => p.type === 'hour')?.value || '00';
  const m = parts.find(p => p.type === 'minute')?.value || '00';
  const y = parts.find(p => p.type === 'year')?.value || '1970';
  const mo = parts.find(p => p.type === 'month')?.value || '01';
  const d = parts.find(p => p.type === 'day')?.value || '01';
  return {
    weekday: WK_MAP[wk] ?? 1,
    nowHHMM: `${h === '24' ? '00' : h}:${m}`,
    ymd: `${y}-${mo}-${d}`,
  };
}

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Resolve a team id from a conversation. Supports either:
//  - conversation.assigned_team as text label ('suporte' -> "Produção"; otherwise "Comercial")
//  - explicit team_id column on conversation (future-proof)
export async function resolveTeamForConversation(
  supabase: any,
  conversation: any,
): Promise<{ id: string; name: string } | null> {
  // Map text label to team name
  const label = (conversation?.assigned_team || '').toString().toLowerCase();
  let targetName: string | null = null;
  if (label === 'suporte' || label === 'producao' || label === 'produção') {
    targetName = 'Produção';
  } else if (label === 'comercial' || label === 'vendas' || label === 'sales') {
    targetName = 'Comercial';
  } else {
    // Default routing: Comercial handles new leads/general chat
    targetName = 'Comercial';
  }

  const { data } = await supabase
    .from('teams')
    .select('id, name')
    .ilike('name', targetName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function getTeamBusinessHoursStatus(
  supabase: any,
  teamId: string | null,
  teamName: string | null,
  settings: any,
): Promise<BusinessHoursStatus> {
  const tz = settings?.timezone || 'America/Sao_Paulo';
  const { weekday, nowHHMM, ymd } = nowParts(tz);

  let todayStart: string | null = null;
  let todayEnd: string | null = null;
  let source: BusinessHoursStatus['source'] = 'closed_default';
  let isOpenToday = false;

  // 1) Holiday override (team-specific or global)
  if (teamId) {
    const { data: holiday } = await supabase
      .from('team_holidays')
      .select('is_open, start_time, end_time, team_id')
      .or(`team_id.eq.${teamId},team_id.is.null`)
      .eq('date', ymd)
      .order('team_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (holiday) {
      source = 'holiday';
      if (holiday.is_open && holiday.start_time && holiday.end_time) {
        todayStart = holiday.start_time.slice(0, 5);
        todayEnd = holiday.end_time.slice(0, 5);
        isOpenToday = true;
      } else {
        isOpenToday = false;
      }
    }
  }

  // 2) team_business_hours for today
  if (source !== 'holiday' && teamId) {
    const { data: row } = await supabase
      .from('team_business_hours')
      .select('is_open, start_time, end_time')
      .eq('team_id', teamId)
      .eq('day_of_week', weekday)
      .maybeSingle();
    if (row) {
      source = 'team_hours';
      isOpenToday = !!row.is_open;
      if (isOpenToday) {
        todayStart = row.start_time?.slice(0, 5) || null;
        todayEnd = row.end_time?.slice(0, 5) || null;
      }
    }
  }

  // 3) Global fallback from nina_settings
  if (source === 'closed_default' && settings?.business_hours_start && settings?.business_hours_end) {
    const days: number[] = Array.isArray(settings.business_days) ? settings.business_days : [1, 2, 3, 4, 5];
    if (days.includes(weekday)) {
      todayStart = settings.business_hours_start.slice(0, 5);
      todayEnd = settings.business_hours_end.slice(0, 5);
      isOpenToday = true;
    }
    source = 'global_fallback';
  }

  const within = isOpenToday && !!todayStart && !!todayEnd && nowHHMM >= todayStart && nowHHMM < todayEnd;

  // 4) Compute next opening (lookahead up to 14 days)
  let nextOpenLabel = '';
  if (!within) {
    // If today is open but we're before start, that's the next slot
    if (isOpenToday && todayStart && nowHHMM < todayStart) {
      nextOpenLabel = `hoje às ${todayStart}`;
    } else {
      for (let i = 1; i <= 14; i++) {
        const futureYmd = addDaysIso(ymd, i);
        const futureWeekday = (weekday + i) % 7;
        let openInfo: { start: string; end: string } | null = null;
        // holiday lookup
        if (teamId) {
          const { data: h } = await supabase
            .from('team_holidays')
            .select('is_open, start_time, end_time')
            .or(`team_id.eq.${teamId},team_id.is.null`)
            .eq('date', futureYmd)
            .limit(1)
            .maybeSingle();
          if (h) {
            if (h.is_open && h.start_time && h.end_time) {
              openInfo = { start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) };
            } else {
              continue; // closed holiday
            }
          }
        }
        if (!openInfo && teamId) {
          const { data: r } = await supabase
            .from('team_business_hours')
            .select('is_open, start_time, end_time')
            .eq('team_id', teamId)
            .eq('day_of_week', futureWeekday)
            .maybeSingle();
          if (r?.is_open) {
            openInfo = { start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) };
          }
        }
        if (openInfo) {
          const label = i === 1
            ? `amanhã (${DAY_NAMES[futureWeekday]}) às ${openInfo.start}`
            : `${DAY_NAMES[futureWeekday]} às ${openInfo.start}`;
          nextOpenLabel = label;
          break;
        }
      }
    }
  }

  return {
    isOpen: within,
    nextOpenLabel,
    teamName: teamName || null,
    weekday,
    nowHHMM,
    timezone: tz,
    todayStart,
    todayEnd,
    source,
  };
}
