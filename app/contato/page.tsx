import { ContactForm } from "@/components/ContactForm";
import { PageShell } from "@/components/PageShell";

export default function ContactPage() {
  return (
    <PageShell>
      <section className="page-hero">
        <div className="container narrow">
          <p className="eyebrow">Fale conosco</p>
          <h1>Contato</h1>
          <p>Canal para dúvidas sobre artigos, cursos, propostas profissionais e assuntos administrativos.</p>
        </div>
      </section>
      <section className="section">
        <div className="container narrow">
          <ContactForm />
        </div>
      </section>
    </PageShell>
  );
}
