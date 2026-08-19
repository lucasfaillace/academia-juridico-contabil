"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  ["Início", "/"],
  ["Blog", "/blog"],
  ["Cursos", "/cursos"],
  ["Publicações", "/publicacoes"],
  ["Canais", "/canais"],
  ["A Academia", "/sobre"],
  ["Contato", "/contato"],
];

export function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  return (
    <header className="site-header">
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Academia Jurídico-Contábil — início">
          <Image src="/logo-academia.png" alt="Academia Jurídico-Contábil" width={1500} height={520} priority />
        </Link>
        <button
          className="menu-button"
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav id="menu-principal" className={open ? "main-nav is-open" : "main-nav"} aria-label="Navegação principal">
          {links.map(([label, href]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
