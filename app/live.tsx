'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import {
  createClient,
  generateKeyPairSigner,
  getTransactionDecoder,
  getTransactionEncoder,
  assertIsTransactionWithinSizeLimit,
  blockhash,
  type KeyPairSigner,
} from '@solana/kit';
import { walletSigner } from '@solana/kit-plugin-wallet';
import {
  useWallets,
  useConnectedWallet,
  useConnect,
  useDisconnect,
} from '@solana/kit-plugin-wallet/react';
import { ClientProvider } from '@solana/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { BuybackEngine } from '../lib/buybacks';
import type { serviceReadiness } from '../server/readiness';
import {
  Wallet,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Info,
} from 'lucide-react';
export type LiveConfig = {
  signedIn: boolean;
  cluster: 'devnet' | 'mainnet-beta';
  chain: 'solana:devnet' | 'solana:mainnet';
  treasury: string | null;
  mainMint: string | null;
  launchEnabled: boolean;
  automationEnabled: boolean;
  missing: string[];
};
export type LiveLaunch = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  mint: string | null;
  creator: string | null;
  wallet: string;
  status: string;
  plan: Record<string, string>;
  balances: ReturnType<BuybackEngine['snapshot']>;
  lastError: string | null;
  transactions?: LiveTransaction[];
};
export type LiveTransaction = {
  id: string;
  kind: string;
  status: string;
  signature: string | null;
  name?: string;
  details: {
    purchaseCeiling?: string;
    receipt?: { debit: string; burned: string };
  };
};
type PreparedLaunch = {
  jobId: string;
  unsigned: string;
  blockHeight: number;
  feeLamports?: string;
  details: {
    payer: string;
    blockhash: string;
    mint: string;
    feeLamports?: string;
    estimatedWalletDebitLamports: string;
  };
};
export type LiveTreasury = {
  treasury: string | null;
  mint: string | null;
  automationEnabled: boolean;
  balances: LiveLaunch['balances'] | null;
};
export async function requestApi<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/loop/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error =
      data && typeof data === 'object' && 'error' in data ? data.error : null;
    throw new Error(typeof error === 'string' ? error : 'Request failed');
  }
  return data as T;
}
const makeClient = (chain: LiveConfig['chain']) =>
  createClient().use(walletSigner({ chain }));
type WalletClient = ReturnType<typeof makeClient>;
const Context = createContext<{
  config: LiveConfig | null;
  client: WalletClient;
  address: string | null;
  openWallet: () => void;
  refresh: number;
  changed: () => void;
} | null>(null);
export const useLoop = () => {
  const c = useContext(Context);
  if (!c) throw new Error('Loop wallet provider missing');
  return c;
};
export function LoopProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [opened, setOpened] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    requestApi<LiveConfig>('config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  const client = useMemo(
    () => makeClient(config?.chain || 'solana:devnet'),
    [config?.chain],
  );
  const connected = useConnectedWallet(client),
    wallets = useWallets(client),
    connect = useConnect(client),
    disconnect = useDisconnect(client);
  const [error, setError] = useState('');
  return (
    <ClientProvider client={client}>
      <Context.Provider
        value={{
          config,
          client,
          address: connected?.account.address || null,
          openWallet: () => setOpened(true),
          refresh,
          changed: () => setRefresh((v) => v + 1),
        }}
      >
        {config && !config.signedIn && (
          <div className="inline-note">
            <Info />
            <p>
              {/* Full navigation is required for the Sites authentication redirect. */}
              {/* oxlint-disable-next-line next/no-html-link-for-pages */}
              <a href="/signin-with-chatgpt?return_to=/" target="_top">
                Sign in to your workspace
              </a>{' '}
              to save plans and view launch records.
            </p>
          </div>
        )}
        {children}
        <Dialog open={opened} onOpenChange={setOpened}>
          <DialogContent className="loop-dialog">
            <span className="dialog-icon">
              <Wallet />
            </span>
            <DialogTitle>
              {connected ? 'Wallet connected' : 'Connect your wallet'}
            </DialogTitle>
            <DialogDescription>
              {config?.cluster === 'mainnet-beta'
                ? 'Solana mainnet · transactions use real SOL.'
                : 'Solana devnet · test network.'}{' '}
              Connecting does not authorize a payment.
            </DialogDescription>
            {connected ? (
              <>
                <code className="wallet-address">
                  {connected.account.address}
                </code>
                <button
                  className="secondary"
                  onClick={async () => {
                    await disconnect.dispatchAsync();
                    setOpened(false);
                  }}
                >
                  Disconnect wallet
                </button>
              </>
            ) : wallets.length ? (
              wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  className="secondary wide"
                  disabled={connect.isRunning}
                  onClick={async () => {
                    try {
                      setError('');
                      await connect.dispatchAsync(wallet);
                      setOpened(false);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {wallet.name}
                  <ArrowRight />
                </button>
              ))
            ) : (
              <p className="body-copy">
                No compatible wallet was found. Open Loop in your Solana
                wallet’s browser or enable a Wallet Standard browser extension.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </Context.Provider>
    </ClientProvider>
  );
}
export function WalletControl() {
  const { address, openWallet } = useLoop();
  return (
    <button className="wallet-button" onClick={openWallet}>
      <Wallet />
      <span>
        {address
          ? `${address.slice(0, 4)}…${address.slice(-4)}`
          : 'Connect wallet'}
      </span>
    </button>
  );
}
function bytes64(bytes: Uint8Array) {
  let value = '';
  for (const b of bytes) value += String.fromCharCode(b);
  return btoa(value);
}
function decode64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function LiveLaunchFlow({
  id,
  onDone,
}: {
  id: string;
  onDone: () => void;
}) {
  const { client, address, config, openWallet, changed } = useLoop();
  const [prepared, setPrepared] = useState<PreparedLaunch | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const mintSigner = useRef<KeyPairSigner | null>(null);
  async function prepare() {
    setBusy(true);
    setError('');
    try {
      if (!address) {
        openWallet();
        return;
      }
      mintSigner.current ??= await generateKeyPairSigner();
      const result = await requestApi<PreparedLaunch>(
        `launches/${id}/prepare`,
        {
          mint: mintSigner.current.address,
        },
      );
      setPrepared(result);
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (!prepared || !mintSigner.current) return;
    setBusy(true);
    setError('');
    try {
      const connected = client.wallet.getState().connected;
      if (
        !connected?.signer ||
        !('modifyAndSignTransactions' in connected.signer)
      )
        throw new Error(
          'This wallet must support signing without immediately broadcasting.',
        );
      if (connected.account.address !== prepared.details.payer)
        throw new Error('Connect the wallet that prepared this launch.');
      const decoded = getTransactionDecoder().decode(
        decode64(prepared.unsigned),
      );
      const raw = {
        ...decoded,
        lifetimeConstraint: {
          blockhash: blockhash(prepared.details.blockhash),
          lastValidBlockHeight: BigInt(prepared.blockHeight),
        },
      };
      assertIsTransactionWithinSizeLimit(raw);
      const [mintSignatures] = await mintSigner.current.signTransactions([raw]);
      const transaction = {
        ...raw,
        signatures: { ...raw.signatures, ...mintSignatures },
      };
      assertIsTransactionWithinSizeLimit(transaction);
      const [signed] = await connected.signer.modifyAndSignTransactions([
        transaction,
      ]);
      setStatus('Recording your signed transaction…');
      const result = await requestApi<{ signature: string }>(
        `transactions/${prepared.jobId}/submit`,
        {
          signed: bytes64(
            new Uint8Array(getTransactionEncoder().encode(signed)),
          ),
        },
      );
      setStatus(`Submitted: ${result.signature}. Checking confirmation…`);
      await requestApi(`launches/${id}/reconcile`, {});
      changed();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="live-launch-flow">
      {!config?.launchEnabled && (
        <div className="inline-note">
          <Info />
          <p>
            Live execution is awaiting treasury and service setup. Your saved
            plan remains available.
          </p>
        </div>
      )}
      {prepared ? (
        <>
          <div className="review-rows">
            <span>
              Network<b>{config?.cluster}</b>
            </span>
            <span>
              Creator-vault funding<b>0.01 SOL</b>
            </span>
            <span>
              Estimated network fee
              <b>
                {Number(prepared.details.feeLamports || prepared.feeLamports) /
                  1e9}{' '}
                SOL
              </b>
            </span>
            <span>
              Estimated total wallet debit
              <b>
                {Number(prepared.details.estimatedWalletDebitLamports) / 1e9}{' '}
                SOL
              </b>
            </span>
            <span>
              Token mint<b>{prepared.details.mint.slice(0, 6)}…</b>
            </span>
            <span>
              Simulation<b>Passed</b>
            </span>
          </div>
          <p className="footnote">
            The estimated debit includes vault funding, network fees and account
            rent. Confirm the complete transaction in your wallet.
          </p>
          <button
            className="primary wide"
            disabled={busy}
            onClick={() => void sign()}
          >
            {busy ? 'Processing…' : 'Sign and launch token'}
            <Wallet />
          </button>
        </>
      ) : (
        <button
          className="primary wide"
          disabled={busy || !config?.launchEnabled}
          onClick={() => void prepare()}
        >
          {busy ? 'Preparing and simulating…' : 'Prepare live launch'}
          <ArrowRight />
        </button>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await requestApi(`launches/${id}/cancel-quote`, {});
            mintSigner.current = null;
            setPrepared(null);
            setError('');
            changed();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Cancel an unsigned quote
      </button>
      {status && <output className="notice">{status}</output>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
export function ServerLaunches({
  onEdit,
}: {
  onEdit: (p: LiveLaunch) => void;
}) {
  const { refresh, config, changed } = useLoop();
  const [rows, setRows] = useState<LiveLaunch[]>([]),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<LiveLaunch | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    requestApi<{ launches: LiveLaunch[] }>('launches')
      .then((d) => {
        if (active) {
          setRows(d.launches);
          setError('');
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);
  const explorer = (sig: string) =>
    `https://solscan.io/tx/${sig}${config?.cluster === 'devnet' ? '?cluster=devnet' : ''}`;
  return (
    <div>
      {loading && <output className="body-copy">Loading your launches…</output>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="panel empty">
          <Wallet />
          <h2>Your first launch starts here.</h2>
          <p>Connect your wallet and save a token plan to your workspace.</p>
        </div>
      )}
      <div className="plans-grid">
        {rows.map((row) => (
          <article className="panel plan-card" key={row.id}>
            <div className="plan-symbol">{row.symbol.slice(0, 2)}</div>
            <span className="pill">{row.status.toUpperCase()}</span>
            <h3>{row.name}</h3>
            <span className="token-symbol">${row.symbol}</span>
            <p>{row.description}</p>
            <div className="token-details">
              <span>
                Buyback pool
                <b>
                  {(
                    (Number(row.balances.held) +
                      Number(row.balances.released)) /
                    1e9
                  ).toFixed(6)}{' '}
                  SOL
                </b>
              </span>
              <span>
                Mint
                <b>
                  {row.mint
                    ? `${row.mint.slice(0, 4)}…${row.mint.slice(-4)}`
                    : 'Not launched'}
                </b>
              </span>
            </div>
            <div className="plan-actions">
              {row.status === 'draft' && (
                <button className="secondary" onClick={() => onEdit(row)}>
                  Edit
                </button>
              )}
              <button
                className="primary"
                onClick={async () => {
                  try {
                    setSelected(
                      await requestApi<LiveLaunch>(`launches/${row.id}`),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {['draft', 'prepared'].includes(row.status)
                  ? 'Launch'
                  : 'Details'}
                <ArrowUpRight />
              </button>
            </div>
            {row.lastError && <p className="error">{row.lastError}</p>}
          </article>
        ))}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="loop-dialog">
          <DialogTitle>{selected?.name}</DialogTitle>
          <DialogDescription>
            Launch execution and confirmed transaction records.
          </DialogDescription>
          {selected && (
            <>
              {['draft', 'prepared'].includes(selected.status) ? (
                <LiveLaunchFlow
                  id={selected.id}
                  onDone={() => setSelected(null)}
                />
              ) : (
                <>
                  <span className="status-pill">{selected.status}</span>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await requestApi(
                          `launches/${selected.id}/reconcile`,
                          {},
                        );
                        setSelected(
                          await requestApi<LiveLaunch>(
                            `launches/${selected.id}`,
                          ),
                        );
                        changed();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <RefreshCw />
                    Check confirmation
                  </button>
                </>
              )}
              <div className="transaction-list">
                {selected.transactions?.map((tx) => (
                  <div key={tx.id}>
                    <span>
                      {tx.kind} · {tx.status}
                    </span>
                    {tx.signature ? (
                      <a
                        href={explorer(tx.signature)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View receipt
                        <ArrowUpRight />
                      </a>
                    ) : (
                      <small>Not submitted</small>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ExploreLive() {
  const { refresh, config } = useLoop();
  const [rows, setRows] = useState<LiveLaunch[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    requestApi<{ launches: LiveLaunch[] }>('explore')
      .then((d) => setRows(d.launches))
      .catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="plans-grid">
        {rows.map((row) => (
          <article className="panel plan-card" key={row.id}>
            <div className="plan-symbol">{row.symbol.slice(0, 2)}</div>
            <h3>{row.name}</h3>
            <span className="token-symbol">${row.symbol}</span>
            <p>{row.description}</p>
            <div className="token-details">
              <span>
                Held for buybacks
                <b>{(Number(row.balances.held) / 1e9).toFixed(6)} SOL</b>
              </span>
              <span>
                Spent incl. costs
                <b>{(Number(row.balances.spent) / 1e9).toFixed(6)} SOL</b>
              </span>
            </div>
            <a
              className="secondary wide"
              href={`https://solscan.io/token/${row.mint}${config?.cluster === 'devnet' ? '?cluster=devnet' : ''}`}
              target="_blank"
              rel="noreferrer"
            >
              View token
              <ArrowUpRight />
            </a>
          </article>
        ))}
      </div>
      {rows.length === 0 && !error && (
        <p className="body-copy">
          No confirmed Loop launches yet. Completed launches will appear here
          automatically.
        </p>
      )}
    </>
  );
}
export function LiveHistory() {
  const { refresh, config } = useLoop();
  const [rows, setRows] = useState<LiveTransaction[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    const load = () =>
      requestApi<{ transactions: LiveTransaction[] }>('history')
        .then((d) => {
          if (!stopped) setRows(d.transactions);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    void load();
    const interval = setInterval(() => void load(), 20000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [refresh]);
  return (
    <section className="panel ledger">
      <div className="panel-title">
        <h3>On-chain buyback history</h3>
        <span className="muted">Pending and confirmed activity</span>
      </div>
      {error && <p className="error">{error}</p>}
      {rows.length ? (
        <div className="transaction-list">
          {rows.map((tx) => (
            <div key={tx.id}>
              <span>
                {tx.name} · {tx.status}
              </span>
              <span>
                {tx.details.receipt
                  ? `${Number(tx.details.receipt.debit) / 1e9} SOL spent incl. fees`
                  : `${Number(tx.details.purchaseCeiling) / 1e9} SOL maximum`}
              </span>
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://solscan.io/tx/${tx.signature}${config?.cluster === 'devnet' ? '?cluster=devnet' : ''}`}
              >
                Receipt
                <ArrowUpRight />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="ledger-empty">No verified buyback transactions yet.</p>
      )}
    </section>
  );
}

export function LaunchReadiness() {
  const [result, setResult] = useState<{
      servicesReady: boolean;
      executionEnabled: boolean;
      acceptance: string;
      checks: { id: string; label: string; ok: boolean; detail: string }[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="panel launch-readiness">
      <div className="panel-title">
        <div>
          <span className="eyebrow">LIVE SERVICE CHECKS</span>
          <h3>Launch readiness</h3>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setResult(
                await requestApi<Awaited<ReturnType<typeof serviceReadiness>>>(
                  'readiness',
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw />
          {busy ? 'Checking services…' : 'Check readiness'}
        </button>
      </div>
      <p className="body-copy">
        Verify storage, network, managed treasury and the keeper before enabling
        execution.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="transaction-list">
            {result.checks.map((check) => (
              <div key={check.id}>
                <span>{check.label}</span>
                <strong>{check.ok ? 'Verified' : 'Needs attention'}</strong>
                <p className="footnote">{check.detail}</p>
              </div>
            ))}
          </div>
          <p className="notice">
            Execution is{' '}
            {result.executionEnabled ? 'enabled by the operator' : 'paused'}.{' '}
            {result.acceptance}
          </p>
        </>
      )}
    </section>
  );
}
