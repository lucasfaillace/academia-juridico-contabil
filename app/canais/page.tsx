import type { Metadata } from "next";
import { Camera, ExternalLink, Play } from "lucide-react";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Canais",
  description: "Canais oficiais da Academia Jurídico-Contábil no YouTube e no Instagram.",
};

const channels = [
  {
    name: "YouTube",
    handle: "@academiajuridicocontabil",
    href: "https://www.youtube.com/@academiajuridicocontabil",
    description: "Aulas, vídeos explicativos e aprofundamentos relacionados aos artigos e cursos da Academia.",
    icon: Play,
  },
  {
    name: "Instagram",
    handle: "@academiajuridicocontabil",
    href: "https://www.instagram.com/academiajuridicocontabil/",
    description: "Novas publicações, cursos e conteúdos breves sobre Direito, Contabilidade e suas interfaces.",
    icon: Camera,
  },
];

export default function ChannelsPage() {
  return (
    <PageShell>
      <section className="page-hero">
        <div className="container narrow">
          <p className="eyebrow">Conteúdo e atualizações</p>
          <h1>Canais</h1>
          <p>Acompanhe a Academia Jurídico-Contábil nas plataformas oficiais.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="official-channels">
        <div className="container">
          <h2 id="official-channels" className="sr-only">Canais oficiais</h2>
          <div className="channel-list">
            {channels.map(({ name, handle, href, description, icon: Icon }) => (
              <article className="channel-card" key={name}>
                <div className="channel-icon" aria-hidden="true">
                  <Icon size={27} strokeWidth={1.8} />
                </div>
                <div className="channel-content">
                  <p className="eyebrow">Canal oficial</p>
                  <h2>{name}</h2>
                  <p className="channel-handle">{handle}</p>
                  <p>{description}</p>
                </div>
                <a className="button primary" href={href} target="_blank" rel="noopener noreferrer">
                  Acessar {name}
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
