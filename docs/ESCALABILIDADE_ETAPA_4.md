# Escalabilidade — etapa 4

## Alterações aplicadas

- A área de Referências consulta o PostgreSQL com páginas de 30 registros e limite técnico de 100 por requisição.
- A pesquisa por referência, conteúdo de fichamento e combinação de temas é executada no banco. A pesquisa parcial de fichamentos possui índice trigram próprio.
- A listagem traz apenas contadores. A relação completa de artigos que utilizam uma referência é carregada ao abrir “utilizações”; o conteúdo dos fichamentos continua sendo carregado ao abrir “Fichamento”.
- O editor de notas pesquisa referências no servidor após dois caracteres e recebe, separadamente, as referências já vinculadas ao artigo aberto.
- As estatísticas administrativas passam a ler `article_view_daily_totals`. Cada visualização aceita grava o evento bruto e incrementa o agregado na mesma instrução SQL; a migração inicial recompõe o agregado a partir de todo o histórico existente.
- Os limites padrão de exportação foram dimensionados para uma VPS com 4 GB: 200 artigos, 2.000 referências e 5.000 fichamentos.

## Integridade dos dados

As migrações `020_article_view_daily_totals.sql` e `021_reference_fichamento_substring_index.sql` são aditivas. A primeira não remove eventos de `article_views`; apenas cria e preenche o agregado. A segunda cria um índice sem alterar fichamentos.

Após migrar, a conferência dos totais pode ser feita com:

```sql
SELECT
  (SELECT COUNT(*) FROM article_views) AS eventos_brutos,
  (SELECT COALESCE(SUM(views), 0) FROM article_view_daily_totals) AS total_agregado;
```

Os valores devem coincidir imediatamente após a migração e continuar coincidentes porque o registro e o incremento são atômicos.

## Paginação escolhida

Foi mantida paginação por página e deslocamento porque ela oferece contagem total e navegação previsível no painel. A troca por paginação por cursor (*keyset*) só deve ser considerada com medição real, especialmente se o acervo superar aproximadamente dezenas de milhares de referências ou se as páginas finais apresentarem latência relevante. Não há benefício em introduzir agora um contrato mais complexo sem esse dado.

## Validação de capacidade

Os testes automatizados exercitam um ano de agregados diários para 250 artigos, além dos limites e parâmetros de paginação. No ambiente Docker, a validação completa deve incluir migrações, aplicação, PostgreSQL e o script `./scripts/check-production.sh`.
