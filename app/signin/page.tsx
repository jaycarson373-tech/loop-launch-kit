'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function SignIn() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main style={{ maxWidth: 460, margin: '12vh auto', padding: 24 }}>
      <Link href="/" style={{ color: 'inherit' }}>
        ← Loop Finance
      </Link>
      <h1 style={{ fontSize: 32, marginTop: 32 }}>Your Loop workspace</h1>
      <p style={{ margin: '16px 0', color: '#a5adbb' }}>
        Sign in with your operator password to manage launch plans and artwork.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          const password = new FormData(event.currentTarget).get('password');
          try {
            const response = await fetch('/api/loop/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(data.error || 'Sign-in failed.');
            window.location.assign('/');
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not connect. Try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="password">Workspace password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={512}
          style={{
            width: '100%',
            margin: '10px 0 20px',
            padding: 14,
            border: '1px solid #3c4655',
            borderRadius: 8,
            background: '#101720',
            color: 'white',
          }}
        />
        {error && (
          <p role="alert" style={{ color: '#ff9393', marginBottom: 16 }}>
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
