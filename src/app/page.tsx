'use client';

export default function Home() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1rem',
        background: '#000',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <video
        controls
        autoPlay
        playsInline
        preload="auto"
        style={{
          maxWidth: '100%',
          maxHeight: '90vh',
          width: '100%',
          background: '#000',
          borderRadius: '8px',
        }}
      >
        <source src="/api/stream" type="video/mp4" />
        Browser Anda tidak mendukung pemutaran video.
      </video>
    </div>
  );
}
