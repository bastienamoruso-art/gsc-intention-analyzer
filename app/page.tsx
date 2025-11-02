import GSCIntentionAnalyzer from '@/components/GSCIntentionAnalyzer';

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%)',
      padding: '20px 0'
    }}>
      <GSCIntentionAnalyzer />
    </main>
  );
}
