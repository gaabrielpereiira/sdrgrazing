import React, { useEffect, useMemo, useState } from 'react';
import { Bot, User, LifeBuoy, TrendingUp, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '@/services/api';
import {
  SUPPORT_GROUPS,
  labelForCategory,
  labelForGroup,
  RESOLUTION_LABEL,
  type SupportResolutionStatus,
} from '@/lib/supportCategories';

type PeriodDays = 7 | 30 | 90;
type StatusFilter = 'all' | SupportResolutionStatus;

const GROUP_COLORS: Record<string, string> = {
  entrega: '#38bdf8',
  produto: '#a78bfa',
  pedido_pagamento: '#f59e0b',
  outros: '#64748b',
};

const SENTIMENT_LABEL: Record<string, string> = {
  calmo: 'Calmo',
  neutro: 'Neutro',
  frustrado: 'Frustrado',
  urgente: 'Urgente',
};

const SENTIMENT_COLOR: Record<string, string> = {
  calmo: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  neutro: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  frustrado: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  urgente: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const SupportReasonsDashboard: React.FC = () => {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.fetchSupportCasesSummary>> | null>(null);
  const [table, setTable] = useState<Awaited<ReturnType<typeof api.fetchSupportCasesList>>>({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.fetchSupportCasesSummary(period, status),
      api.fetchSupportCasesList(period, status, page, pageSize),
    ]).then(([s, t]) => {
      if (!alive) return;
      setSummary(s);
      setTable(t);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [period, status, page]);

  useEffect(() => { setPage(0); }, [period, status]);

  const iaPct = useMemo(() => {
    if (!summary || summary.total === 0) return 0;
    return Math.round((summary.resolvidoIa / summary.total) * 100);
  }, [summary]);

  const maxCategory = summary?.byCategory[0]?.total || 1;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 shadow-lg space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-rose-400" /> Motivos de Suporte (estruturado)
          </h3>
          <p className="text-sm text-slate-400">Distribuição por categoria, grupo, resolução e responsável</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {([7, 30, 90] as PeriodDays[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(['all', 'resolvido_pela_ia', 'encaminhado_agente'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  status === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s === 'all' ? 'Todos' : s === 'resolvido_pela_ia' ? 'IA' : 'Agente'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
        </div>
      )}

      {!loading && summary && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500 mb-1">Total no período</p>
              <p className="text-3xl font-bold text-white">{summary.total}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500 mb-1">IA vs Humano</p>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-emerald-400">{iaPct}%</span>
                <span className="text-xs text-slate-500">IA · {100 - iaPct}% agente</span>
              </div>
              <div className="mt-2 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500" style={{ width: `${iaPct}%` }} />
                <div className="bg-rose-500" style={{ width: `${100 - iaPct}%` }} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Maior crescimento
              </p>
              {summary.growth.category ? (
                <>
                  <p className="text-sm font-semibold text-white truncate">{labelForCategory(summary.growth.category)}</p>
                  <p className="text-xs text-emerald-400">+{summary.growth.deltaPct}% vs período anterior</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Sem dados suficientes</p>
              )}
            </div>
          </div>

          {/* By category + pie by group */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <h4 className="text-sm font-semibold text-white mb-4">Por categoria</h4>
              {summary.byCategory.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Nenhum chamado registrado no período.</p>
              ) : (
                <div className="space-y-3">
                  {summary.byCategory.map((c) => {
                    const pct = (c.total / maxCategory) * 100;
                    const iaHeavy = c.ia >= c.humano;
                    return (
                      <div key={c.key}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            {iaHeavy ? <Bot className="w-3.5 h-3.5 text-emerald-400" /> : <User className="w-3.5 h-3.5 text-rose-400" />}
                            <span>{labelForCategory(c.key)}</span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {c.total} <span className="text-slate-600">({c.ia} IA · {c.humano} agente)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${iaHeavy ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <h4 className="text-sm font-semibold text-white mb-4">Por grupo</h4>
              {summary.byGroup.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">—</p>
              ) : (
                <>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summary.byGroup.map((g) => ({ name: labelForGroup(g.key), value: g.count, key: g.key }))}
                          dataKey="value"
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={2}
                        >
                          {summary.byGroup.map((g) => (
                            <Cell key={g.key} fill={GROUP_COLORS[g.key] || '#64748b'} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#f8fafc' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {SUPPORT_GROUPS.map((g) => {
                      const row = summary.byGroup.find((x) => x.key === g.key);
                      const count = row?.count || 0;
                      const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
                      return (
                        <div key={g.key} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[g.key] }} />
                            <span className="text-slate-300">{g.label}</span>
                          </div>
                          <span className="text-slate-500">{count} · {pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white">Chamados recentes</h4>
              <span className="text-xs text-slate-500">{table.total} chamados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Data</th>
                    <th className="px-4 py-2 text-left">Categoria</th>
                    <th className="px-4 py-2 text-left">Responsável</th>
                    <th className="px-4 py-2 text-left">Resumo</th>
                    <th className="px-4 py-2 text-left">Sentimento</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        Nenhum chamado.
                      </td>
                    </tr>
                  ) : (
                    table.rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/30">
                        <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2 text-slate-200">{labelForCategory(r.categoria_suporte)}</td>
                        <td className="px-4 py-2 text-slate-400">{r.responsavel_name || '—'}</td>
                        <td className="px-4 py-2 text-slate-300 max-w-md truncate">{r.resumo || '—'}</td>
                        <td className="px-4 py-2">
                          {r.sentimento && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] border ${SENTIMENT_COLOR[r.sentimento] || SENTIMENT_COLOR.neutro}`}>
                              {SENTIMENT_LABEL[r.sentimento] || r.sentimento}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                            r.status_resolucao === 'resolvido_pela_ia'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {RESOLUTION_LABEL[r.status_resolucao as SupportResolutionStatus] || r.status_resolucao}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {table.total > pageSize && (
              <div className="flex items-center justify-between p-3 border-t border-slate-800 text-xs">
                <span className="text-slate-500">Página {page + 1} de {Math.ceil(table.total / pageSize)}</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="px-3 py-1 rounded-md bg-slate-800 text-slate-300 disabled:opacity-40"
                  >Anterior</button>
                  <button
                    disabled={(page + 1) * pageSize >= table.total}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 rounded-md bg-slate-800 text-slate-300 disabled:opacity-40"
                  >Próxima</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SupportReasonsDashboard;
