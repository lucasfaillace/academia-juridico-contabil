/**
 * Entry point do servidor Node.js em produção.
 * 
 * Valida o ambiente antes de qualquer outra inicialização.
 * Executado automaticamente pelo Dockerfile em .next/standalone/server.js
 */

// Validar ambiente ANTES de qualquer outra operação
import { validateEnv } from '@/lib/env-validation';

// Se a validação passou, Next.js inicia automaticamente
