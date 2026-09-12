'use client';
import { useState, useEffect } from 'react';
import {
  RefreshCw,
  ArrowUpRight,
  ArrowRight,
  Flame,
  Timer,
  Info,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { simulateBuybacks, type SimulationInput } from '@/lib/buybacks';
import { downloadJson } from '@/lib/launch';
const fmt = (v: number) =>
  v.toLocaleString('en-US', { maximumFractionDigits: 6 });
export function BuybackPanel() {
  const [input, setInput] = useState<SimulationInput>({
    revenue: 10,
    drop: 55,
    main: false,
  });
  const result = simulateBuybacks(input);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'simulate_loop_buybacks',
            description:
              'Configure the visible Loop buyback simulator and calculate a hypothetical batch. Does not submit transactions or move funds.',
            inputSchema: {
              type: 'object',
              properties: {
                revenue: { type: 'number', minimum: 0, maximum: 100000 },
                drop: { type: 'number', minimum: 0, maximum: 99 },
                main: { type: 'boolean' },
              },
              required: ['revenue', 'drop', 'main'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: (value: SimulationInput) => {
              const response = simulateBuybacks(value);
              setInput(value);
              return response;
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  return (
    <div className="buyback-view">
      <div className="view-title">
        <div>
          <span className="eyebrow">THE BUYBACK ENGINE</span>
          <h2>Put the policy to the test.</h2>
          <p>
            Change the revenue and price drop to see what the next batch would
            do.
          </p>
        </div>
        <span className="status-pill">Simulation · No funds move</span>
      </div>
      <div className="metric-grid">
        <Metric
          title="Buyback allocation"
          value={`${fmt(result.allocation.buyback)} SOL`}
          note={`${input.main ? '80' : '70'}% of claimed creator fees`}
          icon={<RefreshCw />}
        />
        <Metric
          title="Held for the next dip"
          value={`${fmt(result.held)} SOL`}
          note={
            result.triggered
              ? 'Pool released by this scenario'
              : 'Waiting for a qualifying 50% dip'
          }
          icon={<Timer />}
        />
        <Metric
          title="Reserved for this batch"
          value={`${fmt(result.reserved)} SOL`}
          note="Purchases plus modeled transaction costs"
          icon={<ShieldCheck />}
        />
      </div>
      <div className="sim-grid">
        <section className="panel simulator">
          <div className="panel-title">
            <h3>Model a buyback cycle</h3>
            <span className="pill">HYPOTHETICAL</span>
          </div>
          <label htmlFor="revenue">
            Confirmed creator-fee revenue{' '}
            <div className="numeric-field">
              <input
                id="revenue"
                type="number"
                min="0"
                max="100000"
                step="0.1"
                value={input.revenue}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v))
                    setInput({
                      ...input,
                      revenue: Math.min(100000, Math.max(0, v)),
                    });
                }}
              />
              <span>SOL</span>
            </div>
          </label>
          <div className="slider-label">
            <label id="drop-label">Drop from the 20-minute high</label>
            <strong>{input.drop}%</strong>
          </div>
          <Slider
            aria-labelledby="drop-label"
            min={0}
            max={99}
            step={1}
            value={[input.drop]}
            onValueChange={(v) =>
              setInput({ ...input, drop: Array.isArray(v) ? v[0] : v })
            }
          />
          <div className="slider-end">
            <span>0% · No drop</span>
            <span>99%</span>
          </div>
          <div className="switch-row">
            <div>
              <strong>Use the LOOP token policy</strong>
              <p>80% buybacks · 0% creator · 20% platform</p>
            </div>
            <Switch
              aria-label="Use LOOP token policy"
              checked={input.main}
              onCheckedChange={(main) => setInput({ ...input, main })}
            />
          </div>
          <div
            className={`trigger-state ${result.triggered ? 'triggered' : ''}`}
          >
            <RefreshCw />
            <div>
              <strong>
                {result.triggered
                  ? 'Dip threshold met'
                  : 'Pool keeps accumulating'}
              </strong>
              <p>
                {result.triggered
                  ? 'The accumulated pool is eligible for measured buys.'
                  : 'Funds stay held until the price falls at least 50%.'}
              </p>
            </div>
          </div>
          <div className="sim-split">
            <span>
              Creator payout<b>{fmt(result.allocation.creator)} SOL</b>
            </span>
            <span>
              Platform allocation<b>{fmt(result.allocation.platform)} SOL</b>
            </span>
          </div>
        </section>
        <section className="panel execution">
          <div className="panel-title">
            <h3>Next batch</h3>
            <span>{result.lots.length} / 4 lots</span>
          </div>
          <p className="execution-caption">
            Each lot uses 2.5% of the released pool, with a 0.05 SOL minimum.
          </p>
          {result.lots.length ? (
            <div className="lot-list">
              {result.lots.map((l, i) => (
                <div className="lot" key={l.id}>
                  <span className="lot-num">0{i + 1}</span>
                  <div>
                    <strong>{fmt(l.purchaseSol)} SOL</strong>
                    <small>Purchase budget</small>
                  </div>
                  <span className="lot-time">+{l.offsetSeconds}s</span>
                  <Flame />
                </div>
              ))}
            </div>
          ) : (
            <div className="batch-empty">
              <Timer />
              <h3>No eligible purchases</h3>
              <p>
                {result.triggered
                  ? 'The pool is too small for a minimum lot and its costs.'
                  : 'Try a drop of 50% or more to release this pool.'}
              </p>
            </div>
          )}
          <div className="execution-summary">
            <span>
              Released funds left unreserved
              <strong>{fmt(result.released)} SOL</strong>
            </span>
            <span>
              Slippage ceiling<strong>1%</strong>
            </span>
            <span>
              Modeled cost per transaction<strong>0.000005 SOL</strong>
            </span>
          </div>
          <button
            className="secondary wide"
            onClick={() =>
              downloadJson('loop-buyback-simulation.json', { input, ...result })
            }
          >
            Export this simulation
            <Download />
          </button>
        </section>
      </div>
      <div className="inline-note">
        <Info />
        <p>
          These are scenario calculations, not market quotes. Actual fees,
          account rent, liquidity and confirmation times change execution.
          Buybacks and burns do not guarantee price support or returns.
        </p>
      </div>
      <section className="panel ledger">
        <div className="panel-title">
          <h3>On-chain buyback history</h3>
          <span className="muted">Live execution is not configured</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>Purchased</TableHead>
              <TableHead>Burned</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={4}>
                <div className="ledger-empty">
                  No verified transactions yet. Confirmed purchase and burn
                  receipts will belong here.
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
export function Metric({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="panel metric">
      <span>
        {title}
        {icon}
      </span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
export function TreasuryPanel() {
  const [net, setNet] = useState(10);
  return (
    <div>
      <div className="view-title">
        <div>
          <span className="eyebrow">LOOP TREASURY</span>
          <h2>Revenue comes full circle.</h2>
          <p>
            A separate stream for the LOOP token, funded by verified net
            platform revenue.
          </p>
        </div>
        <span className="status-pill">Pre-launch</span>
      </div>
      <div className="metric-grid">
        <Metric
          title="Verified revenue"
          value="— SOL"
          note="Treasury wallet not connected"
          icon={<ArrowUpRight />}
        />
        <Metric
          title="LOOP buyback spending"
          value="— SOL"
          note="No confirmed transaction receipts"
          icon={<RefreshCw />}
        />
        <Metric
          title="LOOP burned"
          value="— LOOP"
          note="A token mint has not been configured"
          icon={<Flame />}
        />
      </div>
      <div className="sim-grid">
        <section className="panel simulator">
          <div className="panel-title">
            <h3>Platform revenue policy</h3>
            <span className="pill">PROPOSED</span>
          </div>
          <div className="treasury-split">
            <div>
              <strong>
                50<span>%</span>
              </strong>
              <p>LOOP buyback fund</p>
            </div>
            <div>
              <strong>
                50<span>%</span>
              </strong>
              <p>Retained for operations</p>
            </div>
          </div>
          <div className="allocation">
            <div style={{ width: '50%' }} />
            <div style={{ width: '50%', background: '#466052' }} />
          </div>
          <p className="body-copy">
            This split applies after operating expenses are deducted from
            verified platform income. Deposits, token-sale proceeds and
            unclaimed fees do not become buyback revenue.
          </p>
          <div className="policy-mini">
            <Timer />
            <div>
              <strong>One eligible treasury buy per minute</strong>
              <p>2.5% lots · 0.05 SOL minimum · available budget required</p>
            </div>
          </div>
        </section>
        <section className="panel simulator">
          <h3>Try the allocation</h3>
          <p className="execution-caption">
            A hypothetical net-revenue example.
          </p>
          <label htmlFor="net-revenue">
            Net platform revenue
            <div className="numeric-field">
              <input
                id="net-revenue"
                type="number"
                min="0"
                max="100000"
                value={net}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    setNet(Math.max(0, Math.min(100000, n)));
                }}
              />
              <span>SOL</span>
            </div>
          </label>
          <div className="treasury-result">
            <span>
              LOOP buybacks<strong>{fmt(net / 2)} SOL</strong>
            </span>
            <ArrowRight />
            <span>
              Retained treasury<strong>{fmt(net / 2)} SOL</strong>
            </span>
          </div>
          <div className="inline-note">
            <Info />
            <p>
              Creator payouts stay separate. The treasury cannot spend an
              allocation already owed to a creator or reserved for a pending
              buy.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
