import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getPublishedArticles } from "@/lib/repository";
export const revalidate = 60;

export default async function Home() {
  const articles = await getPublishedArticles();
  return (
    <PageShell>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="container home-hero-grid">
          <div className="home-hero-content">
            <p className="eyebrow">Academia Jurídico-Contábil</p>
            <h1 id="home-title">Artigos e cursos jurídico-contábeis</h1>
            <p>Conteúdo técnico para profissionais do Direito e da Contabilidade interessados no diálogo entre as duas áreas.</p>
            <div className="button-row">
              <Link className="button primary" href="/blog">Acessar o blog <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link className="button secondary" href="/cursos">Ver cursos</Link>
            </div>
          </div>
          <div className="home-hero-media">
            <Image
              src="/inicio-direito-contabilidade.jpg"
              alt="Balança da Justiça sobre livros, com calculadora e documentos contábeis"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 58vw"
            />
          </div>
        </div>
      </section>

      <section className="section home-publications">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">Blog</p><h2>Textos recentes</h2></div>
            <Link className="button primary" href="/blog">Acessar o blog <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className="publication-grid">
            {articles.slice(0, 3).map((article) => (
              <article key={article.slug} className="publication-card">
                <div className="publication-meta">
                  <time className="publication-date">{article.publishedAt}</time>
                </div>
                <h3><Link href={`/blog/${article.slug}`}>{article.title}</Link></h3>
                <p>{article.summary}</p>
                <Link className="card-link" href={`/blog/${article.slug}`}>Continuar leitura <ArrowRight size={14} aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-courses">
        <div className="container course-callout">
          <BookOpen size={22} aria-hidden="true" />
          <div>
            <p className="eyebrow">Cursos</p>
            <h2>Formação jurídico-contábil</h2>
            <p>Cursos para profissionais do Direito e da Contabilidade que desejam aprofundar conhecimentos na área complementar.</p>
          </div>
          <Link className="button secondary" href="/cursos">Consultar cursos <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
    </PageShell>
  );
}
