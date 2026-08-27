import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Image className="footer-logo" src="/logo-academia.svg" alt="Academia Jurídico-Contábil" width={410} height={142} />
          <p>Artigos e cursos sobre Direito, Contabilidade e suas interfaces.</p>
        </div>
        <div>
          <h2>Navegação</h2>
          <Link href="/blog">Blog</Link>
          <Link href="/publicacoes">Publicações</Link>
          <Link href="/cursos">Cursos</Link>
          <Link href="/canais">Canais</Link>
          <Link href="/sobre">A Academia</Link>
        </div>
        <div>
          <h2>Institucional</h2>
          <Link href="/contato">Contato</Link>
          <Link href="/privacidade">Privacidade e cookies</Link>
          <Link href="/termos">Termos de uso</Link>
          <Link href="/admin/login">Área editorial</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 Academia Jurídico-Contábil</span>
        <span>Blog e formação profissional</span>
      </div>
    </footer>
  );
}
