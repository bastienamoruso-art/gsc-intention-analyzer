import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GSC Intention Analyzer',
  description: 'Découvrez les micro-intentions cachées dans votre trafic Google Search Console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
