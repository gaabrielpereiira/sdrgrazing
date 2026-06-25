import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Plus, Trash2, Calendar } from 'lucide-react';
import { Button } from '../Button';
import { api } from '../../services/api';
import type { Team } from '../../types';

interface Props {
  teams: Team[];
}

interface HourRow {
  day_of_week: number;
  is_open: boolean;
  start_time: string;
  end_time: string;
}

interface HolidayRow {
  id: string;
  team_id: string | null;
  date: string;
  name: string;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
}

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const defaultRows = (): HourRow[] =>
  Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    is_open: i >= 1 && i <= 5,
    start_time: '08:00',
    end_time: '18:00',
  }));

const TeamHoursTab: React.FC<Props> = ({ teams }) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [rows, setRows] = useState<HourRow[]>(defaultRows());
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  useEffect(() => {
    if (teams.length && !selectedTeamId) setSelectedTeamId(teams[0].id);
  }, [teams, selectedTeamId]);

  const load = async (teamId: string) => {
    setLoading(true);
    try {
      const [hours, hols] = await Promise.all([
        api.fetchTeamBusinessHours(teamId),
        api.fetchTeamHolidays(teamId),
      ]);
      const base = defaultRows();
      hours.forEach((h: any) => {
        const idx = base.findIndex(r => r.day_of_week === h.day_of_week);
        if (idx >= 0) base[idx] = {
          day_of_week: h.day_of_week,
          is_open: h.is_open,
          start_time: (h.start_time || '08:00').slice(0, 5),
          end_time: (h.end_time || '18:00').slice(0, 5),
        };
      });
      setRows(base);
      setHolidays(hols as HolidayRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTeamId) load(selectedTeamId);
  }, [selectedTeamId]);

  const updateRow = (day: number, patch: Partial<HourRow>) => {
    setRows(prev => prev.map(r => (r.day_of_week === day ? { ...r, ...patch } : r)));
  };

  const applyPreset = (preset: 'weekdays' | 'monsat' | 'allweek' | 'clear') => {
    setRows(prev => prev.map(r => {
      if (preset === 'clear') return { ...r, is_open: false };
      if (preset === 'weekdays') return { ...r, is_open: r.day_of_week >= 1 && r.day_of_week <= 5 };
      if (preset === 'monsat')   return { ...r, is_open: r.day_of_week >= 1 && r.day_of_week <= 6 };
      return { ...r, is_open: true };
    }));
  };

  const saveAll = async () => {
    if (!selectedTeamId) return;
    setSaving(true);
    try {
      await api.saveTeamBusinessHoursWeek(selectedTeamId, rows);
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!newHoliday.date || !newHoliday.name.trim()) return;
    await api.createTeamHoliday({
      team_id: selectedTeamId,
      date: newHoliday.date,
      name: newHoliday.name.trim(),
      is_open: false,
    });
    setNewHoliday({ date: '', name: '' });
    load(selectedTeamId);
  };

  const removeHoliday = async (id: string) => {
    await api.deleteTeamHoliday(id);
    setHolidays(prev => prev.filter(h => h.id !== id));
  };

  const teamName = useMemo(
    () => teams.find(t => t.id === selectedTeamId)?.name || '',
    [teams, selectedTeamId],
  );

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Departamento</label>
        <select
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-brand-gold-500" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => applyPreset('weekdays')} className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700">Seg–Sex</button>
            <button onClick={() => applyPreset('monsat')} className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700">Seg–Sáb</button>
            <button onClick={() => applyPreset('allweek')} className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700">Todos os dias</button>
            <button onClick={() => applyPreset('clear')} className="text-xs px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700">Fechar todos</button>
          </div>

          <div className="bg-slate-800/30 border border-slate-700 rounded-lg divide-y divide-slate-700/60">
            {rows.map(r => (
              <div key={r.day_of_week} className="flex items-center gap-3 px-3 py-2.5">
                <label className="flex items-center gap-2 w-28">
                  <input
                    type="checkbox"
                    checked={r.is_open}
                    onChange={(e) => updateRow(r.day_of_week, { is_open: e.target.checked })}
                    className="accent-brand-gold-500"
                  />
                  <span className="text-sm text-slate-200">{DAY_NAMES[r.day_of_week]}</span>
                </label>
                <input
                  type="time"
                  value={r.start_time}
                  disabled={!r.is_open}
                  onChange={(e) => updateRow(r.day_of_week, { start_time: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white disabled:opacity-40"
                />
                <span className="text-slate-500 text-sm">às</span>
                <input
                  type="time"
                  value={r.end_time}
                  disabled={!r.is_open}
                  onChange={(e) => updateRow(r.day_of_week, { end_time: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white disabled:opacity-40"
                />
                {!r.is_open && <span className="ml-auto text-xs text-slate-500">Fechado</span>}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveAll} disabled={saving} size="sm">
              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Salvar horários
            </Button>
          </div>

          {/* Holidays */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h4 className="text-sm font-medium text-white">Feriados de {teamName}</h4>
            </div>
            <p className="text-xs text-slate-500 mb-3">Datas em que o departamento fica fechado.</p>

            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={newHoliday.date}
                onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
              />
              <input
                type="text"
                placeholder="Nome (ex: Natal)"
                value={newHoliday.name}
                onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
              />
              <button onClick={addHoliday} className="px-3 py-1.5 rounded bg-brand-gold-500/20 border border-brand-gold-500/40 text-brand-gold-300 hover:bg-brand-gold-500/30 text-sm flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>

            {holidays.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhum feriado cadastrado.</p>
            ) : (
              <div className="space-y-1">
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded px-3 py-2 text-sm">
                    <div>
                      <span className="text-white font-medium">{new Date(h.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      <span className="text-slate-400 ml-2">— {h.name}</span>
                      {h.team_id === null && <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">global</span>}
                    </div>
                    <button onClick={() => removeHoliday(h.id)} className="text-slate-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TeamHoursTab;
