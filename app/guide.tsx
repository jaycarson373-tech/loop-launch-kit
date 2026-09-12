import { ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react';
export function Guide() {
  return (
    <div className="guide">
      <div className="view-title">
        <div>
          <span className="eyebrow">THE LOOP FIELD GUIDE</span>
          <h2>Know where every SOL goes.</h2>
          <p>
            The proposed policy, the mechanics, and the current launch status.
          </p>
        </div>
        <span className="status-pill">Policy v0.1 · Preview</span>
      </div>
      <div className="guide-layout">
        <nav aria-label="Guide sections">
          {[
            'Launch a token',
            'Follow the fees',
            'Buyback triggers',
            'Purchases and burns',
            'The LOOP treasury',
            'Execution and recovery',
            'Current readiness',
          ].map((s, i) => (
            <a key={s} href={`#guide-${i}`}>
              <span>0{i + 1}</span>
              {s}
            </a>
          ))}
        </nav>
        <div className="guide-content">
          <article id="guide-0">
            <span className="eyebrow">01 / LAUNCH</span>
            <h3>Give your token a starting point.</h3>
            <p>
              Set a name, symbol, artwork and payout address. Review the
              proposed policy and save or export the launch plan. Plans are
              saved only in this browser and do not create tokens. Artwork
              uploaded here stays in the plan until a metadata hosting service
              is configured.
            </p>
            <p>
              A future live launch needs a reviewed transaction, a selected
              network, current costs and a wallet signature. Loop does not
              currently collect a setup payment.
            </p>
          </article>
          <article id="guide-1">
            <span className="eyebrow">02 / ALLOCATION</span>
            <h3>Three balances. One clear policy.</h3>
            <div className="guide-allocation">
              <span>
                <b>70%</b>Buyback & burn
              </span>
              <span>
                <b>10%</b>Creator payout
              </span>
              <span>
                <b>20%</b>Platform
              </span>
            </div>
            <p>
              The engine allocates confirmed creator-fee income using integer
              lamports. Unclaimed revenue cannot be spent. Each receipt can be
              credited once. Payout funds and platform funds remain separate
              from a token’s buyback pool.
            </p>
            <p>
              The proposed LOOP token uses 80% buybacks and 20% platform
              funding, with no creator payout. Transaction costs must come from
              the balance responsible for that activity.
            </p>
          </article>
          <article id="guide-2">
            <span className="eyebrow">03 / TRIGGER</span>
            <h3>Accumulate first. Act on a qualifying dip.</h3>
            <p>
              The policy observes a rolling 20-minute price high. A fall of at
              least 50% releases the held buyback allocation. A clock alone
              cannot release it. New revenue stays held during an active cycle.
            </p>
            <p>
              Re-arming requires recovery above 80% of the current rolling high.
              Once released, a cycle remains eligible to complete even if price
              recovers. Prices must be positive, ordered and no more than 30
              seconds old. Missing data stops eligibility.
            </p>
          </article>
          <article id="guide-3">
            <span className="eyebrow">04 / EXECUTION</span>
            <h3>Small lots. Accounted-for spending.</h3>
            <p>
              A cycle sizes each purchase at 2.5% of its initial released
              budget, with a 0.05 SOL minimum. A batch has at most four lots
              with two seconds of planned spacing. Purchase budgets and
              transaction costs are reserved together before execution. Tiny
              remaining balances wait.
            </p>
            <p>
              The intended live transaction purchases tokens and burns the
              delivered amount atomically. This needs a tested on-chain
              integration; the current engine only plans and accounts for
              transactions. Loop’s proposed slippage ceiling is 1%. A quote
              outside it must be rejected.
            </p>
            <p>
              Burning reduces supply. Neither purchases nor burns guarantee a
              price floor, sufficient liquidity, or a return.
            </p>
          </article>
          <article id="guide-4">
            <span className="eyebrow">05 / TREASURY</span>
            <h3>A second stream for LOOP.</h3>
            <p>
              Half of verified net platform revenue is allocated to LOOP
              buybacks. The other half remains in the treasury. Operating
              expenses are deducted first. Wallet deposits and token-sale
              proceeds are excluded from this calculation.
            </p>
            <p>
              This stream targets one eligible lot per minute, independently of
              a dip. It still needs current prices, available funds, valid
              quotes and settled previous reservations. The simulator assumes
              zero operating costs when illustrating the platform allocation.
            </p>
          </article>
          <article id="guide-5">
            <span className="eyebrow">06 / RECOVERY</span>
            <h3>Uncertain is a real state.</h3>
            <p>
              A timeout is not evidence of failure. Uncertain transactions
              retain their reservations and block new batches. Confirmed
              receipts charge the actual debit; failed transactions can still
              incur fees. Conflicting receipts halt the engine.
            </p>
            <p>
              Moving from a bonding curve to PumpSwap resets the price reference
              and pauses execution until the venue is verified. Production
              requires durable storage of receipts and reservations,
              reconciliation after restarts, monitored RPC access, and a
              controlled signing service.
            </p>
          </article>
          <article id="guide-6">
            <span className="eyebrow">07 / READINESS</span>
            <h3>What is available today.</h3>
            <ul>
              <li>Token-plan creation, validation, local saving and export.</li>
              <li>
                Tested fee allocation, dip evaluation, treasury allocation and
                reservation accounting.
              </li>
              <li>Interactive buyback simulation and JSON export.</li>
            </ul>
            <p>
              Live token creation, fee claims, payouts, swap-and-burn
              transactions, and continuous background execution are not
              connected. No live mint or treasury address has been configured.
              There is no deployed Loop smart contract or audited custody
              service.
            </p>
            <p>
              The reference project is{' '}
              <a
                href="https://revolvepad.com/"
                target="_blank"
                rel="noreferrer"
              >
                Revolve <ArrowUpRight />
              </a>
              . Its website identifies pump.fun as its launch platform and links{' '}
              <a
                href="https://pump.fun/coin/J8X5ygWHY5uHFch7m3MisSC7eDAWpAkgi1pyqfT5pump"
                target="_blank"
                rel="noreferrer"
              >
                this REVOLVE token <ArrowUpRight />
              </a>
              . Loop Finance is an independent project with its own
              implementation.
            </p>
          </article>
        </div>
      </div>
    </div>
  );
}
