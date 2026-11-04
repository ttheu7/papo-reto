export interface Configuracao {
  urlDoBanco: string;
  chaveGemini: string | null;
}

/** Lê as variáveis de ambiente. Os valores nunca aparecem em mensagens de erro. */
export function lerConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const urlDoBanco = env.SUPABASE_DB_URL?.trim();
  if (!urlDoBanco) throw new Error('SUPABASE_DB_URL não definida (veja o .env.example)');
  if (!/^postgres(ql)?:\/\//.test(urlDoBanco)) throw new Error('SUPABASE_DB_URL não parece uma URL postgres:// do Session pooler');
  return { urlDoBanco, chaveGemini: env.GEMINI_API_KEY?.trim() || null };
}
