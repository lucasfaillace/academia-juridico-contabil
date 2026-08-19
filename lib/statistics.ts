export type StatisticsPeriod = "7" | "30" | "90" | "365" | "all";

export type StatisticsArticle = {
  slug: string;
  title: string;
};

export type StatisticsPoint = {
  slug: string;
  date: string;
  views: number;
};

export type TimePoint = {
  label: string;
  date: string;
  views: number;
};

function dateInBahia(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bahia",
  }).format(value);
}

function shiftDate(date: string, days: number) {
  const current = new Date(`${date}T12:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.max(1, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1);
}

function dateRange(start: string, end: string) {
  return Array.from({ length: daysBetween(start, end) }, (_, index) => shiftDate(start, index));
}

function periodStart(period: StatisticsPeriod, today: string, earliest: string | undefined) {
  if (period === "all") return earliest && earliest < today ? earliest : today;
  return shiftDate(today, -(Number(period) - 1));
}

function mondayFor(date: string) {
  const current = new Date(`${date}T12:00:00.000Z`);
  const weekday = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() - weekday + 1);
  return current.toISOString().slice(0, 10);
}

function aggregate(points: TimePoint[], unit: "week" | "month") {
  const totals = new Map<string, number>();
  for (const point of points) {
    const key = unit === "week" ? mondayFor(point.date) : point.date.slice(0, 7);
    totals.set(key, (totals.get(key) || 0) + point.views);
  }
  return Array.from(totals, ([date, views]) => ({
    date,
    label: unit === "week" ? `Semana de ${date.slice(8, 10)}/${date.slice(5, 7)}` : date,
    views,
  }));
}

export function buildStatistics(
  articles: StatisticsArticle[],
  rawPoints: StatisticsPoint[],
  period: StatisticsPeriod,
) {
  const today = dateInBahia();
  const earliest = rawPoints.map((point) => point.date).sort()[0];
  const start = periodStart(period, today, earliest);
  const selectedDates = dateRange(start, today);
  const last7Start = shiftDate(today, -6);
  const last30Start = shiftDate(today, -29);
  const currentWeekStart = mondayFor(today);
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const totalsByDate = new Map<string, number>();
  const totalsByArticle = new Map<string, Map<string, number>>();

  for (const point of rawPoints) {
    totalsByDate.set(point.date, (totalsByDate.get(point.date) || 0) + point.views);
    const articleDates = totalsByArticle.get(point.slug) || new Map<string, number>();
    articleDates.set(point.date, (articleDates.get(point.date) || 0) + point.views);
    totalsByArticle.set(point.slug, articleDates);
  }

  const daily = selectedDates.map((date) => ({
    date,
    label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
      .format(new Date(`${date}T12:00:00Z`)),
    views: totalsByDate.get(date) || 0,
  }));
  const selectedDays = selectedDates.length;
  const articleStatistics = articles.map((article) => {
    const dates = totalsByArticle.get(article.slug) || new Map<string, number>();
    const entries = Array.from(dates.entries());
    const totalViews = entries.reduce((sum, [, views]) => sum + views, 0);
    const views7 = entries.filter(([date]) => date >= last7Start && date <= today).reduce((sum, [, views]) => sum + views, 0);
    const views30 = entries.filter(([date]) => date >= last30Start && date <= today).reduce((sum, [, views]) => sum + views, 0);
    const periodViews = entries.filter(([date]) => date >= start && date <= today).reduce((sum, [, views]) => sum + views, 0);
    const viewedDates = entries.filter(([, views]) => views > 0).map(([date]) => date).sort();
    return {
      ...article,
      totalViews,
      views7,
      views30,
      periodViews,
      lastViewedAt: viewedDates.at(-1) || null,
      dailyAverage: Number((periodViews / selectedDays).toFixed(2)),
      trend: selectedDates.map((date) => ({ date, views: dates.get(date) || 0 })),
    };
  });

  const totalViews = rawPoints.reduce((sum, point) => sum + point.views, 0);
  const viewsBetween = (from: string) => rawPoints
    .filter((point) => point.date >= from && point.date <= today)
    .reduce((sum, point) => sum + point.views, 0);
  const ranked = [...articleStatistics].sort((a, b) => b.totalViews - a.totalViews || a.title.localeCompare(b.title, "pt-BR"));

  return {
    generatedAt: new Date().toISOString(),
    period: { value: period, start, end: today, days: selectedDays },
    overview: {
      totalViews,
      periodViews: daily.reduce((sum, point) => sum + point.views, 0),
      todayViews: totalsByDate.get(today) || 0,
      currentWeekViews: viewsBetween(currentWeekStart),
      currentMonthViews: viewsBetween(currentMonthStart),
      last7Views: viewsBetween(last7Start),
      last30Views: viewsBetween(last30Start),
    },
    daily,
    weekly: aggregate(daily, "week"),
    monthly: aggregate(daily, "month"),
    articles: ranked,
    mostViewed: ranked.slice(0, 5),
    leastViewed: [...ranked].sort((a, b) => a.totalViews - b.totalViews || a.title.localeCompare(b.title, "pt-BR")).slice(0, 5),
  };
}

export function viewDateInBahia() {
  return dateInBahia();
}
