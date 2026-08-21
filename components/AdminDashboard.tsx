"use client";

import Image from "next/image";
import { BarChart3, Bold, BookOpen, ClipboardList, Copy, Download, Eye, FileText, Italic, LayoutDashboard, Library, Link2, LogOut, MessageSquare, Pencil, Plus, Save, Settings, Tags, Trash2, Upload, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PublicationReferenceEditor } from "./PublicationReferenceEditor";
import { RichEditor, type BibliographicReference } from "./RichEditor";
import { StatisticsDashboard } from "./StatisticsDashboard";
import { extractFootnoteReferenceLinks } from "@/lib/bibliographic-references";

type AdminArticle = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  content_html?: string;
  youtube_url?: string;
  author_name?: string;
  author_names?: string[];
  tags?: AdminTag[];
  bibliographicReferences?: BibliographicReference[];
  category: string;
  status: "draft" | "published";
  updated_at: string;
};

type TagKind = "juridica" | "contabil" | "geral";
type AdminTag = { id: string; name: string; slug: string; kind: TagKind; articleCount?: number };
type AdminComment = {
  id: string;
  articleSlug: string;
  articleTitle: string;
  authorName: string;
  body: string;
  isAdmin: boolean;
  status: "published" | "hidden";
  createdAt: string;
};
type AdminPublication = {
  id: string;
  reference_html: string;
  pdf_key: string | null;
  external_url: string | null;
  publication_date: string;
  status: "draft" | "published";
  updated_at: string;
};
type ReferenceUsage = {
  articleSlug: string;
  articleTitle: string;
  footnoteId: string;
  noteNumber: number;
  citationDetails: string;
  occurrenceIndex: number;
};
type AdminReference = BibliographicReference & {
  usageCount: number;
  usages?: ReferenceUsage[];
  fichamentoCount: number;
  possibleDuplicates: Array<BibliographicReference & { similarity: number }>;
};
type ReferencePageResponse = {
  items: AdminReference[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
type FichamentoTopic = {
  id: string;
  name: string;
  normalizedName: string;
  usageCount?: number;
};
type FichamentoLinkSummary = {
  id: string;
  referenceId: string;
  referenceText: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
};
type ReferenceFichamento = {
  id: string;
  referenceId: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  topics: FichamentoTopic[];
  relatedFichamentos: FichamentoLinkSummary[];
  backlinks: FichamentoLinkSummary[];
  createdAt: string;
  updatedAt: string;
};

const emptyContent = "<p></p>";
const draftAutosaveDelay = 1800;

function articleDraftFingerprint(input: {
  title: string;
  summary: string;
  youtubeUrl: string;
  category: string;
  authors: string[];
  tagSlugs: string[];
  content: string;
}) {
  return JSON.stringify(input);
}

function normalizeAdminSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function formattedPersonalNote(value: string) {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replaceAll("\n", "<br />");
}

export function AdminDashboard({
  defaultAuthorName,
  initialArticleSlug,
}: {
  defaultAuthorName: string;
  initialArticleSlug?: string;
}) {
  const [tab, setTab] = useState("dashboard");
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articlePage, setArticlePage] = useState(1);
  const [articlePageCount, setArticlePageCount] = useState(1);
  const [articleTotal, setArticleTotal] = useState(0);
  const [articleTotals, setArticleTotals] = useState({ all: 0, published: 0 });
  const [articleQuery, setArticleQuery] = useState("");
  const [articleStatusFilter, setArticleStatusFilter] = useState<"all" | AdminArticle["status"]>("all");
  const [articleTagFilter, setArticleTagFilter] = useState("all");
  const [articleUpdatedFilter, setArticleUpdatedFilter] = useState("all");
  const [html, setHtml] = useState(emptyContent);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [category, setCategory] = useState("");
  const [authors, setAuthors] = useState([defaultAuthorName]);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagKind, setTagKind] = useState<TagKind>("juridica");
  const [editingTagId, setEditingTagId] = useState<string>();
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<string>();
  const [commentDraft, setCommentDraft] = useState("");
  const [publications, setPublications] = useState<AdminPublication[]>([]);
  const [references, setReferences] = useState<AdminReference[]>([]);
  const [editorReferences, setEditorReferences] = useState<BibliographicReference[]>([]);
  const [referencePage, setReferencePage] = useState(1);
  const [referencePageCount, setReferencePageCount] = useState(1);
  const [referenceTotal, setReferenceTotal] = useState(0);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [loadingReferenceDetailId, setLoadingReferenceDetailId] = useState<string>();
  const [referenceQuery, setReferenceQuery] = useState("");
  const [bibliographicReferenceDraft, setBibliographicReferenceDraft] = useState("");
  const [editingReferenceId, setEditingReferenceId] = useState<string>();
  const [similarReferenceWarnings, setSimilarReferenceWarnings] = useState<BibliographicReference[]>([]);
  const [activeFichamentoReferenceId, setActiveFichamentoReferenceId] = useState<string>();
  const [referenceFichamentos, setReferenceFichamentos] = useState<Record<string, ReferenceFichamento[]>>({});
  const [fichamentoQuery, setFichamentoQuery] = useState("");
  const [editingFichamentoId, setEditingFichamentoId] = useState<string>();
  const [fichamentoLiteralQuote, setFichamentoLiteralQuote] = useState("");
  const [fichamentoParaphrase, setFichamentoParaphrase] = useState("");
  const [fichamentoLocation, setFichamentoLocation] = useState("");
  const [fichamentoPersonalNote, setFichamentoPersonalNote] = useState("");
  const fichamentoPersonalNoteRef = useRef<HTMLTextAreaElement>(null);
  const [allReferenceFichamentos, setAllReferenceFichamentos] = useState<ReferenceFichamento[]>([]);
  const [selectedRelatedFichamentoIds, setSelectedRelatedFichamentoIds] = useState<string[]>([]);
  const [relatedFichamentoQuery, setRelatedFichamentoQuery] = useState("");
  const [relatedFichamentoPickerOpen, setRelatedFichamentoPickerOpen] = useState(false);
  const [loadingRelatedFichamentos, setLoadingRelatedFichamentos] = useState(false);
  const [fichamentoTopics, setFichamentoTopics] = useState<FichamentoTopic[]>([]);
  const [selectedFichamentoTopicIds, setSelectedFichamentoTopicIds] = useState<string[]>([]);
  const [fichamentoTopicQuery, setFichamentoTopicQuery] = useState("");
  const [fichamentoTopicPickerOpen, setFichamentoTopicPickerOpen] = useState(false);
  const [referenceTopicQuery, setReferenceTopicQuery] = useState("");
  const [referenceFichamentoQuery, setReferenceFichamentoQuery] = useState("");
  const [selectedFichamentoFilterTopicIds, setSelectedFichamentoFilterTopicIds] = useState<string[]>([]);
  const [fichamentoFormOpen, setFichamentoFormOpen] = useState(false);
  const [newFichamentoTopicName, setNewFichamentoTopicName] = useState("");
  const [editingFichamentoTopicId, setEditingFichamentoTopicId] = useState<string>();
  const [editingFichamentoTopicName, setEditingFichamentoTopicName] = useState("");
  const [savingFichamentoTopic, setSavingFichamentoTopic] = useState(false);
  const [savingFichamento, setSavingFichamento] = useState(false);
  const [publicationId, setPublicationId] = useState<string>();
  const [referenceHtml, setReferenceHtml] = useState("<p></p>");
  const [publicationPdfKey, setPublicationPdfKey] = useState("");
  const [publicationUrl, setPublicationUrl] = useState("");
  const [publicationDate, setPublicationDate] = useState(new Date().toISOString().slice(0, 10));
  const [publicationStatus, setPublicationStatus] = useState<"draft" | "published">("draft");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [originalSlug, setOriginalSlug] = useState<string | undefined>();
  const [editingStatus, setEditingStatus] = useState<AdminArticle["status"]>("draft");
  const [focusedFootnote, setFocusedFootnote] = useState<{ id: string; requestId: string }>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [lastSavedDraft, setLastSavedDraft] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountCurrentPassword, setAccountCurrentPassword] = useState("");
  const [accountNewPassword, setAccountNewPassword] = useState("");
  const [accountPasswordConfirmation, setAccountPasswordConfirmation] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [analyticsMeasurementId, setAnalyticsMeasurementId] = useState("");
  const [analyticsStatus, setAnalyticsStatus] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const articleRequestController = useRef<AbortController | null>(null);
  const referenceRequestController = useRef<AbortController | null>(null);

  const loadArticles = useCallback(async () => {
    articleRequestController.current?.abort();
    const controller = new AbortController();
    articleRequestController.current = controller;
    setLoadingArticles(true);
    const parameters = new URLSearchParams({ page: String(articlePage), pageSize: "25" });
    if (articleQuery.trim()) parameters.set("q", articleQuery.trim());
    if (articleStatusFilter !== "all") parameters.set("status", articleStatusFilter);
    if (articleTagFilter !== "all") parameters.set("tag", articleTagFilter);
    if (articleUpdatedFilter !== "all") parameters.set("updatedDays", articleUpdatedFilter);
    try {
      const response = await fetch(`/api/articles?${parameters}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error || "Não foi possível carregar os artigos.");
        return;
      }
      setArticles(data.articles);
      setArticleTotal(data.total);
      setArticlePage(data.page);
      setArticlePageCount(data.pageCount);
      setArticleTotals(data.totals);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setNotice("Não foi possível carregar os artigos.");
      }
    } finally {
      if (articleRequestController.current === controller) setLoadingArticles(false);
    }
  }, [articlePage, articleQuery, articleStatusFilter, articleTagFilter, articleUpdatedFilter]);

  const loadTags = useCallback(async () => {
    const response = await fetch("/api/tags");
    const data = await response.json();
    if (response.ok) setTags(data);
    else setNotice(data.error || "Não foi possível carregar as tags.");
  }, []);

  const loadComments = useCallback(async () => {
    const response = await fetch("/api/admin/comments");
    const data = await response.json();
    if (response.ok) setComments(data.comments);
    else setNotice(data.error || "Não foi possível carregar os comentários.");
  }, []);

  const loadPublications = useCallback(async () => {
    const response = await fetch("/api/publications");
    const data = await response.json();
    if (response.ok) setPublications(data);
    else setNotice(data.error || "Não foi possível carregar as publicações.");
  }, []);

  const loadReferences = useCallback(async () => {
    referenceRequestController.current?.abort();
    const controller = new AbortController();
    referenceRequestController.current = controller;
    setLoadingReferences(true);
    const parameters = new URLSearchParams({
      page: String(referencePage),
      pageSize: "30",
    });
    if (referenceQuery.trim()) parameters.set("q", referenceQuery.trim());
    if (referenceFichamentoQuery.trim()) parameters.set("fichamentoQ", referenceFichamentoQuery.trim());
    if (selectedFichamentoFilterTopicIds.length) parameters.set("topicIds", selectedFichamentoFilterTopicIds.join(","));
    try {
      const response = await fetch(`/api/references?${parameters}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (response.ok) {
        const page = data as ReferencePageResponse;
        setReferences(page.items);
        setReferencePage(page.page);
        setReferencePageCount(page.pageCount);
        setReferenceTotal(page.total);
        setEditorReferences((current) => {
          const merged = new Map(current.map((reference) => [reference.id, reference]));
          for (const reference of page.items) merged.set(reference.id, reference);
          return Array.from(merged.values());
        });
      } else setNotice(data.error || "Não foi possível carregar as referências.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setNotice("Não foi possível carregar as referências.");
      }
    } finally {
      if (referenceRequestController.current === controller) setLoadingReferences(false);
    }
  }, [referenceFichamentoQuery, referencePage, referenceQuery, selectedFichamentoFilterTopicIds]);

  const mergeEditorReferences = useCallback((incoming: BibliographicReference[]) => {
    setEditorReferences((current) => {
      const merged = new Map(current.map((reference) => [reference.id, reference]));
      for (const reference of incoming) merged.set(reference.id, reference);
      return Array.from(merged.values());
    });
  }, []);

  const loadReferenceDetails = useCallback(async (referenceId: string) => {
    setLoadingReferenceDetailId(referenceId);
    const response = await fetch(`/api/references?id=${encodeURIComponent(referenceId)}`, { cache: "no-store" });
    const data = await response.json();
    setLoadingReferenceDetailId(undefined);
    if (!response.ok) {
      setNotice(data.error || "Não foi possível carregar as utilizações da referência.");
      return;
    }
    setReferences((current) => current.map((reference) => reference.id === referenceId ? data : reference));
    mergeEditorReferences([data]);
  }, [mergeEditorReferences]);

  const loadArticleReferences = useCallback(async (content: string) => {
    const ids = Array.from(new Set(extractFootnoteReferenceLinks(content).map((link) => link.referenceId)));
    if (!ids.length) return;
    const response = await fetch(`/api/references?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) mergeEditorReferences((data as ReferencePageResponse).items);
  }, [mergeEditorReferences]);

  const loadFichamentoTopics = useCallback(async () => {
    const response = await fetch("/api/fichamento-topics");
    const data = await response.json();
    if (response.ok) {
      setFichamentoTopics(data);
      const availableTopicIds = new Set<string>(
        (data as FichamentoTopic[]).filter((topic) => topic.usageCount).map((topic) => topic.id),
      );
      setSelectedFichamentoFilterTopicIds((current) => current.filter((id) => availableTopicIds.has(id)));
    } else setNotice(data.error || "Não foi possível carregar os temas dos fichamentos.");
  }, []);

  const loadAccount = useCallback(async () => {
    setAccountLoading(true);
    const response = await fetch("/api/admin/account", { cache: "no-store" });
    const data = await response.json();
    setAccountLoading(false);
    if (response.ok) {
      setAccountEmail(data.email || "");
      setAccountStatus("");
    } else {
      setAccountStatus(data.error || "Não foi possível carregar a conta administrativa.");
    }
  }, []);

  const loadAnalyticsSettings = useCallback(async () => {
    setAnalyticsLoading(true);
    const response = await fetch("/api/admin/analytics", { cache: "no-store" });
    const data = await response.json();
    setAnalyticsLoading(false);
    if (response.ok) {
      setAnalyticsEnabled(data.enabled === true);
      setAnalyticsMeasurementId(data.measurementId || "");
      setAnalyticsStatus("");
    } else {
      setAnalyticsStatus(data.error || "Não foi possível carregar a configuração do Google Analytics.");
    }
  }, []);

  async function updateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountStatus("");
    if (accountNewPassword !== accountPasswordConfirmation) {
      setAccountStatus("A confirmação da nova senha não coincide.");
      return;
    }
    setAccountLoading(true);
    const response = await fetch("/api/admin/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: accountEmail,
        currentPassword: accountCurrentPassword,
        newPassword: accountNewPassword,
      }),
    });
    const data = await response.json();
    setAccountLoading(false);
    if (!response.ok) {
      setAccountStatus(data.error || "Não foi possível alterar as credenciais.");
      return;
    }
    setAccountStatus("Credenciais atualizadas. Entre novamente com os novos dados.");
    window.setTimeout(() => { window.location.href = "/admin/login"; }, 900);
  }

  async function updateAnalyticsSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalyticsStatus("");
    setAnalyticsLoading(true);
    const response = await fetch("/api/admin/analytics", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: analyticsEnabled, measurementId: analyticsMeasurementId }),
    });
    const data = await response.json();
    setAnalyticsLoading(false);
    if (!response.ok) {
      setAnalyticsStatus(data.error || "Não foi possível salvar a configuração do Google Analytics.");
      return;
    }
    setAnalyticsEnabled(data.enabled === true);
    setAnalyticsMeasurementId(data.measurementId || "");
    setAnalyticsStatus(data.enabled
      ? "Google Analytics 4 configurado. A coleta continuará condicionada ao consentimento do visitante."
      : "Google Analytics 4 desativado.");
  }

  const openArticleEditor = useCallback((article: AdminArticle, footnoteId?: string) => {
    const footnoteHash = footnoteId ? `#editor-footnote-${encodeURIComponent(footnoteId)}` : "";
    window.history.replaceState(null, "", `/admin?edit=${encodeURIComponent(article.slug)}${footnoteHash}`);
    const articleAuthors = article.author_names?.length ? article.author_names : [article.author_name || defaultAuthorName];
    const articleTags = (article.tags || []).map((tag) => tag.slug);
    const content = article.content_html || emptyContent;
    if (article.bibliographicReferences?.length) mergeEditorReferences(article.bibliographicReferences);
    setTitle(article.title);
    setSummary(article.summary || "");
    setYoutubeUrl(article.youtube_url || "");
    setCategory(article.category === "Sem categoria" ? "" : article.category);
    setAuthors(articleAuthors);
    setSelectedTagSlugs(articleTags);
    setTagPickerOpen(false);
    setTagQuery("");
    setOriginalSlug(article.slug);
    setEditingStatus(article.status);
    setHtml(content);
    void loadArticleReferences(content);
    setLastSavedDraft(articleDraftFingerprint({
      title: article.title,
      summary: article.summary || "",
      youtubeUrl: article.youtube_url || "",
      category: article.category === "Sem categoria" ? "" : article.category,
      authors: articleAuthors,
      tagSlugs: articleTags,
      content,
    }));
    setAutosaveStatus(article.status === "draft" ? "saved" : "idle");
    setFocusedFootnote(footnoteId ? { id: footnoteId, requestId: crypto.randomUUID() } : undefined);
    setNotice("");
    setTab("editor");
  }, [defaultAuthorName, loadArticleReferences, mergeEditorReferences]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadArticles(); }, 300);
    return () => window.clearTimeout(timer);
  }, [loadArticles]);

  useEffect(() => {
    let active = true;
    if (initialArticleSlug) {
      void fetch(`/api/articles?slug=${encodeURIComponent(initialArticleSlug)}`, { cache: "no-store" })
        .then(async (response) => ({ response, data: await response.json() }))
        .then(({ response, data }) => {
          if (!active) return;
          if (!response.ok) {
            setNotice(data.error || "O artigo solicitado não foi encontrado.");
            setTab("articles");
            return;
          }
          openArticleEditor(data as AdminArticle);
        });
    }
    void fetch("/api/tags")
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (response.ok) setTags(data);
        else setNotice(data.error || "Não foi possível carregar as tags.");
      });
    void fetch("/api/publications")
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (response.ok) setPublications(data);
        else setNotice(data.error || "Não foi possível carregar as publicações.");
      });
    void fetch("/api/references?page=1&pageSize=30", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (response.ok) {
          const page = data as ReferencePageResponse;
          setReferences(page.items);
          setReferencePage(page.page);
          setReferencePageCount(page.pageCount);
          setReferenceTotal(page.total);
          setEditorReferences(page.items);
        }
        else setNotice(data.error || "Não foi possível carregar as referências.");
      });
    return () => { active = false; };
  }, [initialArticleSlug, openArticleEditor]);

  useEffect(() => {
    if (tab !== "references") return;
    const timer = window.setTimeout(() => { void loadReferences(); }, 300);
    return () => window.clearTimeout(timer);
  }, [loadReferences, tab]);

  function newArticle() {
    window.history.replaceState(null, "", "/admin");
    setTitle("");
    setSummary("");
    setYoutubeUrl("");
    setCategory("");
    setAuthors([defaultAuthorName]);
    setSelectedTagSlugs([]);
    setTagPickerOpen(false);
    setTagQuery("");
    setOriginalSlug(undefined);
    setEditingStatus("draft");
    setHtml(emptyContent);
    setLastSavedDraft(articleDraftFingerprint({
      title: "",
      summary: "",
      youtubeUrl: "",
      category: "",
      authors: [defaultAuthorName],
      tagSlugs: [],
      content: emptyContent,
    }));
    setAutosaveStatus("idle");
    setNotice("");
    setTab("editor");
  }

  async function editArticle(article: AdminArticle, footnoteId?: string) {
    setNotice("");
    const response = await fetch(`/api/articles?slug=${encodeURIComponent(article.slug)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível abrir o artigo.");
      return;
    }
    openArticleEditor(data as AdminArticle, footnoteId);
  }

  const save = useCallback(async (
    status: "draft" | "published",
    options: { automatic?: boolean } = {},
  ) => {
    const automatic = options.automatic === true;
    const previousSlug = originalSlug;
    const previousStatus = editingStatus;
    const draftFingerprint = articleDraftFingerprint({
      title,
      summary,
      youtubeUrl,
      category,
      authors,
      tagSlugs: selectedTagSlugs,
      content: html,
    });
    setSaving(true);
    if (automatic) setAutosaveStatus("saving");
    else setNotice("");
    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary,
          youtubeUrl,
          category,
          authors: authors.map((name) => name.trim()).filter(Boolean),
          tagSlugs: selectedTagSlugs,
          content: html,
          status,
          originalSlug,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (automatic) setAutosaveStatus("error");
        else setNotice(data.error || "Não foi possível salvar.");
        return false;
      }
      setOriginalSlug(data.slug);
      setEditingStatus(status);
      setLastSavedDraft(draftFingerprint);
      const updatedAt = new Date().toISOString();
      const selectedTags = selectedTagSlugs
        .map((slug) => tags.find((tag) => tag.slug === slug))
        .filter((tag): tag is AdminTag => Boolean(tag));
      const savedSummary: AdminArticle = {
        id: data.id,
        title: title.trim(),
        slug: data.slug,
        summary,
        youtube_url: youtubeUrl,
        category: category || "Sem categoria",
        author_name: authors.map((name) => name.trim()).filter(Boolean)[0],
        author_names: authors.map((name) => name.trim()).filter(Boolean),
        tags: selectedTags,
        status,
        updated_at: updatedAt,
      };
      setArticles((current) => {
        const withoutPrevious = current.filter((article) => article.slug !== (previousSlug || data.slug));
        return [savedSummary, ...withoutPrevious].slice(0, 25);
      });
      if (!previousSlug) {
        setArticleTotal((current) => current + 1);
        setArticleTotals((current) => ({
          all: current.all + 1,
          published: current.published + (status === "published" ? 1 : 0),
        }));
      } else if (previousStatus !== status) {
        setArticleTotals((current) => ({
          ...current,
          published: Math.max(0, current.published + (status === "published" ? 1 : -1)),
        }));
      }
      window.history.replaceState(null, "", `/admin?edit=${encodeURIComponent(data.slug)}`);
      if (automatic) setAutosaveStatus("saved");
      else {
        setAutosaveStatus(status === "draft" ? "saved" : "idle");
        setNotice(status === "draft" ? "Rascunho salvo." : "Artigo publicado.");
      }
      return true;
    } catch {
      if (automatic) setAutosaveStatus("error");
      else setNotice("Não foi possível salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    authors,
    category,
    editingStatus,
    html,
    originalSlug,
    selectedTagSlugs,
    summary,
    tags,
    title,
    youtubeUrl,
  ]);

  useEffect(() => {
    if (tab !== "editor" || editingStatus !== "draft" || saving) return;
    const trimmedAuthors = authors.map((name) => name.trim()).filter(Boolean);
    if (title.trim().length < 3 || !trimmedAuthors.length || trimmedAuthors.some((name) => name.length < 2)) return;
    const currentFingerprint = articleDraftFingerprint({
      title,
      summary,
      youtubeUrl,
      category,
      authors,
      tagSlugs: selectedTagSlugs,
      content: html,
    });
    if (currentFingerprint === lastSavedDraft) return;
    const timer = window.setTimeout(() => {
      void save("draft", { automatic: true });
    }, draftAutosaveDelay);
    return () => window.clearTimeout(timer);
  }, [
    authors,
    category,
    editingStatus,
    html,
    lastSavedDraft,
    save,
    saving,
    selectedTagSlugs,
    summary,
    tab,
    title,
    youtubeUrl,
  ]);

  async function deleteArticle(article: AdminArticle) {
    const confirmed = window.confirm(
      `Excluir permanentemente o artigo “${article.title}”? Os comentários vinculados também serão removidos.`,
    );
    if (!confirmed) return;
    setNotice("");
    const response = await fetch("/api/articles", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: article.slug }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível excluir o artigo.");
      return;
    }
    if (originalSlug === article.slug) newArticle();
    setNotice("Artigo excluído.");
    await Promise.all([loadArticles(), loadTags(), loadComments()]);
  }

  async function saveTag() {
    setNotice("");
    const response = await fetch("/api/tags", {
      method: editingTagId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editingTagId, name: tagName, kind: tagKind }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível salvar a tag.");
      return;
    }
    setTagName("");
    setTagKind("juridica");
    setEditingTagId(undefined);
    setNotice(editingTagId ? "Tag atualizada." : "Tag criada.");
    await Promise.all([loadTags(), loadArticles()]);
  }

  function beginTagEdit(tag: AdminTag) {
    setEditingTagId(tag.id);
    setTagName(tag.name);
    setTagKind(tag.kind);
  }

  async function deleteTag(tag: AdminTag) {
    if (!window.confirm(`Excluir a tag “${tag.name}”? Ela será removida dos artigos associados.`)) return;
    const response = await fetch("/api/tags", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: tag.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível excluir a tag.");
      return;
    }
    setSelectedTagSlugs((current) => current.filter((slug) => slug !== tag.slug));
    setNotice("Tag excluída.");
    await Promise.all([loadTags(), loadArticles()]);
  }

  async function saveComment(comment: AdminComment) {
    const response = await fetch("/api/admin/comments", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: comment.id, body: commentDraft }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível atualizar o comentário.");
      return;
    }
    setEditingCommentId(undefined);
    setCommentDraft("");
    setNotice("Comentário atualizado.");
    await loadComments();
  }

  async function deleteComment(comment: AdminComment) {
    if (!window.confirm(`Excluir o comentário de “${comment.authorName}”? As respostas vinculadas a ele também serão excluídas.`)) return;
    const response = await fetch("/api/admin/comments", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: comment.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível excluir o comentário.");
      return;
    }
    setEditingCommentId(undefined);
    setCommentDraft("");
    setNotice("Comentário excluído.");
    await loadComments();
  }

  function newPublication() {
    setPublicationId(undefined);
    setReferenceHtml("<p></p>");
    setPublicationPdfKey("");
    setPublicationUrl("");
    setPublicationDate(new Date().toISOString().slice(0, 10));
    setPublicationStatus("draft");
    setNotice("");
    setTab("publication-editor");
  }

  function editPublication(publication: AdminPublication) {
    setPublicationId(publication.id);
    setReferenceHtml(publication.reference_html);
    setPublicationPdfKey(publication.pdf_key || "");
    setPublicationUrl(publication.external_url || "");
    setPublicationDate(publication.publication_date);
    setPublicationStatus(publication.status);
    setNotice("");
    setTab("publication-editor");
  }

  async function savePublication() {
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/publications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: publicationId,
        referenceHtml,
        pdfKey: publicationPdfKey,
        externalUrl: publicationUrl,
        publicationDate,
        status: publicationStatus,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setNotice(data.error || "Não foi possível salvar a publicação.");
      return;
    }
    setPublicationId(data.id);
    setNotice(publicationStatus === "draft" ? "Rascunho salvo." : "Publicação disponibilizada.");
    await loadPublications();
  }

  async function uploadPublicationPdf(file: File) {
    setUploadingPdf(true);
    setNotice("");
    const formData = new FormData();
    formData.append("pdf", file);
    const response = await fetch("/api/uploads/publications", { method: "POST", body: formData });
    const data = await response.json();
    setUploadingPdf(false);
    if (!response.ok) {
      setNotice(data.error || "Não foi possível enviar o PDF.");
      return;
    }
    setPublicationPdfKey(data.key);
    setNotice("PDF anexado. Salve a publicação para concluir.");
  }

  async function deletePublication(publication: AdminPublication) {
    if (!window.confirm("Excluir esta publicação? O registro será removido da página pública.")) return;
    const response = await fetch("/api/publications", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: publication.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível excluir a publicação.");
      return;
    }
    setNotice("Publicação excluída.");
    await loadPublications();
  }

  function resetReferenceForm() {
    setEditingReferenceId(undefined);
    setBibliographicReferenceDraft("");
    setSimilarReferenceWarnings([]);
    const formPanel = document.getElementById("reference-form-panel") as HTMLDetailsElement | null;
    if (formPanel) formPanel.open = false;
  }

  async function saveBibliographicReference(confirmSimilar = false) {
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/references", {
      method: editingReferenceId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editingReferenceId,
        referenceHtml: bibliographicReferenceDraft,
        confirmSimilar,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      if (data.code === "similar_reference") {
        setSimilarReferenceWarnings(data.similarReferences || []);
        setNotice("Há referências muito semelhantes. Confira antes de salvar um novo registro.");
      } else {
        setNotice(data.error || "Não foi possível salvar a referência.");
      }
      return;
    }
    resetReferenceForm();
    setNotice(editingReferenceId ? "Referência atualizada." : "Referência criada.");
    await loadReferences();
  }

  function beginReferenceEdit(reference: AdminReference) {
    setEditingReferenceId(reference.id);
    setBibliographicReferenceDraft(reference.referenceHtml);
    setSimilarReferenceWarnings([]);
    setNotice("");
    const formPanel = document.getElementById("reference-form-panel") as HTMLDetailsElement | null;
    if (formPanel) {
      formPanel.open = true;
      formPanel.scrollIntoView({ block: "start" });
    }
  }

  async function deleteBibliographicReference(reference: AdminReference) {
    if (!window.confirm("Excluir esta referência bibliográfica?")) return;
    const response = await fetch("/api/references", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: reference.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "reference_in_use" && Array.isArray(data.usages)) {
        const locations = data.usages
          .map((usage: ReferenceUsage) => `${usage.articleTitle} — nota ${usage.noteNumber}`)
          .join("; ");
        setNotice(`A referência não pode ser excluída porque está em uso: ${locations}.`);
      } else if (data.code === "reference_has_fichamento") {
        setNotice(`A referência não pode ser excluída porque possui ${data.fichamentoCount} ${data.fichamentoCount === 1 ? "registro" : "registros"} no fichamento.`);
      } else {
        setNotice(data.error || "Não foi possível excluir a referência.");
      }
      return;
    }
    if (editingReferenceId === reference.id) resetReferenceForm();
    setNotice("Referência excluída.");
    await loadReferences();
  }

  function resetFichamentoForm() {
    setEditingFichamentoId(undefined);
    setFichamentoLiteralQuote("");
    setFichamentoParaphrase("");
    setFichamentoLocation("");
    setFichamentoPersonalNote("");
    setSelectedRelatedFichamentoIds([]);
    setRelatedFichamentoQuery("");
    setRelatedFichamentoPickerOpen(false);
    setSelectedFichamentoTopicIds([]);
    setFichamentoTopicQuery("");
    setFichamentoTopicPickerOpen(false);
    setFichamentoFormOpen(false);
  }

  async function toggleReferenceFichamento(referenceId: string) {
    if (activeFichamentoReferenceId === referenceId) {
      setActiveFichamentoReferenceId(undefined);
      resetFichamentoForm();
      return;
    }
    setActiveFichamentoReferenceId(referenceId);
    setFichamentoQuery("");
    resetFichamentoForm();
    const requests: Promise<void>[] = [];
    if (!referenceFichamentos[referenceId]) {
      requests.push(fetch(`/api/reference-fichamentos?referenceId=${encodeURIComponent(referenceId)}`)
        .then(async (response) => ({ response, data: await response.json() }))
        .then(({ response, data }) => {
          if (!response.ok) throw new Error(data.error || "Não foi possível carregar o fichamento.");
          setReferenceFichamentos((current) => ({ ...current, [referenceId]: data }));
        }));
    }
    if (!fichamentoTopics.length) requests.push(loadFichamentoTopics());
    try {
      await Promise.all(requests);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível carregar o fichamento.");
    }
  }

  async function loadAllReferenceFichamentos() {
    setLoadingRelatedFichamentos(true);
    try {
      const response = await fetch("/api/reference-fichamentos?all=1");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar as remissões.");
      setAllReferenceFichamentos(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível carregar as remissões.");
    } finally {
      setLoadingRelatedFichamentos(false);
    }
  }

  function beginFichamentoEdit(item: ReferenceFichamento) {
    setEditingFichamentoId(item.id);
    setFichamentoLiteralQuote(item.literalQuote);
    setFichamentoParaphrase(item.paraphrase);
    setFichamentoLocation(item.location);
    setFichamentoPersonalNote(item.personalNote);
    setSelectedRelatedFichamentoIds(item.relatedFichamentos.map((related) => related.id));
    setRelatedFichamentoQuery("");
    setRelatedFichamentoPickerOpen(false);
    setSelectedFichamentoTopicIds(item.topics.map((topic) => topic.id));
    setFichamentoTopicQuery("");
    setFichamentoTopicPickerOpen(false);
    setFichamentoFormOpen(true);
    if (!allReferenceFichamentos.length) void loadAllReferenceFichamentos();
  }

  function formatFichamentoPersonalNote(marker: "**" | "*") {
    const textarea = fichamentoPersonalNoteRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = fichamentoPersonalNote.slice(start, end);
    const next = `${fichamentoPersonalNote.slice(0, start)}${marker}${selected}${marker}${fichamentoPersonalNote.slice(end)}`;
    setFichamentoPersonalNote(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + marker.length;
      textarea.setSelectionRange(selectionStart, selectionStart + selected.length);
    });
  }

  async function openLinkedFichamento(link: FichamentoLinkSummary) {
    setReferenceQuery("");
    setReferenceFichamentoQuery("");
    setSelectedFichamentoFilterTopicIds([]);
    setActiveFichamentoReferenceId(link.referenceId);
    setFichamentoQuery("");
    resetFichamentoForm();
    try {
      const response = await fetch(`/api/reference-fichamentos?referenceId=${encodeURIComponent(link.referenceId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível abrir a remissão.");
      setReferenceFichamentos((current) => ({ ...current, [link.referenceId]: data }));
      window.setTimeout(() => {
        document.getElementById(`fichamento-${link.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível abrir a remissão.");
    }
  }

  async function createFichamentoTopic() {
    const name = fichamentoTopicQuery.trim();
    if (name.length < 2) return;
    const response = await fetch("/api/fichamento-topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível criar o tema.");
      return;
    }
    setFichamentoTopics((current) => current.some((topic) => topic.id === data.id)
      ? current
      : [...current, data].sort((left, right) => left.name.localeCompare(right.name, "pt-BR")));
    setSelectedFichamentoTopicIds((current) => current.includes(data.id) ? current : [...current, data.id]);
    setFichamentoTopicQuery("");
  }

  async function createManagedFichamentoTopic() {
    const name = newFichamentoTopicName.trim();
    if (name.length < 2) return;
    setSavingFichamentoTopic(true);
    setNotice("");
    const response = await fetch("/api/fichamento-topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    setSavingFichamentoTopic(false);
    if (!response.ok) {
      setNotice(data.error || "Não foi possível criar o tema.");
      return;
    }
    setNewFichamentoTopicName("");
    setNotice("Tema criado.");
    await loadFichamentoTopics();
  }

  function beginFichamentoTopicEdit(topic: FichamentoTopic) {
    setEditingFichamentoTopicId(topic.id);
    setEditingFichamentoTopicName(topic.name);
  }

  async function saveManagedFichamentoTopic() {
    if (!editingFichamentoTopicId || editingFichamentoTopicName.trim().length < 2) return;
    setSavingFichamentoTopic(true);
    setNotice("");
    const response = await fetch("/api/fichamento-topics", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editingFichamentoTopicId, name: editingFichamentoTopicName }),
    });
    const data = await response.json();
    setSavingFichamentoTopic(false);
    if (!response.ok) {
      setNotice(data.error || "Não foi possível alterar o tema.");
      return;
    }
    setReferenceFichamentos((current) => Object.fromEntries(
      Object.entries(current).map(([referenceId, items]) => [
        referenceId,
        items.map((item) => ({
          ...item,
          topics: item.topics.map((topic) => topic.id === data.id ? { ...topic, ...data } : topic),
        })),
      ]),
    ));
    setEditingFichamentoTopicId(undefined);
    setEditingFichamentoTopicName("");
    setNotice("Tema atualizado.");
    await loadFichamentoTopics();
  }

  async function deleteManagedFichamentoTopic(topic: FichamentoTopic) {
    const usageWarning = topic.usageCount
      ? ` Ele será retirado de ${topic.usageCount} ${topic.usageCount === 1 ? "registro" : "registros"} de fichamento, sem excluir seu conteúdo.`
      : "";
    if (!window.confirm(`Excluir o tema “${topic.name}”?${usageWarning}`)) return;
    const response = await fetch("/api/fichamento-topics", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: topic.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível excluir o tema.");
      return;
    }
    setSelectedFichamentoFilterTopicIds((current) => current.filter((id) => id !== topic.id));
    setSelectedFichamentoTopicIds((current) => current.filter((id) => id !== topic.id));
    setReferenceFichamentos((current) => Object.fromEntries(
      Object.entries(current).map(([referenceId, items]) => [
        referenceId,
        items.map((item) => ({
          ...item,
          topics: item.topics.filter((candidate) => candidate.id !== topic.id),
        })),
      ]),
    ));
    if (editingFichamentoTopicId === topic.id) {
      setEditingFichamentoTopicId(undefined);
      setEditingFichamentoTopicName("");
    }
    setNotice(data.removedUsageCount
      ? `Tema excluído e retirado de ${data.removedUsageCount} ${data.removedUsageCount === 1 ? "registro" : "registros"} de fichamento.`
      : "Tema excluído.");
    await Promise.all([loadFichamentoTopics(), loadReferences()]);
  }

  async function saveReferenceFichamento(referenceId: string) {
    setSavingFichamento(true);
    setNotice("");
    const response = await fetch("/api/reference-fichamentos", {
      method: editingFichamentoId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editingFichamentoId,
        referenceId,
        literalQuote: fichamentoLiteralQuote,
        paraphrase: fichamentoParaphrase,
        location: fichamentoLocation,
        personalNote: fichamentoPersonalNote,
        topicIds: selectedFichamentoTopicIds,
        relatedFichamentoIds: selectedRelatedFichamentoIds,
      }),
    });
    const data = await response.json();
    setSavingFichamento(false);
    if (!response.ok) {
      setNotice(data.error || "Não foi possível salvar o fichamento.");
      return;
    }
    setReferenceFichamentos((current) => {
      const existing = current[referenceId] || [];
      const next = editingFichamentoId
        ? existing.map((item) => item.id === data.id ? data : item)
        : [data, ...existing];
      return { ...current, [referenceId]: next };
    });
    setReferences((current) => current.map((reference) =>
      reference.id === referenceId
        ? { ...reference, fichamentoCount: editingFichamentoId ? reference.fichamentoCount : reference.fichamentoCount + 1 }
        : reference,
    ));
    setNotice(editingFichamentoId ? "Registro do fichamento atualizado." : "Registro incluído no fichamento.");
    resetFichamentoForm();
    setAllReferenceFichamentos([]);
    await Promise.all([loadReferences(), loadFichamentoTopics()]);
  }

  async function deleteReferenceFichamento(item: ReferenceFichamento) {
    if (!window.confirm("Excluir este registro do fichamento?")) return;
    const response = await fetch("/api/reference-fichamentos", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, referenceId: item.referenceId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error || "Não foi possível excluir o registro.");
      return;
    }
    setReferenceFichamentos((current) => ({
      ...current,
      [item.referenceId]: (current[item.referenceId] || []).filter((candidate) => candidate.id !== item.id),
    }));
    setReferences((current) => current.map((reference) =>
      reference.id === item.referenceId
        ? { ...reference, fichamentoCount: Math.max(0, reference.fichamentoCount - 1) }
        : reference,
    ));
    if (editingFichamentoId === item.id) resetFichamentoForm();
    setNotice("Registro removido do fichamento.");
    await Promise.all([loadReferences(), loadFichamentoTopics()]);
  }

  async function copyFichamentoField(value: string, label: "Citação literal" | "Paráfrase") {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiada.`);
    } catch {
      setNotice("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  function toggleFichamentoFilterTopic(topicId: string) {
    setReferencePage(1);
    setSelectedFichamentoFilterTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((id) => id !== topicId)
        : [...current, topicId],
    );
    window.requestAnimationFrame(() => {
      const referencesPanel = document.getElementById("references-list-panel") as HTMLDetailsElement | null;
      if (referencesPanel) {
        referencesPanel.open = true;
        referencesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  const nav = [
    ["dashboard", "Visão geral", LayoutDashboard],
    ["articles", "Artigos", Library],
    ["editor", "Novo artigo", Plus],
    ["taxonomy", "Tags", Tags],
    ["references", "Referências", FileText],
    ["comments", "Comentários", MessageSquare],
    ["publications", "Publicações", BookOpen],
    ["youtube", "Cursos", Video],
    ["statistics", "Estatísticas", BarChart3],
    ["settings", "Configurações", Settings],
  ] as const;

  const filteredArticles = articles;
  const normalizedFichamentoQuery = normalizeAdminSearch(referenceFichamentoQuery);
  const filteredReferences = references;
  const visibleFichamentoTopics = fichamentoTopics.filter((topic) =>
    normalizeAdminSearch(topic.name).includes(normalizeAdminSearch(referenceTopicQuery)),
  );
  const normalizedRelatedFichamentoQuery = normalizeAdminSearch(relatedFichamentoQuery);
  const relatedFichamentoCandidates = allReferenceFichamentos
    .filter((item) => item.id !== editingFichamentoId && !selectedRelatedFichamentoIds.includes(item.id))
    .filter((item) => {
      const reference = editorReferences.find((candidate) => candidate.id === item.referenceId);
      return !normalizedRelatedFichamentoQuery
        || normalizeAdminSearch(`${reference?.referenceText || ""} ${item.literalQuote} ${item.paraphrase} ${item.location}`)
          .includes(normalizedRelatedFichamentoQuery);
    })
    .slice(0, 20);
  const unsavedFichamentoMatchesSearch = Boolean(
    normalizedFichamentoQuery
    && fichamentoFormOpen
    && normalizeAdminSearch(`${fichamentoLiteralQuote} ${fichamentoParaphrase} ${fichamentoLocation} ${fichamentoPersonalNote}`)
      .includes(normalizedFichamentoQuery),
  );
  const hasArticleFilters = Boolean(articleQuery || articleStatusFilter !== "all" || articleTagFilter !== "all" || articleUpdatedFilter !== "all");
  const autosaveAuthors = authors.map((name) => name.trim()).filter(Boolean);
  const autosaveEligible = editingStatus === "draft"
    && title.trim().length >= 3
    && autosaveAuthors.length > 0
    && autosaveAuthors.every((name) => name.length >= 2);
  const currentDraftFingerprint = articleDraftFingerprint({
    title,
    summary,
    youtubeUrl,
    category,
    authors,
    tagSlugs: selectedTagSlugs,
    content: html,
  });
  const draftHasPendingChanges = autosaveEligible && currentDraftFingerprint !== lastSavedDraft;
  const autosaveDisplayStatus = draftHasPendingChanges
    && autosaveStatus !== "saving"
    && autosaveStatus !== "error"
    ? "pending"
    : autosaveStatus;

  function clearArticleFilters() {
    setArticleQuery("");
    setArticleStatusFilter("all");
    setArticleTagFilter("all");
    setArticleUpdatedFilter("all");
    setArticlePage(1);
  }

  function setArticleUpdatedPeriod(value: string) {
    setArticleUpdatedFilter(value);
    setArticlePage(1);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Image className="admin-sidebar-logo" src="/logo-academia-transparente.png" alt="Academia Jurídico-Contábil" width={1500} height={520} priority />
        <nav aria-label="Área editorial">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                if (id === "editor") newArticle();
                else {
                  window.history.replaceState(null, "", "/admin");
                  setTab(id);
                  if (id === "articles") void loadArticles();
                  if (id === "comments") void loadComments();
                  if (id === "publications") void loadPublications();
                  if (id === "taxonomy") void loadTags();
                  if (id === "references") {
                    void loadReferences();
                    void loadFichamentoTopics();
                  }
                  if (id === "settings") {
                    void loadAccount();
                    void loadAnalyticsSettings();
                  }
                }
              }}
            >
              <Icon size={17} aria-hidden="true" />{label}
            </button>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post"><button><LogOut size={17} aria-hidden="true" />Sair</button></form>
      </aside>

      <main className="admin-main">
        {tab === "dashboard" && (
          <>
            <div className="admin-heading">
              <div><p className="eyebrow">Painel editorial</p><h1>Visão geral</h1></div>
              <button className="button primary" onClick={newArticle}><Plus size={16} />Novo artigo</button>
            </div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <div className="admin-summary">
              <section>
                <span>{articleTotals.all}</span>
                <div><h2>Artigos</h2><p>Publicados e rascunhos cadastrados.</p></div>
              </section>
              <section>
                <span>{articleTotals.published}</span>
                <div><h2>Publicados</h2><p>Disponíveis no blog.</p></div>
              </section>
            </div>
            <section className="admin-section">
              <div className="admin-section-heading"><h2>Conteúdo recente</h2><button className="text-button" onClick={() => setTab("articles")}>Ver artigos</button></div>
              {loadingArticles ? <p>Carregando…</p> : articles.slice(0, 5).map((article) => (
                <button className="recent-admin-article" key={article.slug} onClick={() => editArticle(article)}>
                  <span>{article.title}</span><small>{article.status === "published" ? "Publicado" : "Rascunho"}</small>
                </button>
              ))}
            </section>
          </>
        )}

        {tab === "articles" && (
          <>
            <div className="admin-heading">
              <div><p className="eyebrow">Conteúdo</p><h1>Artigos</h1></div>
              <div className="admin-heading-actions">
                <a className="button secondary" href="/api/admin/articles/export-word">
                  <Download size={16} aria-hidden="true" />Exportar todos
                </a>
                <button className="button primary" onClick={newArticle}><Plus size={16} />Novo artigo</button>
              </div>
            </div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <section className="article-filters" aria-label="Pesquisar e filtrar artigos">
              <label className="article-search">
                <span className="sr-only">Pesquisar por título ou autoria</span>
                <input
                  type="search"
                  value={articleQuery}
                  onChange={(event) => { setArticleQuery(event.target.value); setArticlePage(1); }}
                  placeholder="Pesquisar por título ou autoria"
                />
              </label>
              <label>
                <span>Status</span>
                <select value={articleStatusFilter} onChange={(event) => { setArticleStatusFilter(event.target.value as "all" | AdminArticle["status"]); setArticlePage(1); }}>
                  <option value="all">Todos</option>
                  <option value="published">Publicados</option>
                  <option value="draft">Rascunhos</option>
                </select>
              </label>
              <label>
                <span>Tag</span>
                <select value={articleTagFilter} onChange={(event) => { setArticleTagFilter(event.target.value); setArticlePage(1); }}>
                  <option value="all">Todas</option>
                  {tags.map((tag) => <option key={tag.id} value={tag.slug}>{tag.name}</option>)}
                </select>
              </label>
              <label>
                <span>Atualização</span>
                <select value={articleUpdatedFilter} onChange={(event) => setArticleUpdatedPeriod(event.target.value)}>
                  <option value="all">Qualquer período</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                </select>
              </label>
              <button className="button secondary article-filter-clear" type="button" disabled={!hasArticleFilters} onClick={clearArticleFilters}>
                Limpar filtros
              </button>
            </section>
            <p className="article-filter-result" aria-live="polite">
              {hasArticleFilters
                ? `${articleTotal} ${articleTotal === 1 ? "artigo encontrado" : "artigos encontrados"}.`
                : `${articleTotal} ${articleTotal === 1 ? "artigo cadastrado" : "artigos cadastrados"}.`}
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table articles-admin-table">
                <thead><tr><th>Título</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {filteredArticles.map((article) => (
                    <tr key={article.slug}>
                      <td>{article.title}</td>
                      <td><span className={`status-pill ${article.status}`}>{article.status === "published" ? "Publicado" : "Rascunho"}</span></td>
                      <td>
                        <div className="table-actions article-row-actions">
                          <button
                            className="table-action compact-table-action"
                            type="button"
                            title="Editar artigo"
                            aria-label={`Editar artigo: ${article.title}`}
                            onClick={() => editArticle(article)}
                          >
                            <Pencil size={16} aria-hidden="true" /><span className="sr-only">Editar</span>
                          </button>
                          <a
                            className="table-action compact-table-action"
                            title="Exportar artigo para Word"
                            aria-label={`Exportar para Word: ${article.title}`}
                            href={`/api/admin/articles/${encodeURIComponent(article.slug)}/export-word`}
                          >
                            <Download size={16} aria-hidden="true" /><span className="sr-only">Exportar para Word</span>
                          </a>
                          <button
                            className="table-action compact-table-action danger-action"
                            type="button"
                            title="Excluir artigo"
                            aria-label={`Excluir artigo: ${article.title}`}
                            onClick={() => void deleteArticle(article)}
                          >
                            <Trash2 size={16} aria-hidden="true" /><span className="sr-only">Excluir</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredArticles.length && (
                    <tr><td className="article-filter-empty" colSpan={3}>Nenhum artigo corresponde aos filtros informados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {articlePageCount > 1 && (
              <nav className="admin-pagination" aria-label="Paginação dos artigos">
                <button className="button secondary" type="button" disabled={articlePage <= 1 || loadingArticles} onClick={() => setArticlePage((page) => Math.max(1, page - 1))}>
                  Anterior
                </button>
                <span>Página {articlePage} de {articlePageCount}</span>
                <button className="button secondary" type="button" disabled={articlePage >= articlePageCount || loadingArticles} onClick={() => setArticlePage((page) => Math.min(articlePageCount, page + 1))}>
                  Próxima
                </button>
              </nav>
            )}
          </>
        )}

        {tab === "statistics" && (
          <>
            <div className="admin-heading">
              <div><p className="eyebrow">Acessos ao Blog</p><h1>Estatísticas</h1></div>
            </div>
            <StatisticsDashboard />
          </>
        )}

        {tab === "editor" && (
          <>
            <div className="admin-heading editor-heading">
              <div><p className="eyebrow">Edição</p><h1>{originalSlug ? "Editar artigo" : "Novo artigo"}</h1></div>
              <div className="editor-actions">
                {originalSlug && (
                  <a
                    className="button secondary"
                    href={`/admin/preview/${encodeURIComponent(originalSlug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Eye size={16} aria-hidden="true" />Prévia privada
                  </a>
                )}
                <button className="button secondary" disabled={saving} onClick={() => void save("draft")}>
                  {editingStatus === "published" ? "Mover para rascunho" : "Salvar rascunho"}
                </button>
                <button className="button primary" disabled={saving} onClick={() => void save("published")}>
                  {saving ? "Salvando…" : editingStatus === "published" ? "Atualizar publicado" : "Publicar artigo"}
                </button>
              </div>
            </div>
            {autosaveEligible && autosaveDisplayStatus !== "idle" && (
              <p
                className={`draft-autosave-status is-${autosaveDisplayStatus}`}
                aria-live="polite"
                role={autosaveDisplayStatus === "error" ? "alert" : undefined}
              >
                {autosaveDisplayStatus === "pending" && "Alterações aguardando salvamento automático…"}
                {autosaveDisplayStatus === "saving" && "Salvando rascunho…"}
                {autosaveDisplayStatus === "saved" && "Rascunho salvo automaticamente."}
                {autosaveDisplayStatus === "error" && "Não foi possível salvar automaticamente. Use “Salvar rascunho”."}
              </p>
            )}
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <div className="editor-fields editor-accordion">
              <details className="editor-section" name="article-editor-sections">
                <summary><span>Identificação e autoria</span><small>{title.trim() || "Título ainda não informado"}</small></summary>
                <div className="editor-section-body">
                  <div className="editor-field-row single-field">
                    <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Título do artigo" /></label>
                  </div>
                  <fieldset className="article-authors-editor">
                <legend>Autoria do artigo</legend>
                <p>Cadastre os nomes na ordem em que deverão aparecer na publicação.</p>
                <div className="article-author-list">
                  {authors.map((author, index) => (
                    <div className="article-author-row" key={index}>
                      <label>
                        <span>Nome do autor ou da autora {index + 1}</span>
                        <input
                          value={author}
                          onChange={(event) => setAuthors((current) => current.map((name, position) => position === index ? event.target.value : name))}
                          maxLength={180}
                          required
                          placeholder="Nome completo"
                        />
                      </label>
                      <button
                        className="table-action danger-action"
                        type="button"
                        disabled={authors.length === 1}
                        aria-label={`Remover autor ou autora ${index + 1}`}
                        onClick={() => setAuthors((current) => current.filter((_, position) => position !== index))}
                      >
                        <Trash2 size={14} aria-hidden="true" />Remover
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="button secondary add-author-button"
                  type="button"
                  disabled={authors.length >= 20}
                  onClick={() => setAuthors((current) => [...current, ""])}
                >
                  <Plus size={15} aria-hidden="true" />Adicionar outra autoria
                </button>
                  </fieldset>
                </div>
              </details>
              <details className="editor-section" name="article-editor-sections">
                <summary><span>Resumo</span><small>{summary.trim() ? "Preenchido" : "Não preenchido"}</small></summary>
                <div className="editor-section-body">
                  <label>Resumo<textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} placeholder="Resumo exibido na listagem do blog" /></label>
                </div>
              </details>
              <details className="editor-section" name="article-editor-sections">
                <summary><span>Tags</span><small>{selectedTagSlugs.length ? `${selectedTagSlugs.length} selecionada${selectedTagSlugs.length === 1 ? "" : "s"}` : "Nenhuma selecionada"}</small></summary>
                <div className="editor-section-body">
                  <fieldset className="tag-editor">
                <legend>Tags do artigo</legend>
                <p>Selecione apenas tags já cadastradas. Novas tags são criadas na área “Tags” do painel.</p>
                <div className="selected-article-tags" aria-label="Tags selecionadas">
                  {selectedTagSlugs.map((slug) => {
                    const tag = tags.find((item) => item.slug === slug);
                    if (!tag) return null;
                    return (
                      <span key={tag.id} className={`selected-tag tag-${tag.kind}`}>
                        {tag.name}
                        <button
                          type="button"
                          aria-label={`Remover a tag ${tag.name}`}
                          onClick={() => setSelectedTagSlugs((current) => current.filter((currentSlug) => currentSlug !== tag.slug))}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    );
                  })}
                  {!selectedTagSlugs.length && <small>Nenhuma tag selecionada.</small>}
                </div>
                <div className="tag-picker">
                  <button
                    className="tag-picker-trigger"
                    type="button"
                    aria-expanded={tagPickerOpen}
                    aria-controls="tag-picker-options"
                    onClick={() => setTagPickerOpen((open) => !open)}
                  >
                    <Plus size={15} aria-hidden="true" />Adicionar tag
                  </button>
                  {tagPickerOpen && (
                    <div className="tag-picker-popover" id="tag-picker-options">
                      <label>
                        <span className="sr-only">Pesquisar tags</span>
                        <input
                          type="search"
                          value={tagQuery}
                          onChange={(event) => setTagQuery(event.target.value)}
                          placeholder="Pesquisar tags…"
                          autoFocus
                        />
                      </label>
                      <div className="tag-picker-list" role="listbox" aria-label="Tags disponíveis">
                        {tags
                          .filter((tag) => !selectedTagSlugs.includes(tag.slug))
                          .filter((tag) => tag.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                            .includes(tagQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()))
                          .map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              role="option"
                              aria-selected="false"
                              onClick={() => {
                                setSelectedTagSlugs((current) => [...current, tag.slug]);
                                setTagQuery("");
                              }}
                            >
                              <span className={`tag-color-dot tag-${tag.kind}`} aria-hidden="true" />
                              <span>{tag.name}</span>
                              <small>{tag.kind === "juridica" ? "Jurídica" : tag.kind === "contabil" ? "Contábil" : "Geral"}</small>
                            </button>
                          ))}
                        {!tags.some((tag) =>
                          !selectedTagSlugs.includes(tag.slug)
                          && tag.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                            .includes(tagQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
                        ) && <p>Nenhuma tag encontrada.</p>}
                      </div>
                    </div>
                  )}
                </div>
                  </fieldset>
                </div>
              </details>
              <details className="editor-section" name="article-editor-sections">
                <summary><span>Vídeo explicativo</span><small>{youtubeUrl.trim() ? "Link informado" : "Opcional"}</small></summary>
                <div className="editor-section-body">
                  <label>
                    Vídeo explicativo no YouTube
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(event) => setYoutubeUrl(event.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                    <small className="field-help">Opcional. O convite para assistir aparecerá ao final do artigo.</small>
                  </label>
                </div>
              </details>
              <details className="editor-section" name="article-editor-sections">
                <summary><span>Conteúdo do artigo</span><small>Texto, imagens, fórmulas e notas</small></summary>
                <div className="editor-section-body editor-content-section">
                  <div className="editor-content-field">
                    <div className="editor-content-label"><strong>Conteúdo</strong><span>Editor do site</span></div>
                    <RichEditor
                      value={html}
                      onChange={setHtml}
                      publishedArticles={articles
                        .filter((article) => article.status === "published" && article.slug !== originalSlug)
                        .map((article) => ({ title: article.title, slug: article.slug }))}
                      bibliographicReferences={editorReferences}
                      onReferencesLoaded={mergeEditorReferences}
                      focusFootnote={focusedFootnote}
                      onReferenceCreated={(reference) => {
                        const adminReference: AdminReference = {
                          ...reference,
                          usageCount: 0,
                          fichamentoCount: 0,
                          possibleDuplicates: [],
                        };
                        setReferences((current) => [...current, adminReference]
                          .sort((a, b) => a.referenceText.localeCompare(b.referenceText, "pt-BR")));
                        mergeEditorReferences([reference]);
                        void loadReferences();
                      }}
                    />
                  </div>
                </div>
              </details>
            </div>
          </>
        )}

        {tab === "publications" && (
          <>
            <div className="admin-heading">
              <div><p className="eyebrow">Produção acadêmica</p><h1>Publicações</h1></div>
              <button className="button primary" type="button" onClick={newPublication}><Plus size={16} />Nova publicação</button>
            </div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <div className="admin-table-wrap">
              <table className="admin-table publications-admin-table">
                <thead><tr><th>Referência completa</th><th>Data de ordenação</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {publications.map((publication) => (
                    <tr key={publication.id}>
                      <td><div className="admin-publication-reference" dangerouslySetInnerHTML={{ __html: publication.reference_html }} /></td>
                      <td>{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${publication.publication_date}T12:00:00Z`))}</td>
                      <td><span className={`status-pill ${publication.status}`}>{publication.status === "published" ? "Publicado" : "Rascunho"}</span></td>
                      <td>
                        <div className="table-actions">
                          <button className="table-action" type="button" onClick={() => editPublication(publication)}><Pencil size={14} />Editar</button>
                          <button className="table-action danger-action" type="button" onClick={() => void deletePublication(publication)}><Trash2 size={14} />Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!publications.length && <tr><td colSpan={4}>Nenhuma publicação cadastrada.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "publication-editor" && (
          <>
            <div className="admin-heading editor-heading">
              <div><p className="eyebrow">Produção acadêmica</p><h1>{publicationId ? "Editar publicação" : "Nova publicação"}</h1></div>
              <div className="editor-actions">
                <button className="button primary" type="button" disabled={saving || uploadingPdf} onClick={() => void savePublication()}><Save size={15} />{saving ? "Salvando…" : "Salvar publicação"}</button>
              </div>
            </div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <div className="editor-fields publication-editor-fields">
              <div className="editor-content-field">
                <div className="editor-content-label"><strong>Referência completa</strong><span>Preenchimento manual conforme a ABNT</span></div>
                <PublicationReferenceEditor value={referenceHtml} onChange={setReferenceHtml} />
              </div>
              <label>
                Arquivo em PDF <span>Opcional</span>
                <span className="publication-file-input">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={uploadingPdf}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadPublicationPdf(file);
                      event.target.value = "";
                    }}
                  />
                  <span><Upload size={15} aria-hidden="true" />{uploadingPdf ? "Enviando…" : publicationPdfKey ? "Substituir PDF" : "Selecionar PDF"}</span>
                </span>
                {publicationPdfKey && (
                  <small className="attached-file">
                    <FileText size={14} aria-hidden="true" />PDF anexado
                    <button type="button" onClick={() => setPublicationPdfKey("")}>Remover</button>
                  </small>
                )}
                <small className="field-help">PDF de até 20 MB. O arquivo ficará disponível somente após salvar.</small>
              </label>
              <label>
                Link externo para a publicação <span>Opcional</span>
                <input type="url" value={publicationUrl} onChange={(event) => setPublicationUrl(event.target.value)} placeholder="https://..." />
              </label>
              <label>
                Data interna de publicação ou ordenação
                <input type="date" required value={publicationDate} onChange={(event) => setPublicationDate(event.target.value)} />
                <small className="field-help">Usada apenas para ordenar a lista pública, do registro mais recente para o mais antigo.</small>
              </label>
              <label>
                Status
                <select value={publicationStatus} onChange={(event) => setPublicationStatus(event.target.value as "draft" | "published")}>
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
              </label>
            </div>
          </>
        )}

        {tab === "references" && (
          <>
            <div className="admin-heading">
              <div><p className="eyebrow">Bibliografia do Blog</p><h1>Referências</h1></div>
              <details className="reference-export-menu">
                <summary className="button secondary">
                  <Download size={16} aria-hidden="true" />Exportar para Word
                </summary>
                <div>
                  <a href="/api/admin/references/export-word">
                    <strong>Referências bibliográficas</strong>
                    <span>Lista limpa, em ordem alfabética.</span>
                  </a>
                  <a href="/api/admin/references/export-word-with-fichamentos">
                    <strong>Referências com fichamentos</strong>
                    <span>Inclui temas, trechos, localizações e observações.</span>
                  </a>
                </div>
              </details>
            </div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <details
              id="reference-form-panel"
              className={`admin-section reference-panel${editingReferenceId ? " is-editing" : ""}`}
              name="reference-main-panels"
            >
              <summary>
                <span>
                  {editingReferenceId ? "Editar referência" : "Cadastrar referência"}
                  {editingReferenceId && <em className="editing-state-badge">Em edição</em>}
                </span>
                <small>Dados bibliográficos da obra</small>
              </summary>
              <div className="reference-panel-body reference-admin-form">
                <p>Informe somente os dados bibliográficos da obra. Páginas, capítulos e comentários pertencem à nota em que a obra for citada.</p>
                <div className="bibliographic-reference-editor-field">
                  <strong>Referência bibliográfica completa</strong>
                  <PublicationReferenceEditor
                    value={bibliographicReferenceDraft}
                    onChange={(value) => {
                      setBibliographicReferenceDraft(value);
                      setSimilarReferenceWarnings([]);
                    }}
                  />
                </div>
                {similarReferenceWarnings.length > 0 && (
                  <div className="similar-reference-warning">
                    <strong>Possíveis referências duplicadas</strong>
                    {similarReferenceWarnings.map((reference) => <p key={reference.id}>{reference.referenceText}</p>)}
                    <button type="button" onClick={() => void saveBibliographicReference(true)}>Salvar mesmo assim</button>
                  </div>
                )}
                <div>
                  <button
                    className="button primary"
                    type="button"
                    disabled={saving || bibliographicReferenceDraft.replace(/<[^>]+>/g, " ").trim().length < 10}
                    onClick={() => void saveBibliographicReference()}
                  >
                    <Save size={15} />{saving ? "Salvando…" : editingReferenceId ? "Salvar alteração" : "Criar referência"}
                  </button>
                  {editingReferenceId && (
                    <button className="button secondary" type="button" onClick={resetReferenceForm}>
                      <X size={15} />Cancelar
                    </button>
                  )}
                </div>
              </div>
            </details>
            <details className="admin-section reference-panel reference-topic-browser">
              <summary>
                <span>Busca por temas</span>
                <small>Filtrar fichamentos</small>
              </summary>
              <div className="reference-panel-body">
                <div className="admin-section-heading">
                  <p>
                    Selecione um ou mais temas. Quando houver vários, serão exibidos apenas os fichamentos que contenham todos eles.
                  </p>
                  <label className="reference-topic-search">
                    <span>Localizar tema</span>
                    <input
                      type="search"
                      value={referenceTopicQuery}
                      onChange={(event) => setReferenceTopicQuery(event.target.value)}
                      placeholder="Digite o nome do tema"
                    />
                  </label>
                </div>
              <div className="reference-topic-list" aria-label="Temas disponíveis">
                {visibleFichamentoTopics.map((topic) => {
                  const selected = selectedFichamentoFilterTopicIds.includes(topic.id);
                  return (
                    <button
                      type="button"
                      key={topic.id}
                      className={selected ? "active" : undefined}
                      aria-pressed={selected}
                      disabled={!topic.usageCount}
                      title={topic.usageCount ? undefined : "Este tema não possui fichamentos disponíveis."}
                      onClick={() => toggleFichamentoFilterTopic(topic.id)}
                    >
                      {topic.name}
                      {typeof topic.usageCount === "number" && <span>{topic.usageCount}</span>}
                    </button>
                  );
                })}
                {!visibleFichamentoTopics.length && <p>Nenhum tema encontrado.</p>}
              </div>
              <div className="reference-topic-status" aria-live="polite">
                <span>
                  {selectedFichamentoFilterTopicIds.length
                    ? `${selectedFichamentoFilterTopicIds.length} ${selectedFichamentoFilterTopicIds.length === 1 ? "tema selecionado" : "temas selecionados"}`
                    : "Nenhum filtro por tema."}
                </span>
                {selectedFichamentoFilterTopicIds.length > 0 && (
                  <button type="button" onClick={() => {
                    setSelectedFichamentoFilterTopicIds([]);
                    setReferencePage(1);
                  }}>
                    <X size={13} aria-hidden="true" />Limpar temas
                  </button>
                )}
              </div>
              <details className="reference-topic-manager">
                <summary>
                  <span>Gerenciar temas</span>
                  <small>Criar, editar ou excluir</small>
                </summary>
                <div className="reference-topic-manager-body">
                  <div className="reference-topic-create">
                    <label>
                      Novo tema
                      <input
                        value={newFichamentoTopicName}
                        onChange={(event) => setNewFichamentoTopicName(event.target.value)}
                        maxLength={120}
                        placeholder="Nome do tema"
                      />
                    </label>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={savingFichamentoTopic || newFichamentoTopicName.trim().length < 2}
                      onClick={() => void createManagedFichamentoTopic()}
                    >
                      <Plus size={14} aria-hidden="true" />Criar tema
                    </button>
                  </div>
                  <div className="reference-topic-management-list">
                    {fichamentoTopics.map((topic) => (
                      <article key={topic.id}>
                        {editingFichamentoTopicId === topic.id ? (
                          <>
                            <label>
                              <span className="sr-only">Nome do tema</span>
                              <input
                                value={editingFichamentoTopicName}
                                onChange={(event) => setEditingFichamentoTopicName(event.target.value)}
                                maxLength={120}
                              />
                            </label>
                            <div>
                              <button
                                type="button"
                                disabled={savingFichamentoTopic || editingFichamentoTopicName.trim().length < 2}
                                onClick={() => void saveManagedFichamentoTopic()}
                              >
                                <Save size={13} aria-hidden="true" />Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFichamentoTopicId(undefined);
                                  setEditingFichamentoTopicName("");
                                }}
                              >
                                <X size={13} aria-hidden="true" />Cancelar
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <strong>{topic.name}</strong>
                              <small>
                                {topic.usageCount || 0} {(topic.usageCount || 0) === 1 ? "utilização" : "utilizações"}
                              </small>
                            </div>
                            <div>
                              <button type="button" onClick={() => beginFichamentoTopicEdit(topic)}>
                                <Pencil size={13} aria-hidden="true" />Editar
                              </button>
                              <button
                                className="danger-action"
                                type="button"
                                title={topic.usageCount ? "Excluir tema e retirar seus vínculos dos fichamentos" : "Excluir tema"}
                                onClick={() => void deleteManagedFichamentoTopic(topic)}
                              >
                                <Trash2 size={13} aria-hidden="true" />Excluir
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                    {!fichamentoTopics.length && <p>Nenhum tema cadastrado.</p>}
                  </div>
                </div>
              </details>
              </div>
            </details>
            <section className="reference-management">
              <details id="references-list-panel" className="admin-section reference-panel" name="reference-main-panels">
                <summary>
                  <span>Referências cadastradas</span>
                  <small>{referenceTotal} {referenceTotal === 1 ? "registro" : "registros"}</small>
                </summary>
                <div className="reference-panel-body reference-admin-list">
                <div className="admin-section-heading">
                  <p>Exibidas em ordem alfabética.</p>
                  <div className="reference-list-searches">
                    <label className="reference-search">
                      <span>Pesquisar referências</span>
                      <input
                        type="search"
                        value={referenceQuery}
                        onChange={(event) => {
                          setReferenceQuery(event.target.value);
                          setReferencePage(1);
                        }}
                        placeholder="Pesquisar autor, título ou expressão"
                      />
                    </label>
                    <label className="reference-search">
                      <span>Pesquisar nos fichamentos</span>
                      <input
                        type="search"
                        value={referenceFichamentoQuery}
                        onFocus={() => void loadReferences()}
                        onChange={(event) => {
                          setReferenceFichamentoQuery(event.target.value);
                          setReferencePage(1);
                        }}
                        placeholder="Citação, anotação, página ou observação"
                      />
                    </label>
                  </div>
                </div>
                {normalizedFichamentoQuery && (
                  <p className={`reference-fichamento-search-feedback${unsavedFichamentoMatchesSearch ? " warning" : ""}`} aria-live="polite">
                    {unsavedFichamentoMatchesSearch
                      ? "A expressão também está no formulário aberto, mas esse registro ainda precisa ser salvo para integrar a pesquisa geral."
                      : filteredReferences.length
                        ? `${referenceTotal} ${referenceTotal === 1 ? "referência encontrada" : "referências encontradas"} com os filtros atuais.`
                        : `Nenhum fichamento salvo contém “${referenceFichamentoQuery.trim()}”.`}
                  </p>
                )}
                <div className="reference-records">
                  {filteredReferences.map((reference) => (
                      <article key={reference.id}>
                        <div className="reference-record-text">
                          <div
                            className="formatted-bibliographic-reference"
                            dangerouslySetInnerHTML={{ __html: reference.referenceHtml }}
                          />
                          {reference.possibleDuplicates?.length > 0 && (
                            <small className="duplicate-reference-alert">
                              Possível duplicata de: {reference.possibleDuplicates.map((item) => item.referenceText).join(" · ")}
                            </small>
                          )}
                        </div>
                        <div className="reference-usages">
                          {reference.usageCount > 0 ? (
                            <details onToggle={(event) => {
                              if (event.currentTarget.open && !reference.usages && loadingReferenceDetailId !== reference.id) {
                                void loadReferenceDetails(reference.id);
                              }
                            }}>
                              <summary>
                                {reference.usageCount} {reference.usageCount === 1 ? "utilização" : "utilizações"}
                              </summary>
                              <div>
                                {loadingReferenceDetailId === reference.id && <span>Carregando utilizações…</span>}
                                {reference.usages?.map((usage) => (
                                  <button
                                    type="button"
                                    key={`${usage.articleSlug}-${usage.footnoteId}-${usage.occurrenceIndex}`}
                                    onClick={() => {
                                      const article = articles.find((item) => item.slug === usage.articleSlug);
                                      if (article) editArticle(article, usage.footnoteId);
                                    }}
                                  >
                                    {usage.articleTitle} — nota {usage.noteNumber}
                                    {usage.citationDetails && <small>{usage.citationDetails}</small>}
                                  </button>
                                ))}
                                {!reference.usages && loadingReferenceDetailId !== reference.id && (
                                  <button type="button" onClick={() => void loadReferenceDetails(reference.id)}>Carregar utilizações</button>
                                )}
                              </div>
                            </details>
                          ) : (
                            <span>Não utilizada.</span>
                          )}
                          <button
                            className="reference-fichamento-toggle"
                            type="button"
                            aria-expanded={activeFichamentoReferenceId === reference.id}
                            onClick={() => void toggleReferenceFichamento(reference.id)}
                          >
                            <ClipboardList size={14} aria-hidden="true" />
                            Fichamento
                            {reference.fichamentoCount > 0 && <span>{reference.fichamentoCount}</span>}
                          </button>
                        </div>
                        <div className="reference-record-actions">
                          <button type="button" onClick={() => beginReferenceEdit(reference)}><Pencil size={14} />Editar</button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => void deleteBibliographicReference(reference)}
                          >
                            <Trash2 size={14} />Excluir
                          </button>
                        </div>
                        {activeFichamentoReferenceId === reference.id && (
                          <section className={`reference-fichamento-panel${editingFichamentoId ? " is-editing" : ""}`} aria-label={`Fichamento de ${reference.referenceText}`}>
                            <div className="reference-fichamento-heading">
                              <div>
                                <h3>
                                  Fichamento
                                  {editingFichamentoId && <em className="editing-state-badge">Em edição</em>}
                                </h3>
                                <p title={reference.referenceText}>{reference.referenceText}</p>
                                <small>Trechos, sínteses e anotações privadas desta referência.</small>
                              </div>
                              <div className="reference-fichamento-controls">
                                <label>
                                  <span className="sr-only">Pesquisar no fichamento</span>
                                  <input
                                    type="search"
                                    value={fichamentoQuery}
                                    onChange={(event) => setFichamentoQuery(event.target.value)}
                                    placeholder="Pesquisar no fichamento"
                                  />
                                </label>
                              </div>
                            </div>
                            {selectedFichamentoFilterTopicIds.length > 0 && (
                              <p className="fichamento-active-filter">
                                Aplicando os temas selecionados na busca geral acima.
                              </p>
                            )}
                            <details
                              className={`reference-fichamento-editor${editingFichamentoId ? " is-editing" : ""}`}
                              open={fichamentoFormOpen}
                              onToggle={(event) => setFichamentoFormOpen(event.currentTarget.open)}
                            >
                              <summary>
                                <span>
                                  {editingFichamentoId ? "Editar registro" : "Adicionar ao fichamento"}
                                  {editingFichamentoId && <em className="editing-state-badge">Em edição</em>}
                                </span>
                                <small>{fichamentoFormOpen ? "Ocultar formulário" : "Abrir formulário"}</small>
                              </summary>
                              <div className="reference-fichamento-form">
                              <label className="fichamento-content-field">
                                Citação literal <small>Opcional</small>
                                <textarea
                                  value={fichamentoLiteralQuote}
                                  onChange={(event) => setFichamentoLiteralQuote(event.target.value)}
                                  maxLength={20_000}
                                  rows={5}
                                  placeholder="Transcreva fielmente o trecho da obra."
                                />
                              </label>
                              <label className="fichamento-paraphrase-field">
                                Síntese ou paráfrase <small>Opcional</small>
                                <textarea
                                  value={fichamentoParaphrase}
                                  onChange={(event) => setFichamentoParaphrase(event.target.value)}
                                  maxLength={20_000}
                                  rows={5}
                                  placeholder="Registre a ideia com suas próprias palavras."
                                />
                              </label>
                              <label>
                                Página, capítulo ou localização
                                <input
                                  value={fichamentoLocation}
                                  onChange={(event) => setFichamentoLocation(event.target.value)}
                                  maxLength={500}
                                  placeholder="Ex.: p. 22; cap. 3"
                                />
                              </label>
                              <div className="fichamento-topic-field">
                                <strong>Temas</strong>
                                <p>Vocabulário privado e independente das tags públicas do Blog.</p>
                                {selectedFichamentoTopicIds.length > 0 && (
                                  <div className="selected-fichamento-topics">
                                    {selectedFichamentoTopicIds.map((id) => {
                                      const topic = fichamentoTopics.find((item) => item.id === id);
                                      if (!topic) return null;
                                      return (
                                        <button
                                          type="button"
                                          key={id}
                                          onClick={() => setSelectedFichamentoTopicIds((current) => current.filter((item) => item !== id))}
                                          aria-label={`Remover tema ${topic.name}`}
                                        >
                                          {topic.name}<X size={12} aria-hidden="true" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="fichamento-topic-picker">
                                  <input
                                    value={fichamentoTopicQuery}
                                    onFocus={() => setFichamentoTopicPickerOpen(true)}
                                    onChange={(event) => {
                                      setFichamentoTopicQuery(event.target.value);
                                      setFichamentoTopicPickerOpen(true);
                                    }}
                                    placeholder="Pesquisar ou criar tema"
                                    aria-label="Pesquisar ou criar tema do fichamento"
                                  />
                                  <button
                                    type="button"
                                    aria-expanded={fichamentoTopicPickerOpen}
                                    onClick={() => setFichamentoTopicPickerOpen((current) => !current)}
                                  >
                                    {fichamentoTopicPickerOpen ? "Fechar" : "Ver temas"}
                                  </button>
                                  {fichamentoTopicPickerOpen && (
                                    <div className="fichamento-topic-results">
                                      {fichamentoTopics
                                        .filter((topic) => !selectedFichamentoTopicIds.includes(topic.id))
                                        .filter((topic) => normalizeAdminSearch(topic.name).includes(normalizeAdminSearch(fichamentoTopicQuery)))
                                        .slice(0, 12)
                                        .map((topic) => (
                                          <button
                                            type="button"
                                            key={topic.id}
                                            onClick={() => {
                                              setSelectedFichamentoTopicIds((current) => [...current, topic.id]);
                                              setFichamentoTopicQuery("");
                                            }}
                                          >
                                            {topic.name}
                                          </button>
                                        ))}
                                      {fichamentoTopicQuery.trim().length >= 2
                                        && !fichamentoTopics.some((topic) => normalizeAdminSearch(topic.name) === normalizeAdminSearch(fichamentoTopicQuery)) && (
                                        <button className="create-fichamento-topic" type="button" onClick={() => void createFichamentoTopic()}>
                                          <Plus size={13} aria-hidden="true" />Criar “{fichamentoTopicQuery.trim()}”
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="fichamento-note-field">
                                <strong>Observação pessoal</strong>
                                <div className="fichamento-note-toolbar" aria-label="Formatação da observação pessoal">
                                  <button type="button" title="Negrito" aria-label="Aplicar negrito" onClick={() => formatFichamentoPersonalNote("**")}>
                                    <Bold size={14} aria-hidden="true" />
                                  </button>
                                  <button type="button" title="Itálico" aria-label="Aplicar itálico" onClick={() => formatFichamentoPersonalNote("*")}>
                                    <Italic size={14} aria-hidden="true" />
                                  </button>
                                </div>
                                <textarea
                                  ref={fichamentoPersonalNoteRef}
                                  value={fichamentoPersonalNote}
                                  onChange={(event) => setFichamentoPersonalNote(event.target.value)}
                                  maxLength={10_000}
                                  rows={3}
                                  placeholder="Comentário privado opcional."
                                />
                              </div>
                              <div className="fichamento-related-field">
                                <strong><Link2 size={14} aria-hidden="true" />Remissões para outros fichamentos</strong>
                                <p>Vincule este registro a outros fichamentos já salvos. O destino receberá automaticamente o retorno “Referenciado por”.</p>
                                {selectedRelatedFichamentoIds.length > 0 && (
                                  <div className="selected-fichamento-links">
                                    {selectedRelatedFichamentoIds.map((id) => {
                                      const target = allReferenceFichamentos.find((item) => item.id === id);
                                      const targetReference = editorReferences.find((item) => item.id === target?.referenceId);
                                      return (
                                        <div key={id}>
                                          <span>
                                            <strong>{targetReference?.referenceText || "Fichamento relacionado"}</strong>
                                            {target?.literalQuote || target?.paraphrase || target?.personalNote || "Carregando registro…"}
                                          </span>
                                          <button
                                            type="button"
                                            aria-label="Remover remissão"
                                            onClick={() => setSelectedRelatedFichamentoIds((current) => current.filter((item) => item !== id))}
                                          >
                                            <X size={13} aria-hidden="true" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="fichamento-related-picker">
                                  <input
                                    type="search"
                                    value={relatedFichamentoQuery}
                                    onFocus={() => {
                                      setRelatedFichamentoPickerOpen(true);
                                      if (!allReferenceFichamentos.length) void loadAllReferenceFichamentos();
                                    }}
                                    onChange={(event) => {
                                      setRelatedFichamentoQuery(event.target.value);
                                      setRelatedFichamentoPickerOpen(true);
                                    }}
                                    placeholder="Pesquisar referência ou fichamento"
                                    aria-label="Pesquisar fichamento para criar remissão"
                                  />
                                  <button
                                    type="button"
                                    aria-expanded={relatedFichamentoPickerOpen}
                                    onClick={() => {
                                      setRelatedFichamentoPickerOpen((current) => !current);
                                      if (!allReferenceFichamentos.length) void loadAllReferenceFichamentos();
                                    }}
                                  >
                                    {relatedFichamentoPickerOpen ? "Fechar" : "Vincular"}
                                  </button>
                                  {relatedFichamentoPickerOpen && (
                                    <div className="fichamento-related-results">
                                      {loadingRelatedFichamentos && <p>Carregando fichamentos…</p>}
                                      {!loadingRelatedFichamentos && relatedFichamentoCandidates.map((candidate) => {
                                        const candidateReference = editorReferences.find((item) => item.id === candidate.referenceId);
                                        return (
                                          <button
                                            type="button"
                                            key={candidate.id}
                                            onClick={() => {
                                              setSelectedRelatedFichamentoIds((current) => [...current, candidate.id]);
                                              setRelatedFichamentoQuery("");
                                            }}
                                          >
                                            <strong>{candidateReference?.referenceText || "Referência"}</strong>
                                            <span>{candidate.literalQuote && candidate.paraphrase ? "Citação e paráfrase" : candidate.literalQuote ? "Citação literal" : candidate.paraphrase ? "Síntese ou paráfrase" : "Observação pessoal"}{candidate.location ? ` · ${candidate.location}` : ""}</span>
                                            <small>{candidate.literalQuote || candidate.paraphrase || candidate.personalNote}</small>
                                          </button>
                                        );
                                      })}
                                      {!loadingRelatedFichamentos && !relatedFichamentoCandidates.length && (
                                        <p>Nenhum outro fichamento corresponde à pesquisa.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="reference-fichamento-form-actions">
                                <button
                                  className="button primary"
                                  type="button"
                                  disabled={savingFichamento || ![fichamentoLiteralQuote, fichamentoParaphrase, fichamentoPersonalNote].some((value) => value.trim())}
                                  onClick={() => void saveReferenceFichamento(reference.id)}
                                >
                                  <Save size={14} aria-hidden="true" />
                                  {savingFichamento ? "Salvando…" : editingFichamentoId ? "Salvar alteração" : "Adicionar ao fichamento"}
                                </button>
                                {editingFichamentoId && (
                                  <button className="button secondary" type="button" onClick={resetFichamentoForm}>
                                    <X size={14} aria-hidden="true" />Cancelar edição
                                  </button>
                                )}
                              </div>
                              </div>
                            </details>
                            <div className="reference-fichamento-entries">
                              {(referenceFichamentos[reference.id] || [])
                                .filter((item) => selectedFichamentoFilterTopicIds
                                  .every((topicId) => item.topics.some((topic) => topic.id === topicId)))
                                .filter((item) => !normalizedFichamentoQuery
                                  || normalizeAdminSearch(`${item.literalQuote} ${item.paraphrase} ${item.location} ${item.personalNote} ${item.topics.map((topic) => topic.name).join(" ")}`)
                                    .includes(normalizedFichamentoQuery))
                                .filter((item) => normalizeAdminSearch(`${item.literalQuote} ${item.paraphrase} ${item.location} ${item.personalNote} ${item.topics.map((topic) => topic.name).join(" ")}`)
                                  .includes(normalizeAdminSearch(fichamentoQuery)))
                                .map((item) => (
                                  <article key={item.id} id={`fichamento-${item.id}`}>
                                    <div className="reference-fichamento-entry-heading">
                                      <strong>
                                        {item.literalQuote && item.paraphrase ? "Citação e paráfrase" : item.literalQuote ? "Citação literal" : item.paraphrase ? "Síntese ou paráfrase" : "Observação pessoal"}
                                      </strong>
                                      {item.location && <span>{item.location}</span>}
                                    </div>
                                    {item.topics.length > 0 && (
                                      <div className="fichamento-entry-topics">
                                        {item.topics.map((topic) => (
                                          <button
                                            type="button"
                                            key={topic.id}
                                            className={selectedFichamentoFilterTopicIds.includes(topic.id) ? "active" : undefined}
                                            aria-pressed={selectedFichamentoFilterTopicIds.includes(topic.id)}
                                            title={selectedFichamentoFilterTopicIds.includes(topic.id) ? "Remover este tema do filtro" : "Adicionar este tema ao filtro"}
                                            onClick={() => toggleFichamentoFilterTopic(topic.id)}
                                          >
                                            {topic.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {item.literalQuote && (
                                      <section className="fichamento-entry-text literal">
                                        <strong>Citação literal</strong>
                                        <p>{item.literalQuote}</p>
                                      </section>
                                    )}
                                    {item.paraphrase && (
                                      <section className="fichamento-entry-text paraphrase">
                                        <strong>Síntese ou paráfrase</strong>
                                        <p>{item.paraphrase}</p>
                                      </section>
                                    )}
                                    {item.personalNote && (
                                      <aside>
                                        <strong>Observação pessoal</strong>
                                        <span dangerouslySetInnerHTML={{ __html: formattedPersonalNote(item.personalNote) }} />
                                      </aside>
                                    )}
                                    {(item.relatedFichamentos?.length > 0 || item.backlinks?.length > 0) && (
                                      <div className="fichamento-entry-links">
                                        {item.relatedFichamentos?.length > 0 && (
                                          <section>
                                            <strong>Remissões</strong>
                                            {item.relatedFichamentos.map((link) => (
                                              <button type="button" key={link.id} onClick={() => void openLinkedFichamento(link)}>
                                                <Link2 size={12} aria-hidden="true" />
                                                <span>
                                                  {link.referenceText}
                                                  <small>{link.literalQuote && link.paraphrase ? "Citação e paráfrase" : link.literalQuote ? "Citação literal" : link.paraphrase ? "Síntese ou paráfrase" : "Observação pessoal"}{link.location ? ` · ${link.location}` : ""}</small>
                                                </span>
                                              </button>
                                            ))}
                                          </section>
                                        )}
                                        {item.backlinks?.length > 0 && (
                                          <section>
                                            <strong>Referenciado por</strong>
                                            {item.backlinks.map((link) => (
                                              <button type="button" key={link.id} onClick={() => void openLinkedFichamento(link)}>
                                                <Link2 size={12} aria-hidden="true" />
                                                <span>
                                                  {link.referenceText}
                                                  <small>{link.literalQuote && link.paraphrase ? "Citação e paráfrase" : link.literalQuote ? "Citação literal" : link.paraphrase ? "Síntese ou paráfrase" : "Observação pessoal"}{link.location ? ` · ${link.location}` : ""}</small>
                                                </span>
                                              </button>
                                            ))}
                                          </section>
                                        )}
                                      </div>
                                    )}
                                    <div>
                                      {item.literalQuote && (
                                        <button type="button" onClick={() => void copyFichamentoField(item.literalQuote, "Citação literal")}>
                                          <Copy size={13} aria-hidden="true" />Copiar citação literal
                                        </button>
                                      )}
                                      {item.paraphrase && (
                                        <button type="button" onClick={() => void copyFichamentoField(item.paraphrase, "Paráfrase")}>
                                          <Copy size={13} aria-hidden="true" />Copiar paráfrase
                                        </button>
                                      )}
                                      <button type="button" onClick={() => beginFichamentoEdit(item)}>
                                        <Pencil size={13} aria-hidden="true" />Editar
                                      </button>
                                      <button className="danger-action" type="button" onClick={() => void deleteReferenceFichamento(item)}>
                                        <Trash2 size={13} aria-hidden="true" />Excluir
                                      </button>
                                    </div>
                                  </article>
                                ))}
                              {referenceFichamentos[reference.id] && referenceFichamentos[reference.id].length === 0 && (
                                <p className="empty-fichamento">Nenhum registro neste fichamento.</p>
                              )}
                            </div>
                          </section>
                        )}
                      </article>
                    ))}
                  {!references.length && <p>Nenhuma referência cadastrada.</p>}
                  {references.length > 0 && !filteredReferences.length && (
                    <p>Nenhuma referência ou fichamento corresponde aos filtros.</p>
                  )}
                </div>
                {loadingReferences && <p className="admin-loading" aria-live="polite">Carregando referências…</p>}
                {referencePageCount > 1 && (
                  <nav className="admin-pagination" aria-label="Paginação das referências">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={referencePage <= 1 || loadingReferences}
                      onClick={() => setReferencePage((page) => Math.max(1, page - 1))}
                    >
                      Anterior
                    </button>
                    <span>Página {referencePage} de {referencePageCount}</span>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={referencePage >= referencePageCount || loadingReferences}
                      onClick={() => setReferencePage((page) => Math.min(referencePageCount, page + 1))}
                    >
                      Próxima
                    </button>
                  </nav>
                )}
                </div>
              </details>
            </section>
          </>
        )}

        {tab === "taxonomy" && (
          <>
            <div className="admin-heading"><div><p className="eyebrow">Organização</p><h1>Tags</h1></div></div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <section className="admin-section tag-management">
              <div>
                <h2>{editingTagId ? "Editar tag" : "Criar tag"}</h2>
                <div className="tag-form">
                  <label>Nome<input value={tagName} onChange={(event) => setTagName(event.target.value)} maxLength={120} placeholder="Ex.: Direito societário" /></label>
                  <label>Área
                    <select value={tagKind} onChange={(event) => setTagKind(event.target.value as TagKind)}>
                      <option value="juridica">Jurídica</option>
                      <option value="contabil">Contábil</option>
                      <option value="geral">Geral</option>
                    </select>
                  </label>
                  <button className="button primary" type="button" disabled={tagName.trim().length < 2} onClick={() => void saveTag()}>
                    <Save size={15} />{editingTagId ? "Salvar alteração" : "Criar tag"}
                  </button>
                  {editingTagId && <button className="button secondary" type="button" onClick={() => { setEditingTagId(undefined); setTagName(""); setTagKind("juridica"); }}><X size={15} />Cancelar</button>}
                </div>
              </div>
              <div className="tag-admin-list">
                <h2>Tags cadastradas</h2>
                {!tags.length && <p>Nenhuma tag cadastrada.</p>}
                {tags.map((tag) => (
                  <article key={tag.id}>
                    <span className={`tag-preview tag-${tag.kind}`}>{tag.name}</span>
                    <small>{tag.articleCount || 0} {(tag.articleCount || 0) === 1 ? "artigo" : "artigos"}</small>
                    <button type="button" onClick={() => beginTagEdit(tag)}><Pencil size={14} />Editar</button>
                    <button className="danger-action" type="button" onClick={() => void deleteTag(tag)}><Trash2 size={14} />Excluir</button>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === "comments" && (
          <>
            <div className="admin-heading"><div><p className="eyebrow">Moderação</p><h1>Comentários</h1></div></div>
            {notice && <p className="admin-notice" aria-live="polite">{notice}</p>}
            <section className="admin-section comment-management">
              <h2>Comentários publicados</h2>
              {!comments.length && <p>Nenhum comentário publicado.</p>}
              {comments.map((comment) => (
                <article key={comment.id}>
                  <header>
                    <div><strong>{comment.authorName}</strong>{comment.isAdmin && <span className="author-badge">Autor</span>}</div>
                    <small>{comment.articleTitle}</small>
                  </header>
                  {editingCommentId === comment.id ? (
                    <>
                      <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength={4000} rows={5} />
                      <div>
                        <button className="button primary" type="button" onClick={() => void saveComment(comment)}><Save size={15} />Salvar comentário</button>
                        <button className="button secondary" type="button" onClick={() => { setEditingCommentId(undefined); setCommentDraft(""); }}>Cancelar</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{comment.body}</p>
                      <div className="comment-admin-actions">
                        <button type="button" onClick={() => { setEditingCommentId(comment.id); setCommentDraft(comment.body); }}><Pencil size={14} />Editar para moderação</button>
                        <button className="danger-action" type="button" onClick={() => void deleteComment(comment)}><Trash2 size={14} />Excluir</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </section>
          </>
        )}

        {tab === "youtube" && (
          <>
            <div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Cursos e vídeos</h1></div></div>
            <div className="two-admin-panels">
              <section className="admin-section"><h2>Cursos</h2><p>O cadastro será habilitado após a definição do primeiro curso.</p></section>
              <section className="admin-section"><h2>Vídeos</h2><p>Cadastro manual de vídeos do canal do YouTube.</p></section>
            </div>
          </>
        )}

        {tab === "settings" && (
          <>
            <div className="admin-heading"><div><p className="eyebrow">Administração</p><h1>Configurações</h1></div></div>
            <section className="admin-section"><h2>Informações do site</h2><p>Dados institucionais, contato e canais oficiais serão centralizados nesta área.</p></section>
            <section className="admin-section account-settings">
              <div>
                <h2>Conta administrativa</h2>
                <p>Altere o e-mail de acesso e, quando necessário, defina uma nova senha. A senha é armazenada somente como hash.</p>
              </div>
              <form onSubmit={updateAccount}>
                <label>
                  E-mail de acesso
                  <input
                    type="email"
                    value={accountEmail}
                    onChange={(event) => setAccountEmail(event.target.value)}
                    autoComplete="username"
                    required
                    maxLength={320}
                  />
                </label>
                <label>
                  Senha atual
                  <input
                    type="password"
                    value={accountCurrentPassword}
                    onChange={(event) => setAccountCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  Nova senha <small>(deixe em branco para manter a atual)</small>
                  <input
                    type="password"
                    value={accountNewPassword}
                    onChange={(event) => setAccountNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={200}
                  />
                </label>
                <label>
                  Confirmar nova senha
                  <input
                    type="password"
                    value={accountPasswordConfirmation}
                    onChange={(event) => setAccountPasswordConfirmation(event.target.value)}
                    autoComplete="new-password"
                    minLength={accountNewPassword ? 12 : undefined}
                    maxLength={200}
                  />
                </label>
                <p className="account-password-guidance">Use pelo menos 12 caracteres e evite nomes, datas e sequências previsíveis.</p>
                <button className="button primary" disabled={accountLoading || !accountEmail || !accountCurrentPassword}>
                  {accountLoading ? "Salvando…" : "Atualizar credenciais"}
                </button>
                {accountStatus && <p className="form-status" aria-live="polite">{accountStatus}</p>}
              </form>
            </section>
            <section className="admin-section account-settings analytics-settings">
              <div>
                <h2>Google Analytics 4</h2>
                <p>Configure a medição geral do tráfego. O sistema interno de visualizações permanece independente e uma sessão administrativa autenticada nunca é enviada ao Google Analytics.</p>
              </div>
              <form onSubmit={updateAnalyticsSettings}>
                <label className="analytics-enabled-control">
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={(event) => setAnalyticsEnabled(event.target.checked)}
                  />
                  <span>Ativar Google Analytics 4</span>
                </label>
                <label>
                  ID de medição
                  <input
                    type="text"
                    value={analyticsMeasurementId}
                    onChange={(event) => setAnalyticsMeasurementId(event.target.value.toUpperCase())}
                    placeholder="G-XXXXXXXXXX"
                    pattern="G-[A-Za-z0-9]+"
                    maxLength={40}
                    required={analyticsEnabled}
                    spellCheck={false}
                    autoCapitalize="characters"
                  />
                </label>
                <p className="account-password-guidance">O código do Google somente será carregado após o visitante aceitar as estatísticas e nunca será carregado em endereços iniciados por <code>/admin</code>.</p>
                <button className="button primary" disabled={analyticsLoading}>
                  {analyticsLoading ? "Salvando…" : "Salvar Google Analytics"}
                </button>
                {analyticsStatus && <p className="form-status" aria-live="polite">{analyticsStatus}</p>}
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
