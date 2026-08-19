import type { Metadata } from "next";
import { Download, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getPublishedPublications } from "@/lib/publication-repository";

export const metadata: Metadata = {
  title: "Publicações",
  description: "Publicações acadêmicas da Academia Jurídico-Contábil.",
};
export const revalidate = 60;

export default async function PublicationsPage() {
  const publications = await getPublishedPublications();
  return (
    <PageShell>
      <section className="page-hero compact">
        <div className="container narrow">
          <p className="eyebrow">Produção acadêmica</p>
          <h1>Publicações</h1>
          <p>Referências de trabalhos acadêmicos e acesso aos respectivos documentos, quando disponíveis.</p>
        </div>
      </section>
      <section className="section publications-section">
        <div className="container narrow">
          {publications.length ? (
            <ul className="publications-list">
              {publications.map((publication) => (
                <li key={publication.id}>
                  <div className="publication-reference" dangerouslySetInnerHTML={{ __html: publication.reference_html }} />
                  {(publication.pdf_key || publication.external_url) && (
                    <div className="publication-actions">
                      {publication.pdf_key && (
                        <a className="button secondary" href={`/publication-files/${encodeURIComponent(publication.pdf_key)}`}>
                          <Download size={15} aria-hidden="true" />Baixar PDF
                        </a>
                      )}
                      {publication.external_url && (
                        <a className="button secondary" href={publication.external_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15} aria-hidden="true" />Acessar publicação
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-publications">Nenhuma publicação acadêmica foi disponibilizada até o momento.</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}
