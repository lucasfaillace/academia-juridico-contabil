import "server-only";

import { readPreviewDataFile, writePreviewDataFile } from "./preview-file-store";
import type { StatisticsPoint } from "./statistics";

type PreviewView = {
  slug: string;
  viewedAt: string;
  viewedOn: string;
  dedupeKey: string | null;
};

const previewViewsFilename = "views.json";
const legacyPreviewViewsPath = "/tmp/academia-preview-views.json";

async function readViews(): Promise<PreviewView[]> {
  try {
    const value = JSON.parse(await readPreviewDataFile(previewViewsFilename, legacyPreviewViewsPath)) as PreviewView[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function writeViews(views: PreviewView[]) {
  await writePreviewDataFile(previewViewsFilename, `${JSON.stringify(views, null, 2)}\n`);
}

export async function savePreviewView(input: PreviewView) {
  const expiry = Date.now() - 48 * 60 * 60 * 1000;
  const views = (await readViews()).map((view) => ({
    ...view,
    dedupeKey: Date.parse(view.viewedAt) < expiry ? null : view.dedupeKey,
  }));
  if (views.some((view) => view.dedupeKey === input.dedupeKey)) return false;
  views.push(input);
  await writeViews(views);
  return true;
}

export async function listPreviewViewPoints(): Promise<StatisticsPoint[]> {
  const totals = new Map<string, number>();
  for (const view of await readViews()) {
    const key = `${view.slug}\u0000${view.viewedOn}`;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  return Array.from(totals, ([key, views]) => {
    const [slug, date] = key.split("\u0000");
    return { slug, date, views };
  });
}
