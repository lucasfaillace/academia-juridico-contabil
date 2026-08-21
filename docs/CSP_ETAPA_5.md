# Política de Segurança de Conteúdo — etapa 5

## Decisão técnica

A política continua efetiva e sem `unsafe-eval`. O build do Next.js 16 foi inspecionado e ainda contém scripts inline de hidratação e estilos inline produzidos pelo próprio runtime e pelo componente de imagens. Por isso, `unsafe-inline` não pode ser removido com segurança no modelo atual de páginas estáticas e ISR.

Um nonce criptográfico precisaria ser criado por requisição e propagado pelo servidor, tornando essas páginas dinâmicas. Isso reduziria o cache público já validado. Hashes fixos também não são adequados: os blocos de hidratação variam entre páginas e builds, e páginas dinâmicas podem produzir conteúdo diferente por resposta.

Essa exceção não autoriza JavaScript editorial. A política mantém `script-src-attr 'none'`, `object-src 'none'`, `frame-ancestors 'none'`, origens externas enumeradas e ausência de `unsafe-eval`. As diretivas de elementos e atributos foram explicitadas para facilitar auditorias futuras.

## Imagens editoriais

Imagens no conteúdo de artigos passam a aceitar somente:

- caminhos locais iniciados por `/`, normalmente `/media/...`;
- imagens incorporadas JPG, PNG ou WebP em Data URI durante o fluxo administrativo.

URLs externas e endereços relativos a protocolo (`//...`) são removidos na sanitização, inclusive em `srcset` e nos metadados de edição da figura. Links bibliográficos externos continuam permitidos. O fluxo recomendado é sempre enviar a imagem ao site, que gera as duas variantes WebP persistentes.

## Auditoria reproduzível

Depois do build, execute:

```bash
pnpm audit:csp
```

O comando verifica o cabeçalho configurado e o HTML efetivamente gerado. Ele falha se a política voltar a aceitar `unsafe-eval`, imagens HTTPS genéricas ou se a justificativa técnica para os estilos/scripts inline deixar de existir. Nesse último caso, a remoção de `unsafe-inline` deve ser reavaliada.

## Critério para revisão futura

Reavaliar nonce ou hashes apenas se o Next deixar de emitir hidratação inline, se a estratégia de cache público mudar ou se for introduzido um proxy de aplicação capaz de propagar nonces sem transformar todo o site em renderização dinâmica. Scripts ou domínios externos novos exigem revisão prévia da política; não se deve liberar `https:` genericamente.
