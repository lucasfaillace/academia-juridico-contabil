/**
 * Lê um corpo JSON sem deixar erros de sintaxe escaparem para a rota.
 * A validação do formato e dos campos continua a cargo do schema da rota.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
