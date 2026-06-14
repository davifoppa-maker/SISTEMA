/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // Não reutiliza o cache de navegação (Router Cache) para páginas dinâmicas:
    // ao voltar ao Dashboard/WhatsApp, sempre busca o estado atual do servidor
    // (sem isso, o Next servia uma renderização antiga e a tela parecia "travada").
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
