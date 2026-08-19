export type ArticleTag = {
  id?: string;
  name: string;
  slug: string;
  kind: "juridica" | "contabil" | "geral";
};

export type Article = {
  id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  summary: string;
  category: string;
  tags: ArticleTag[];
  author: string;
  authors: string[];
  publishedAt: string;
  updatedAt: string;
  readingTime: string;
  contentHtml?: string;
  youtubeUrl?: string;
  searchText?: string;
  bibliographicReferences?: Array<{ id: string; referenceText: string; referenceHtml: string }>;
};

export function formatAuthorNames(authors: string[]) {
  const names = authors.map((name) => name.trim()).filter(Boolean);
  if (!names.length) return "Autoria a confirmar";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

export const articles: Article[] = [
  {
    slug: "integracao-entre-direito-e-contabilidade",
    title: "A integração entre Direito e Contabilidade na tomada de decisões",
    subtitle: "Notas iniciais para uma abordagem verdadeiramente interdisciplinar",
    summary:
      "Uma introdução aos pontos de contato entre a interpretação jurídica, a informação contábil e a qualidade das decisões profissionais.",
    category: "Interdisciplinaridade",
    tags: [
      { name: "Direito", slug: "direito", kind: "juridica" },
      { name: "Contabilidade", slug: "contabilidade", kind: "contabil" },
      { name: "Decisão", slug: "decisao", kind: "geral" },
    ],
    author: "Autor a confirmar",
    authors: ["Autor a confirmar"],
    publishedAt: "22 jul. 2026",
    updatedAt: "22 jul. 2026",
    readingTime: "8 min",
  },
  {
    slug: "evidencia-contabil-e-prova",
    title: "Evidência contábil e prova: aproximações necessárias",
    summary:
      "Como documentos e demonstrações contábeis podem contribuir para a construção, a organização e a análise da prova.",
    category: "Direito e prova",
    tags: [
      { name: "Prova", slug: "prova", kind: "juridica" },
      { name: "Evidência", slug: "evidencia", kind: "juridica" },
      { name: "Documentação", slug: "documentacao", kind: "geral" },
    ],
    author: "Autor a confirmar",
    authors: ["Autor a confirmar"],
    publishedAt: "15 jul. 2026",
    updatedAt: "18 jul. 2026",
    readingTime: "6 min",
  },
  {
    slug: "leitura-critica-demonstracoes",
    title: "Leitura crítica de demonstrações contábeis para profissionais do Direito",
    summary:
      "Um roteiro provisório de leitura para reconhecer estrutura, limites e perguntas relevantes em demonstrações contábeis.",
    category: "Contabilidade aplicada",
    tags: [
      { name: "Demonstrações contábeis", slug: "demonstracoes-contabeis", kind: "contabil" },
      { name: "Análise", slug: "analise", kind: "contabil" },
      { name: "Advocacia", slug: "advocacia", kind: "juridica" },
    ],
    author: "Autor a confirmar",
    authors: ["Autor a confirmar"],
    publishedAt: "8 jul. 2026",
    updatedAt: "8 jul. 2026",
    readingTime: "10 min",
  },
  {
    slug: "precisao-conceitual",
    title: "Precisão conceitual na escrita técnica e profissional",
    summary:
      "Critérios práticos para tornar argumentos mais claros, verificáveis e úteis em textos técnicos.",
    category: "Metodologia",
    tags: [
      { name: "Escrita", slug: "escrita", kind: "geral" },
      { name: "Metodologia", slug: "metodologia", kind: "geral" },
      { name: "Clareza", slug: "clareza", kind: "geral" },
    ],
    author: "Autor a confirmar",
    authors: ["Autor a confirmar"],
    publishedAt: "1 jul. 2026",
    updatedAt: "3 jul. 2026",
    readingTime: "7 min",
  },
];

export const categories = Array.from(new Set(articles.map((article) => article.category)));

export const courses = [
  {
    title: "Curso em preparação",
    summary: "Conteúdo provisório. A ementa e as informações completas serão cadastradas quando estiverem disponíveis.",
    audience: "Público a definir",
  },
];

export const videos = [
  {
    title: "Canal da Academia Jurídico-Contábil",
    description: "Vídeos, aulas e conversas sobre Direito, Contabilidade e suas áreas de encontro. Conteúdo provisório.",
  },
];
