"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TimePoint = { date: string; label: string; views: number };
type ArticleStatistic = {
  slug: string;
  title: string;
  totalViews: number;
  views7: number;
  views30: number;
  periodViews: number;
  lastViewedAt: string | null;
  dailyAverage: number;
  trend: { date: string; views: number }[];
};
type Statistics = {
  period: { value: string; start: string; end: string; days: number };
  overview: {
    totalViews: number;
    periodViews: number;
    todayViews: number;
    currentWeekViews: number;
    currentMonthViews: number;
    last7Views: number;
    last30Views: number;
  };
  daily: TimePoint[];
  weekly: TimePoint[];
  monthly: TimePoint[];
  articles: ArticleStatistic[];
  mostViewed: ArticleStatistic[];
  leastViewed: ArticleStatistic[];
  ga4Configured: boolean;
};

function number(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function date(value: string | null) {
  if (!value) return "Ainda não houve acesso";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function pointsFor(values: { views: number }[], width: number, height: number, padding: number) {
  const maximum = Math.max(1, ...values.map((point) => point.views));
  return values.map((point, index) => {
    const x = values.length <= 1 ? padding : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - (point.views / maximum) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function AccessChart({ data, label, compact = false }: { data: { views: number }[]; label: string; compact?: boolean }) {
  const width = compact ? 150 : 820;
  const height = compact ? 38 : 260;
  const padding = compact ? 3 : 24;
  const points = pointsFor(data, width, height, padding);
  const maximum = Math.max(0, ...data.map((point) => point.views));
  if (!data.length) return <span className="statistics-empty-chart">Sem dados</span>;
  return (
    <svg className={compact ? "statistics-sparkline" : "statistics-chart"} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. Maior valor: ${maximum} visualizações.`}>
      {!compact && <><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} /><line x1={padding} y1={padding} x2={padding} y2={height - padding} /></>}
      <polyline points={points} />
    </svg>
  );
}

export function StatisticsDashboard() {
  const [period, setPeriod] = useState("30");
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");
  const [statistics, setStatistics] = useState<Statistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/admin/statistics?period=${period}`, { cache: "no-store" });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "Não foi possível carregar as estatísticas.");
      return;
    }
    setStatistics(data);
  }, [period]);

  // A carga assíncrona é disparada quando o período muda.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const chartData = useMemo(() => statistics?.[granularity] || [], [granularity, statistics]);

  if (loading && !statistics) return <p className="admin-notice">Carregando estatísticas…</p>;
  if (error) return <p className="admin-notice" role="alert">{error}</p>;
  if (!statistics) return null;

  return (
    <div className="statistics-dashboard">
      <div className="statistics-controls">
        <label>Período analisado
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="365">Últimos 12 meses</option>
            <option value="all">Todo o período</option>
          </select>
        </label>
        <span className={`ga-status ${statistics.ga4Configured ? "configured" : ""}`}>
          Google Analytics 4: {statistics.ga4Configured ? "configurado" : "aguardando identificador"}
        </span>
      </div>

      <div className="statistics-summary">
        <section><span>{number(statistics.overview.totalViews)}</span><h2>Total geral</h2><p>Desde o início da medição.</p></section>
        <section><span>{number(statistics.overview.periodViews)}</span><h2>No período</h2><p>Intervalo selecionado.</p></section>
        <section><span>{number(statistics.overview.todayViews)}</span><h2>Hoje</h2><p>Visualizações registradas.</p></section>
        <section><span>{number(statistics.overview.currentWeekViews)}</span><h2>Semana atual</h2><p>Desde segunda-feira.</p></section>
        <section><span>{number(statistics.overview.currentMonthViews)}</span><h2>Mês atual</h2><p>Desde o primeiro dia.</p></section>
      </div>

      <section className="admin-section statistics-evolution">
        <div className="admin-section-heading">
          <div><h2>Evolução dos acessos</h2><p>Contagens aceitas pelo sistema interno.</p></div>
          <div className="statistics-granularity" aria-label="Agrupamento do gráfico">
            <button type="button" className={granularity === "daily" ? "active" : ""} onClick={() => setGranularity("daily")}>Dia</button>
            <button type="button" className={granularity === "weekly" ? "active" : ""} onClick={() => setGranularity("weekly")}>Semana</button>
            <button type="button" className={granularity === "monthly" ? "active" : ""} onClick={() => setGranularity("monthly")}>Mês</button>
          </div>
        </div>
        <AccessChart data={chartData} label="Gráfico de evolução das visualizações" />
        <div className="statistics-chart-legend"><span>{chartData[0]?.label}</span><strong>Pico: {number(Math.max(0, ...chartData.map((point) => point.views)))}</strong><span>{chartData.at(-1)?.label}</span></div>
      </section>

      <div className="statistics-rankings">
        <section className="admin-section">
          <h2>Artigos mais acessados</h2>
          <ol>{statistics.mostViewed.map((article) => <li key={article.slug}><span>{article.title}</span><strong>{number(article.totalViews)}</strong></li>)}</ol>
        </section>
        <section className="admin-section">
          <h2>Artigos menos acessados</h2>
          <ol>{statistics.leastViewed.map((article) => <li key={article.slug}><span>{article.title}</span><strong>{number(article.totalViews)}</strong></li>)}</ol>
        </section>
      </div>

      <section className="admin-section article-statistics">
        <div className="admin-section-heading"><div><h2>Estatísticas por artigo</h2><p>A média diária considera o período selecionado.</p></div></div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Artigo</th><th>Total</th><th>7 dias</th><th>30 dias</th><th>Última visualização</th><th>Média diária</th><th>Evolução</th></tr></thead>
            <tbody>
              {statistics.articles.map((article) => (
                <tr key={article.slug}>
                  <td>{article.title}</td>
                  <td>{number(article.totalViews)}</td>
                  <td>{number(article.views7)}</td>
                  <td>{number(article.views30)}</td>
                  <td>{date(article.lastViewedAt)}</td>
                  <td>{number(article.dailyAverage)}</td>
                  <td><AccessChart compact data={article.trend} label={`Evolução de ${article.title}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="statistics-privacy-note">A contagem interna não armazena IP completo, ignora administradores autenticados e elimina hashes de deduplicação após 48 horas. Os números podem diferir do Google Analytics porque os critérios são distintos.</p>
    </div>
  );
}
