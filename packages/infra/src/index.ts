// Adaptadores que implementam as portas do core.
export * from './configuracao';
export * from './registro';
export * from './postgres/conexao';
export * from './postgres/repositorios-da-coleta';
export * from './rss/interpretar-feed';
export * from './rss/leitor-rss-http';
export * from './postgres/repositorio-resumos';
export * from './ia/prompt';
export * from './gemini/servico-ia-gemini';
export * from './groq/servico-ia-groq';
export * from './mistral/servico-de-vetores-mistral';
export * from './postgres/repositorio-site';
export * from './escritor-de-dados';
