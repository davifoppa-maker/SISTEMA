// Autenticação simples de acesso geral (um login para o sistema todo).
// Futuramente será substituída por login por usuário/perfil — por ora só impede
// que qualquer pessoa com o domínio acesse o sistema.
//
// Credenciais ficam em variáveis de ambiente (APP_USERNAME / APP_PASSWORD).
// O cookie guarda um hash (não a senha). middleware e rota de login calculam o
// mesmo token com a Web Crypto (disponível tanto no edge quanto no node).

export const AUTH_COOKIE = "nyer_auth";

export function authCredentials(): { username: string; password: string } {
  return {
    username: process.env.APP_USERNAME || "nyer",
    // ⚠️ Defina APP_PASSWORD no ambiente (Vercel). O padrão abaixo é só para não
    // travar o primeiro acesso — troque-o por uma senha forte via variável.
    password: process.env.APP_PASSWORD || "NyerLog@2026",
  };
}

// Acesso do REPRESENTANTE (perfil restrito: só o Gestor de Margem).
// Credenciais via env: REP_USERNAME / REP_PASSWORD.
export function repCredentials(): { username: string; password: string } {
  return {
    username: process.env.REP_USERNAME || "representante",
    password: process.env.REP_PASSWORD || "Nyer@Rep2026",
  };
}

/** Caminhos que o representante pode acessar (só o Gestor de Margem). */
export const REP_ALLOWED_PREFIXES = ["/margem"];

/** Token determinístico (SHA-256) das credenciais — valor guardado no cookie. */
export async function computeAuthToken(username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${username}:${password}:nyer-pos-venda`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
