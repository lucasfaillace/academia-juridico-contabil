import assert from "node:assert/strict";
import test from "node:test";

import { buildStatistics } from "../lib/statistics.ts";

function todayInBahia() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bahia",
  }).format(new Date());
}

test("preserva totais históricos quando os pontos recebidos já estão limitados ao período", () => {
  const today = todayInBahia();
  const statistics = buildStatistics(
    [{ slug: "artigo", title: "Artigo" }],
    [{ slug: "artigo", date: today, views: 3 }],
    "7",
    [{ slug: "artigo", totalViews: 120, views7: 8, views30: 21, lastViewedAt: today }],
  );

  assert.equal(statistics.overview.totalViews, 120);
  assert.equal(statistics.overview.periodViews, 3);
  assert.equal(statistics.overview.last7Views, 8);
  assert.equal(statistics.overview.last30Views, 21);
  assert.equal(statistics.articles[0].totalViews, 120);
  assert.equal(statistics.articles[0].views7, 8);
  assert.equal(statistics.articles[0].views30, 21);
  assert.equal(statistics.articles[0].periodViews, 3);
  assert.equal(statistics.articles[0].lastViewedAt, today);
});

test("agrega meses de visualizações diárias sem depender dos eventos brutos", () => {
  const today = todayInBahia();
  const articles = Array.from({ length: 250 }, (_, index) => ({ slug: `artigo-${index}`, title: `Artigo ${index}` }));
  const points = articles.flatMap((article, articleIndex) => Array.from({ length: 365 }, (_, offset) => {
    const date = new Date(`${today}T12:00:00-03:00`);
    date.setDate(date.getDate() - offset);
    return { slug: article.slug, date: date.toISOString().slice(0, 10), views: (articleIndex + offset) % 7 };
  }));
  const statistics = buildStatistics(articles, points, "365");
  assert.equal(statistics.articles.length, 250);
  assert.equal(statistics.daily.length, 365);
  assert.equal(statistics.articles[0].trend.length, 365);
  assert.equal(statistics.overview.periodViews, points.reduce((sum, point) => sum + point.views, 0));
});
