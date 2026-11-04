import { defineConfig } from 'astro/config';

// O site fica em https://<usuario>.github.io/papo-reto/
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://ttheu7.github.io',
  base: '/papo-reto/',
  trailingSlash: 'always',
});
