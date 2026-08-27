import Link from "next/link";
import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";
export default function LoginPage() {
  const localPreview = process.env.NODE_ENV !== "production";
  return <main className="login-page"><div className="login-card"><Link href="/"><Image src="/logo-academia.svg" alt="Academia Jurídico-Contábil" width={410} height={142} priority /></Link><p className="eyebrow">Área editorial</p><h1>Acesse o painel</h1><p>Use as credenciais configuradas no ambiente da aplicação.</p>{localPreview && <a className="button primary local-preview-access" href="/api/auth/local-preview">Acessar painel nesta prévia</a>}<LoginForm /><Link className="back-link" href="/">← Voltar ao site</Link></div></main>;
}
