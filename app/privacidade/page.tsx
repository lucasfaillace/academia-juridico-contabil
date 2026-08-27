import type { Metadata } from "next";
import { AnalyticsPreferencesButton } from "@/components/AnalyticsConsent";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Política de Privacidade e Cookies",
  description: "Saiba como a Academia Jurídico-Contábil trata dados pessoais, comentários, mensagens e informações de acesso.",
};

export default function PrivacyPage() {
  return (
    <PageShell>
      <section className="page-hero compact">
        <div className="container narrow">
          <p className="eyebrow">Privacidade e proteção de dados</p>
          <h1>Política de Privacidade e Cookies</h1>
          <p>Última atualização: 27 de agosto de 2026.</p>
        </div>
      </section>

      <section className="section">
        <div className="container prose-page legal">
          <p>
            Esta Política de Privacidade explica como a Academia Jurídico-Contábil coleta, utiliza,
            armazena e protege dados pessoais dos visitantes de seu site, em conformidade com a Lei
            Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018).
          </p>

          <h2>1. Responsável pelo tratamento</h2>
          <p>
            O tratamento de dados realizado por meio deste site é conduzido pela Academia
            Jurídico-Contábil, iniciativa mantida por Lucas Faillace Castelo Branco. Solicitações
            relacionadas à privacidade podem ser encaminhadas para{" "}
            <a href="mailto:contato@academiajuridicocontabil.com.br">
              contato@academiajuridicocontabil.com.br
            </a>.
          </p>

          <h2>2. Dados tratados</h2>
          <p>O site poderá tratar os seguintes dados, conforme a funcionalidade utilizada:</p>
          <ul>
            <li>
              <strong>Formulário de contato:</strong> nome, endereço de e-mail, assunto, conteúdo da
              mensagem e registro do consentimento.
            </li>
            <li>
              <strong>Comentários no Blog:</strong> nome informado pelo comentarista, conteúdo do
              comentário ou da resposta, vínculo com o artigo e datas de criação e atualização.
            </li>
            <li>
              <strong>Estatísticas de acesso:</strong> artigo visualizado, data e horário da visita,
              páginas acessadas e informações técnicas fornecidas pelo navegador nas áreas públicas.
            </li>
            <li>
              <strong>Registros técnicos:</strong> informações estritamente necessárias ao
              funcionamento, à segurança e à prevenção de abuso do site e de sua infraestrutura.
            </li>
          </ul>

          <h2>3. Finalidades do tratamento</h2>
          <p>Os dados são utilizados para:</p>
          <ul>
            <li>responder às mensagens enviadas pelo formulário de contato;</li>
            <li>publicar, organizar e moderar comentários e respostas no Blog;</li>
            <li>compreender o interesse pelos conteúdos e aprimorar o site;</li>
            <li>evitar contagens repetidas, mensagens automatizadas, fraudes e outros abusos;</li>
            <li>manter a segurança, a disponibilidade e o correto funcionamento dos serviços;</li>
            <li>cumprir obrigações legais e resguardar direitos, quando necessário.</li>
          </ul>

          <h2>4. Comentários públicos</h2>
          <p>
            O nome informado e o conteúdo do comentário ou da resposta ficam visíveis publicamente no
            artigo correspondente. Por isso, o usuário não deve inserir no comentário dados pessoais
            desnecessários, informações confidenciais ou dados de terceiros sem autorização.
          </p>
          <p>
            Os comentários poderão ser editados, ocultados ou excluídos pela administração para fins
            de moderação, cumprimento legal, proteção de direitos ou atendimento a solicitação do
            titular. O formulário de comentários não solicita endereço de e-mail.
          </p>

          <h2>5. Estatísticas, cookies e tecnologias semelhantes</h2>
          <p>
            Nas áreas públicas, as estatísticas são ativadas no início da navegação. O aviso de cookies
            é informativo, e o botão “Fechar” controla somente a sua exibição. Sessões administrativas
            autenticadas e páginas iniciadas por <code>/admin</code> não participam da medição.
          </p>
          <p>
            O sistema interno utiliza um identificador próprio com validade de 24 horas para reduzir
            contagens repetidas. Esse identificador é transformado em código anonimizado no servidor,
            e a chave usada para deduplicação é eliminada após 48 horas. O sistema interno não armazena
            o endereço IP completo como dado de visualização do artigo.
          </p>
          <p>
            O site também utiliza o Google Analytics 4, fornecido pelo Google, desde o início da
            navegação pública. O serviço poderá tratar dados técnicos e de navegação conforme suas
            próprias condições e políticas, inclusive em outros países. Sinais do Google e recursos de
            personalização de anúncios permanecem desativados na configuração do site. As estatísticas
            internas e as do Google Analytics adotam critérios diferentes e, por isso, podem apresentar
            resultados distintos.
          </p>
          <div className="privacy-preferences-action">
            <AnalyticsPreferencesButton />
          </div>

          <h2>6. Compartilhamento de dados</h2>
          <p>
            Os dados poderão ser tratados por fornecedores de infraestrutura, hospedagem, banco de
            dados, envio de e-mail e análise de acesso, na medida necessária à prestação de seus
            serviços. O Google somente recebe dados analíticos quando o visitante autoriza essa
            finalidade. A Academia Jurídico-Contábil não vende dados pessoais.
          </p>
          <p>
            Dados também poderão ser compartilhados para cumprimento de obrigação legal, regulatória ou
            ordem de autoridade competente, bem como para o exercício regular de direitos.
          </p>

          <h2>7. Armazenamento e retenção</h2>
          <p>
            As mensagens de contato são encaminhadas ao endereço institucional e mantidas pelo período
            necessário à resposta, ao acompanhamento da solicitação e ao cumprimento de obrigações
            aplicáveis. Comentários permanecem vinculados ao artigo enquanto publicados, salvo
            moderação, exclusão do artigo ou solicitação cabível do titular.
          </p>
          <p>
            Os eventos internos de visualização podem ser conservados de forma agregável para a análise
            histórica dos acessos; a chave temporária de deduplicação é removida após 48 horas. Os dados
            tratados pelo Google Analytics seguem os prazos configurados na respectiva propriedade e as
            regras do Google. Registros técnicos de segurança são mantidos somente pelo tempo necessário
            às finalidades operacionais, legais e de proteção do serviço.
          </p>

          <h2>8. Segurança</h2>
          <p>
            São adotadas medidas técnicas e administrativas destinadas a proteger os dados contra
            acessos não autorizados, perda, alteração, divulgação ou destruição indevida. Nenhum sistema,
            contudo, é completamente imune a incidentes. Caso ocorra evento relevante, serão adotadas as
            providências exigidas pela legislação aplicável.
          </p>

          <h2>9. Direitos do titular</h2>
          <p>
            Nos termos da LGPD, o titular poderá solicitar, quando aplicável, confirmação da existência
            de tratamento, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio,
            eliminação, portabilidade, revisão das decisões automatizadas, oposição e revogação do
            consentimento. A conservação de determinados dados poderá ocorrer nas hipóteses autorizadas
            pela legislação.
          </p>
          <p>
            Para exercer seus direitos, envie a solicitação para{" "}
            <a href="mailto:contato@academiajuridicocontabil.com.br">
              contato@academiajuridicocontabil.com.br
            </a>. Poderão ser solicitadas informações adicionais para confirmar a identidade do
            requerente e proteger os dados contra acesso indevido.
          </p>

          <h2>10. Links e serviços de terceiros</h2>
          <p>
            O site poderá conter links para publicações, vídeos, redes sociais e outros serviços
            externos. Ao acessar esses endereços, o usuário estará sujeito às políticas e práticas dos
            respectivos responsáveis, que não são controladas por esta Política.
          </p>

          <h2>11. Crianças e adolescentes</h2>
          <p>
            O conteúdo da Academia Jurídico-Contábil é destinado predominantemente a estudantes e
            profissionais do Direito e da Contabilidade e não é dirigido a crianças. Caso seja
            identificado tratamento indevido de dados de criança ou adolescente, o responsável poderá
            solicitar análise pelo canal de contato indicado nesta Política.
          </p>

          <h2>12. Alterações desta Política</h2>
          <p>
            Esta Política poderá ser atualizada para refletir mudanças no site, nos serviços utilizados
            ou na legislação. A versão vigente permanecerá publicada nesta página, com a indicação da
            data de sua última atualização.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
