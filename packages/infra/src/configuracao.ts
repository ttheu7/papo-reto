export interface Configuracao {
  urlDoBanco: string;
  chaveGemini: string | null;
  /** Resumos de reserva, quando o Gemini falha ou fica sem cota. */
  chaveGroq: string | null;
  /** Vetores dos títulos para o agrupamento. */
  chaveMistral: string | null;
  /** Imagens ilustrativas (a Pexels primeiro, o Unsplash de reserva). */
  chavePexels: string | null;
  chaveUnsplash: string | null;
}

/** Lê as variáveis de ambiente. Os valores nunca aparecem em mensagens de erro. */
export function lerConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const urlDoBanco = env.SUPABASE_DB_URL?.trim();
  if (!urlDoBanco) throw new Error('SUPABASE_DB_URL não definida (veja o .env.example)');
  if (!/^postgres(ql)?:\/\//.test(urlDoBanco)) throw new Error('SUPABASE_DB_URL não parece uma URL postgres:// do Session pooler');
  return {
    urlDoBanco,
    chaveGemini: env.GEMINI_API_KEY?.trim() || null,
    chaveGroq: env.GROQ_API_KEY?.trim() || null,
    chaveMistral: env.MISTRAL_API_KEY?.trim() || null,
    chavePexels: env.PEXELS_API_KEY?.trim() || null,
    chaveUnsplash: env.UNSPLASH_API_KEY?.trim() || null,
  };
}
