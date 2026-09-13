'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoopProvider, useLoop, requestApi } from '../live';

export default function SignIn() {
  return (
    <LoopProvider showAccountNotice={false}>
      <WalletSignIn />
    </LoopProvider>
  );
}
function WalletSignIn() {
  const { client, address, openWallet, config } = useLoop();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main style={{ maxWidth: 460, margin: '12vh auto', padding: 24 }}>
      <Link href="/" style={{ color: 'inherit' }}>
        ← Loop Finance
      </Link>
      <h1 style={{ fontSize: 32, marginTop: 32 }}>Your Loop workspace</h1>
      <p style={{ margin: '16px 0', color: '#a5adbb' }}>
        Connect your Solana wallet and sign a message to access your own launch
        plans. Signing in costs nothing and does not authorize a payment.
      </p>
      {config && !config.workspaceConfigured && (
        <output>
          Wallet sign-in is unavailable while the operator finishes setting up
          the workspace.
        </output>
      )}
      <Button
        disabled={busy || !config?.workspaceConfigured}
        onClick={async () => {
          if (!address) {
            openWallet();
            return;
          }
          setBusy(true);
          setError('');
          try {
            const challenge = await requestApi<{ id: string; message: string }>(
              'auth/challenge',
              { wallet: address },
            );
            const bytes = await client.wallet.signMessage(
              new TextEncoder().encode(challenge.message),
            );
            if (client.wallet.getState().connected?.account.address !== address)
              throw new Error(
                'Wallet changed. Sign in again with the selected account.',
              );
            const signature = Array.from(bytes, (b) =>
              b.toString(16).padStart(2, '0'),
            ).join('');
            await requestApi('auth/verify', { id: challenge.id, signature });
            window.location.assign('/');
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Wallet sign-in failed. Try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? 'Waiting for approval…'
          : address
            ? 'Sign in with wallet'
            : 'Connect wallet'}
      </Button>
      {address && (
        <p style={{ overflowWrap: 'anywhere', margin: '16px 0' }}>{address}</p>
      )}
      {error && (
        <p role="alert" style={{ color: '#ff9393', margin: '16px 0' }}>
          {error}
        </p>
      )}
      {config?.operatorLoginEnabled && (
        <details style={{ marginTop: 32 }}>
          <summary>Operator access</summary>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              const password = new FormData(event.currentTarget).get(
                'password',
              );
              try {
                const response = await fetch('/api/loop/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password }),
                });
                const data = (await response.json()) as { error?: string };
                if (!response.ok)
                  throw new Error(data.error || 'Sign-in failed.');
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
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </details>
      )}
    </main>
  );
}
