import { rateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Rate limiting para login administrativo
 * 5 tentativas a cada 15 minutos por IP
 */
export async function POST(request: NextRequest) {
  // Extrair IP do cliente
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             request.ip ||
             'unknown';

  const identifier = `login:${ip}`;
  const limit = rateLimit(identifier, {
    limit: 5,
    windowMs: 15 * 60 * 1000, // 15 minutos
  });

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
        retryAfter: Math.ceil(limit.resetIn / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil(limit.resetIn / 1000).toString(),
        },
      }
    );
  }

  // Aqui vai sua lógica de autenticação original
  // TODO: Implementar validação de email/senha com hash scrypt

  return NextResponse.json(
    { error: 'Não implementado' },
    { status: 501 }
  );
}
