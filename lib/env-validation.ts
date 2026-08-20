/**
 * Validação de variáveis de ambiente em tempo de boot.
 * Garante que todas as variáveis críticas estão definidas e corretas.
 */

function validateEnv() {
  const required: Record<string, string> = {
    'AUTH_SECRET': process.env.AUTH_SECRET || '',
    'ANALYTICS_HASH_SECRET': process.env.ANALYTICS_HASH_SECRET || '',
    'ADMIN_PASSWORD_HASH': process.env.ADMIN_PASSWORD_HASH || '',
    'NEXT_PUBLIC_SITE_URL': process.env.NEXT_PUBLIC_SITE_URL || '',
  };

  const errors: string[] = [];

  // Validar comprimento mínimo
  if (!required.AUTH_SECRET || required.AUTH_SECRET.length < 32) {
    errors.push('AUTH_SECRET deve ter pelo menos 32 caracteres (gerado com: openssl rand -hex 32)');
  }
  if (!required.ANALYTICS_HASH_SECRET || required.ANALYTICS_HASH_SECRET.length < 32) {
    errors.push('ANALYTICS_HASH_SECRET deve ter pelo menos 32 caracteres (gerado com: openssl rand -hex 32)');
  }
  if (!required.ADMIN_PASSWORD_HASH || !required.ADMIN_PASSWORD_HASH.startsWith('$7$')) {
    errors.push('ADMIN_PASSWORD_HASH deve ser um hash scrypt válido (gerado com: ./scripts/hash-password.mjs)');
  }
  if (!required.NEXT_PUBLIC_SITE_URL || !required.NEXT_PUBLIC_SITE_URL.startsWith('http')) {
    errors.push('NEXT_PUBLIC_SITE_URL deve ser uma URL válida (ex: https://academia.exemplo.br)');
  }

  // Database
  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGPASSWORD) {
    errors.push('PostgreSQL: PGHOST, PGUSER e PGPASSWORD são obrigatórios');
  }

  if (errors.length > 0) {
    console.error('\n❌ Erros de configuração:');
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log('✅ Todas as variáveis de ambiente estão validadas');
}

// Executar na importação
if (process.env.NODE_ENV === 'production') {
  validateEnv();
}

export { validateEnv };
