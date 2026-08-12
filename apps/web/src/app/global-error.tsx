'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f5f5f3',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ color: '#1a5f3f', marginBottom: '1rem' }}>
            حدث خطأ غير متوقع
          </h2>
          <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            {error?.digest ? `خطأ: ${error.digest}` : 'يرجى المحاولة مرة أخرى'}
          </p>
          <button
            onClick={reset}
            style={{
              background: '#2d8a5e',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            حاول مجدداً
          </button>
        </div>
      </body>
    </html>
  );
}
