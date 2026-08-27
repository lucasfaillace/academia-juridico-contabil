import type { Metadata } from "next";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "A Academia",
  description: "Conheça o propósito da Academia Jurídico-Contábil e o perfil de seu fundador, Lucas Faillace Castelo Branco.",
};

const profileLinks = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/lucas.faillace/",
    detail: "@lucas.faillace",
  },
  {
    label: "LinkedIn",
    href: "https://br.linkedin.com/in/lucas-faillace-castelo-branco-3a476328",
    detail: "Perfil profissional",
  },
  {
    label: "Currículo Lattes",
    href: "https://lattes.cnpq.br/8207128322459263",
    detail: "Produção acadêmica",
  },
];

export default function AboutPage() {
  return (
    <PageShell>
      <section className="page-hero compact about-hero">
        <div className="container narrow">
          <p className="eyebrow">Institucional</p>
          <h1>A Academia</h1>
          <p>Conheça o propósito da Academia Jurídico-Contábil e o perfil de seu fundador.</p>
        </div>
      </section>

      <section className="section academy-section" aria-labelledby="why-academy">
        <div className="container academy-layout">
          <aside className="academy-index" aria-label="Nesta página">
            <p className="eyebrow">Nesta página</p>
            <a href="#why-academy">Por que Academia Jurídico-Contábil?</a>
            <a href="#fundador">Fundador</a>
          </aside>

          <div className="academy-prose">
            <h2 id="why-academy">Por que Academia Jurídico-Contábil?</h2>

            <p>A escolha do termo <strong>Academia</strong> não foi casual. Sua origem remonta à Academia de Platão, espaço dedicado ao estudo, à investigação e ao intercâmbio de ideias. Desde então, a palavra passou a representar um ambiente voltado à construção, à difusão e ao aperfeiçoamento do conhecimento.</p>

            <p>A Academia Jurídico-Contábil nasce inspirada nesse ideal. Seu propósito é aproximar dois campos do saber que, embora profundamente relacionados na prática profissional, ainda permanecem excessivamente distantes no ensino formal: o <strong>Direito</strong> e a <strong>Contabilidade</strong>.</p>

            <p>Essa distância produz lacunas de ambos os lados. Nos cursos de graduação em Direito, a <strong>Contabilidade</strong> raramente ocupa espaço compatível com sua importância. Como consequência, advogados, magistrados, membros do Ministério Público, defensores públicos, procuradores e outros profissionais do <strong>Direito</strong> frequentemente precisam lidar com demonstrações contábeis, balanços, laudos periciais, avaliações patrimoniais e conceitos técnicos sem terem recebido formação sistemática sobre a matéria.</p>

            <p>Ao mesmo tempo, a atividade contábil está permanentemente inserida em um ambiente jurídico. A constituição e o funcionamento das sociedades, as relações tributárias, os contratos, as reorganizações empresariais, a recuperação judicial, a dissolução societária, a apuração de haveres, as sucessões e inúmeros outros fenômenos contábeis são também disciplinados pelo <strong>Direito</strong>. Por isso, a compreensão adequada da realidade contábil muitas vezes depende do conhecimento das normas e dos institutos jurídicos que lhe dão forma.</p>

            <p>A Academia Jurídico-Contábil parte, portanto, da constatação de que nenhuma dessas áreas pode ser plenamente compreendida de maneira isolada. O profissional do <strong>Direito</strong> precisa conhecer a linguagem, os fundamentos e os critérios da <strong>Contabilidade</strong>. O profissional da <strong>Contabilidade</strong>, por sua vez, precisa compreender os aspectos jurídicos que condicionam, delimitam e, em muitos casos, determinam o tratamento contábil das operações e dos fatos econômicos.</p>

            <p>Essa aproximação também permite desfazer uma percepção equivocada da <strong>Contabilidade</strong>, ainda frequentemente vista como uma atividade meramente operacional, limitada a cálculos, lançamentos e demonstrações. A <strong>Contabilidade</strong>, assim como o <strong>Direito</strong>, possui princípios, conceitos, normas e uma linguagem científica própria. As normas contábeis não são aplicadas de forma automática: exigem interpretação, julgamento profissional e análise das circunstâncias concretas. Sua aplicação depende da compreensão de seus fundamentos e da realidade econômica que se pretende representar.</p>

            <p>Da mesma forma, os aspectos jurídicos relacionados à atividade contábil não podem ser reduzidos à simples reprodução de dispositivos legais. As normas jurídicas também precisam ser interpretadas à luz de seus fundamentos, de sua finalidade e das particularidades do caso concreto. <strong>Direito</strong> e <strong>Contabilidade</strong> são campos normativos que exigem raciocínio, interpretação e escolhas fundamentadas.</p>

            <p>A proposta da Academia Jurídico-Contábil não é, portanto, oferecer um ensino superficial, baseado na simples memorização de normas ou procedimentos. Cada tema é apresentado a partir de seus fundamentos, para que o aluno compreenda não apenas <strong>como</strong> determinada regra funciona, mas principalmente <strong>por que</strong> ela existe, quais objetivos procura alcançar e de que forma se relaciona com os demais conceitos do sistema.</p>

            <p>Todo o conteúdo é construído com base na melhor literatura jurídica e contábil, na produção científica nacional e internacional, na legislação e nos pronunciamentos técnicos aplicáveis. Esse conhecimento é apresentado de maneira rigorosa, mas adaptado às necessidades de profissionais que desejam transitar com segurança entre o <strong>Direito</strong> e a <strong>Contabilidade</strong>, sem simplificações excessivas e sem perder de vista a aplicação prática.</p>

            <p><strong>A Academia Jurídico-Contábil destina-se, assim, tanto aos profissionais do Direito que necessitam compreender a Contabilidade quanto aos contadores, peritos, pesquisadores e demais profissionais da área contábil que precisam conhecer os fundamentos e as repercussões jurídicas de sua atuação.</strong></p>

            <p className="academy-mission"><strong>Mais do que ensinar Contabilidade para juristas e Direito para contadores, nossa missão é construir uma verdadeira ponte entre o Direito e a Ciência Contábil.</strong></p>
          </div>
        </div>
      </section>

      <section id="fundador" className="section founder-section" aria-labelledby="founder-name">
        <div className="container founder-layout">
          <div className="founder-photo">
            <Image
              src="/lucas-faillace-castelo-branco.jpg"
              alt="Lucas Faillace Castelo Branco, fundador da Academia Jurídico-Contábil"
              width={1122}
              height={1402}
              sizes="(max-width: 700px) 100vw, 360px"
            />
          </div>

          <div className="founder-content">
            <p className="eyebrow">Fundador</p>
            <h2 id="founder-name">Lucas Faillace Castelo Branco</h2>
            <p className="founder-role">Advogado e contador</p>
            <p>Mestre em Direito pela King’s College London (KCL), Universidade de Londres, e mestre em Contabilidade pela Universidade Federal da Bahia (UFBA).</p>
            <p>Especialista em Direito Tributário pelo <a href="https://www.ibet.com.br/" target="_blank" rel="noopener noreferrer">Instituto Brasileiro de Estudos Tributários (IBET)</a> e em Direito Empresarial pela Fundação Getulio Vargas (FGV).</p>

            <div className="profile-links" aria-label="Perfis de Lucas Faillace Castelo Branco">
              {profileLinks.map((link) => (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                  <span><strong>{link.label}</strong><small>{link.detail}</small></span>
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
