import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GSC Intention Analyzer - kamak',
  description: 'Découvrez les micro-intentions cachées dans votre trafic Google Search Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{
        margin: 0,
        fontFamily: 'Roboto, sans-serif',
        background: '#0a0a0a',
        color: '#ffffff'
      }}>
        {children}
      </body>
    </html>
  );
}
