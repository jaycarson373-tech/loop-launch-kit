'use client';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Flame,
  Rocket,
  Wallet,
  ShieldCheck,
  Upload,
  Download,
  FileText,
  Layers,
  Check,
  Info,
  Infinity as LoopIcon,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BuybackPanel, TreasuryPanel } from './buyback-panel';
import { Guide } from './guide';
import { validatePlan, exportPlan, type LaunchPlan } from '@/lib/launch';
const initial = {
  name: '',
  symbol: '',
  description: '',
  image: '',
  payout: '',
  website: '',
  social: '',
};
const storageKey = 'loop-finance.launch-plans.v1';
export default function Home() {
  const [tab, setTab] = useState('launch');
  const [form, setForm] = useState(initial);
  const [plans, setPlans] = useState<LaunchPlan[]>([]);
  const [review, setReview] = useState(false);
  const [readiness, setReadiness] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imageError, setImageError] = useState(false);
  const [extras, setExtras] = useState(false);
  const [currentId, setCurrentId] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved))
        setPlans(
          saved
            .filter((p) => {
              try {
                return (
                  p.status === 'draft' &&
                  typeof p.id === 'string' &&
                  !!validatePlan(p)
                );
              } catch {
                return false;
              }
            })
            .slice(0, 30),
        );
    } catch {
      setNotice(
        'Saved plans could not be read in this browser. You can still export a new plan.',
      );
    }
  }, []);
  useEffect(() => {
    const change = () => {
      const target = location.hash.replace('#', '');
      if (
        [
          'launch',
          'explore',
          'buybacks',
          'treasury',
          'my-launches',
          'how',
        ].includes(target)
      )
        setTab(target);
    };
    change();
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  function navigate(value: string) {
    setTab(value);
    history.replaceState(null, '', `#${value}`);
    setNotice('');
  }
  function makePlan(): LaunchPlan {
    return {
      id: currentId || crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
      createdAt:
        plans.find((p) => p.id === currentId)?.createdAt ||
        new Date().toISOString(),
      status: 'draft',
      policy: 'standard',
      cluster: 'not-selected',
    };
  }
  function openReview() {
    try {
      validatePlan(form);
      setError('');
      setReview(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save() {
    try {
      const plan = makePlan();
      validatePlan(plan);
      const updated = [plan, ...plans.filter((p) => p.id !== plan.id)].slice(
        0,
        30,
      );
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setPlans(updated);
      setCurrentId(plan.id);
      setReview(false);
      navigate('my-launches');
      setNotice('Launch plan saved on this device. No token has been created.');
    } catch {
      setError(
        'This browser could not save your plan. Use Export launch plan instead.',
      );
    }
  }
  async function uploadImage(file?: File) {
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError('Choose a PNG, JPEG or WebP image under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((v) => ({ ...v, image: String(reader.result) }));
      setImageError(false);
      setError('');
    };
    reader.onerror = () =>
      setError('The image could not be read. Try another file.');
    reader.readAsDataURL(file);
  }
  const hasImage = !!form.image && !imageError;
  return (
    <div className="site-shell">
      <header className="topbar">
        <a
          href="#launch"
          className="brand"
          onClick={() => navigate('launch')}
          aria-label="Loop Finance home"
        >
          <LoopIcon />
          <span>
            loop<span className="brand-finance">finance</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a
            className={tab !== 'how' ? 'selected' : ''}
            href="#launch"
            onClick={() => navigate('launch')}
          >
            Launchpad
          </a>
          <a
            className={tab === 'how' ? 'selected' : ''}
            href="#how"
            onClick={() => navigate('how')}
          >
            How it works
          </a>
        </nav>
        <span className="network">
          <i />
          Solana · Preview
        </span>
        <button className="wallet-button" onClick={() => setReadiness(true)}>
          <Wallet />
          <span>Launch status</span>
        </button>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <span />
              THE SOLANA BUYBACK LAUNCHPAD
            </div>
            <h1>
              Good tokens come
              <br />
              <em>full circle.</em>
            </h1>
            <p>
              Launch a token. Put creator fees back to work.
              <br />A transparent loop of buybacks and burns.
            </p>
          </div>
          <div className="intro-note">
            <RefreshCw />
            <span>
              Built around the buyback.
              <br />
              <b>Designed for the long run.</b>
            </span>
          </div>
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => navigate(String(v))}
          className="workspace"
        >
          <div className="workspace-heading">
            <TabsList variant="line" aria-label="Loop workspace">
              <TabsTrigger value="launch">
                <Rocket />
                Create a token
              </TabsTrigger>
              <TabsTrigger value="explore">Explore</TabsTrigger>
              <TabsTrigger value="buybacks">
                <RefreshCw />
                Buybacks
              </TabsTrigger>
              <TabsTrigger value="treasury">Treasury</TabsTrigger>
              <TabsTrigger value="my-launches">
                My launches
                {plans.length > 0 && (
                  <span className="count">{plans.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="how">
                <FileText />
                Guide
              </TabsTrigger>
            </TabsList>
            <span className="muted">PRE-LAUNCH</span>
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check />
              {notice}
            </div>
          )}
          <TabsContent value="launch">
            <div className="launch-grid">
              <section className="panel launch-form">
                <div className="section-heading">
                  <span className="step">01</span>
                  <div>
                    <h2>Start your loop</h2>
                    <p>Your token. A built-in buyback policy.</p>
                  </div>
                  <Rocket />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    openReview();
                  }}
                >
                  <div className="field-grid">
                    <label>
                      Token name
                      <input
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        placeholder="e.g. Loop Finance"
                        maxLength={32}
                        required
                      />
                    </label>
                    <label>
                      Symbol
                      <div className="input-prefix">
                        <span>$</span>
                        <input
                          value={form.symbol}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              symbol: e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, ''),
                            })
                          }
                          placeholder="LOOP"
                          maxLength={10}
                          required
                        />
                      </div>
                    </label>
                  </div>
                  <label className="form-label">
                    Token image <span>Optional · PNG, JPG, WebP</span>
                  </label>
                  <div
                    className="upload-area"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void uploadImage(e.dataTransfer.files[0]);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => upload.current?.click()}
                    >
                      {hasImage ? (
                        <img
                          src={form.image}
                          alt="Selected token artwork"
                          onError={() => setImageError(true)}
                        />
                      ) : (
                        <Upload />
                      )}
                      <span>
                        {hasImage
                          ? 'Change token artwork'
                          : 'Drop an image or browse'}
                        <small>Square works best · Up to 2 MB</small>
                      </span>
                      <span className="upload-plus">+</span>
                    </button>
                    <input
                      ref={upload}
                      aria-label="Upload token artwork"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => void uploadImage(e.target.files?.[0])}
                    />
                  </div>
                  <label className="form-label">
                    Description <span>Optional</span>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="Tell the world what you’re putting in motion."
                      rows={2}
                      maxLength={500}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-button extra-toggle"
                    onClick={() => setExtras(!extras)}
                    aria-expanded={extras}
                  >
                    {extras ? '−' : '+'} Payout address & project links
                  </button>
                  {extras && (
                    <div className="extra-fields">
                      <label>
                        Public payout address
                        <input
                          value={form.payout}
                          onChange={(e) =>
                            setForm({ ...form, payout: e.target.value.trim() })
                          }
                          placeholder="Your Solana wallet address"
                          maxLength={44}
                        />
                      </label>
                      <label>
                        Website
                        <input
                          type="url"
                          value={form.website}
                          onChange={(e) =>
                            setForm({ ...form, website: e.target.value })
                          }
                          placeholder="https://your-project.com"
                        />
                      </label>
                      <label>
                        X / social link
                        <input
                          type="url"
                          value={form.social}
                          onChange={(e) =>
                            setForm({ ...form, social: e.target.value })
                          }
                          placeholder="https://x.com/your-project"
                        />
                      </label>
                    </div>
                  )}
                  <div className="policy-mini">
                    <RefreshCw />
                    <div>
                      <strong>Buyback & burn comes standard</strong>
                      <p>70% buybacks · 10% creator · 20% platform</p>
                    </div>
                    <ShieldCheck />
                  </div>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="primary wide" type="submit">
                    Review launch plan
                    <ArrowRight />
                  </button>
                  <p className="footnote">
                    <ShieldCheck />
                    Preview mode. No funds are requested or moved.
                  </p>
                </form>
              </section>
              <aside className="token-panel">
                <div className="preview-header">
                  <span className="eyebrow">YOUR TOKEN PREVIEW</span>
                  <span className="pill">SOLANA</span>
                </div>
                <div className={`token-mark ${hasImage ? 'has-image' : ''}`}>
                  {hasImage ? (
                    <img
                      src={form.image}
                      alt={`${form.name || 'Token'} artwork`}
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <LoopIcon />
                  )}
                </div>
                <h2>{form.name || 'Your next big idea'}</h2>
                <span className="token-symbol">${form.symbol || 'TOKEN'}</span>
                <p className="preview-description">
                  {form.description || 'A fresh start. A continuous loop.'}
                </p>
                <div className="flow-diagram">
                  <span>Creator fees</span>
                  <ArrowRight />
                  <span>Buyback</span>
                  <ArrowRight />
                  <span>
                    Burn
                    <Flame />
                  </span>
                </div>
                <div className="allocation">
                  <div style={{ width: '70%' }} />
                  <div style={{ width: '10%' }} />
                  <div style={{ width: '20%' }} />
                </div>
                <div className="allocation-labels">
                  <span>
                    <i />
                    70%<small>Buyback & burn</small>
                  </span>
                  <span>
                    <i />
                    10%<small>Creator</small>
                  </span>
                  <span>
                    <i />
                    20%<small>Platform</small>
                  </span>
                </div>
                <div className="preview-policy">
                  <div>
                    <span>Dip trigger</span>
                    <strong>50% from rolling high</strong>
                  </div>
                  <div>
                    <span>Window</span>
                    <strong>20 minutes</strong>
                  </div>
                  <div>
                    <span>Purchase size</span>
                    <strong>2.5% per lot</strong>
                  </div>
                  <div>
                    <span>Minimum lot</span>
                    <strong>0.05 SOL + costs</strong>
                  </div>
                </div>
                <button
                  className="text-button preview-link"
                  onClick={() => navigate('buybacks')}
                >
                  Try the buyback simulator
                  <ArrowUpRight />
                </button>
                <div className="token-bottom">
                  <span>
                    <RefreshCw />
                    Proposed policy
                  </span>
                  <span>Live execution not enabled</span>
                </div>
              </aside>
            </div>
          </TabsContent>
          <TabsContent value="explore">
            <div className="view-title">
              <div>
                <span className="eyebrow">EXPLORE THE ECOSYSTEM</span>
                <h2>Every token has a loop.</h2>
                <p>
                  Verified launches and their buyback pools will appear here.
                </p>
              </div>
              <span className="status-pill">0 live tokens</span>
            </div>
            <div className="explore-grid">
              <article className="panel main-token-card">
                <div className="main-token-logo">
                  <LoopIcon />
                </div>
                <span className="pill">PLANNED</span>
                <h3>
                  Loop Finance <small>$LOOP</small>
                </h3>
                <p>
                  The proposed native token. 80% of creator fees allocated to
                  buybacks, plus a separate stream from net platform revenue.
                </p>
                <div className="token-details">
                  <span>
                    Mint address<b>Not deployed</b>
                  </span>
                  <span>
                    Buyback execution<b>Not enabled</b>
                  </span>
                </div>
                <button
                  className="secondary wide"
                  onClick={() => navigate('treasury')}
                >
                  Explore the treasury policy
                  <ArrowUpRight />
                </button>
              </article>
              <div className="panel empty">
                <Layers />
                <h2>The next loop starts with you.</h2>
                <p>Create a launch plan and preview its buyback policy.</p>
                <button className="primary" onClick={() => navigate('launch')}>
                  Create a token plan
                  <ArrowRight />
                </button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="buybacks">
            <BuybackPanel />
          </TabsContent>
          <TabsContent value="treasury">
            <TreasuryPanel />
          </TabsContent>
          <TabsContent value="my-launches">
            <div className="view-title">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h2>Ideas, ready for their next step.</h2>
                <p>
                  Launch plans saved on this device. Export a copy to keep a
                  backup.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setForm(initial);
                  setCurrentId('');
                  navigate('launch');
                }}
              >
                New plan
                <ArrowRight />
              </button>
            </div>
            {plans.length ? (
              <div className="plans-grid">
                {plans.map((plan) => (
                  <article className="panel plan-card" key={plan.id}>
                    <div className="plan-symbol">{plan.symbol.slice(0, 2)}</div>
                    <span className="pill">DRAFT</span>
                    <h3>{plan.name}</h3>
                    <span className="token-symbol">${plan.symbol}</span>
                    <p>{plan.description || 'Your next token launch.'}</p>
                    <div className="token-details">
                      <span>
                        Buyback allocation<b>70%</b>
                      </span>
                      <span>
                        Network<b>Not selected</b>
                      </span>
                    </div>
                    <div className="plan-actions">
                      <button
                        className="secondary"
                        onClick={() => {
                          setForm({
                            name: plan.name,
                            symbol: plan.symbol,
                            description: plan.description,
                            image: plan.image,
                            payout: plan.payout,
                            website: plan.website,
                            social: plan.social,
                          });
                          setCurrentId(plan.id);
                          setImageError(false);
                          setError('');
                          navigate('launch');
                        }}
                      >
                        Edit plan
                        <ArrowUpRight />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Export ${plan.name} plan`}
                        onClick={() => exportPlan(plan)}
                      >
                        <Download />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel empty">
                <Rocket />
                <h2>Your first launch starts here.</h2>
                <p>
                  Give your token a name, review the policy and save your plan.
                </p>
                <button className="primary" onClick={() => navigate('launch')}>
                  Create a token plan
                  <ArrowRight />
                </button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="how">
            <Guide />
          </TabsContent>
        </Tabs>
        <section className="feature-grid">
          <article>
            <RefreshCw />
            <h3>Fees that come back.</h3>
            <p>Confirmed creator fees fund a dedicated buyback pool.</p>
          </article>
          <article>
            <Flame />
            <h3>Make every burn count.</h3>
            <p>The policy targets a purchase and burn in one transaction.</p>
          </article>
          <article>
            <ShieldCheck />
            <h3>Follow the whole loop.</h3>
            <p>Separate balances for buybacks, creators and the treasury.</p>
          </article>
        </section>
        <footer>
          <a
            href="#launch"
            onClick={() => navigate('launch')}
            className="brand small"
          >
            <LoopIcon />
            loop <span className="brand-finance">finance</span>
          </a>
          <p>Built for Solana. Inspired by circular thinking.</p>
          <button className="text-button" onClick={() => navigate('how')}>
            Read the policy
            <ArrowUpRight />
          </button>
          <span>© 2026 Loop Finance</span>
        </footer>
      </main>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="loop-dialog">
          <span className="dialog-icon">
            <Rocket />
          </span>
          <DialogTitle>Review your launch plan</DialogTitle>
          <DialogDescription>
            Check the details before saving. This creates a local draft; it does
            not launch a token or charge your wallet.
          </DialogDescription>
          <div className="review-token">
            <strong>{form.name}</strong>
            <span>${form.symbol}</span>
          </div>
          <div className="review-rows">
            <span>
              Buyback allocation<b>70%</b>
            </span>
            <span>
              Creator payout<b>10%</b>
            </span>
            <span>
              Platform allocation<b>20%</b>
            </span>
            <span>
              Payout address
              <b>
                {form.payout
                  ? `${form.payout.slice(0, 6)}…${form.payout.slice(-6)}`
                  : 'Set before launch'}
              </b>
            </span>
            <span>
              Network / mint<b>Not configured</b>
            </span>
          </div>
          <div className="inline-note">
            <Info />
            <p>
              Live launch and automated transactions need a configured mint,
              treasury and execution service.
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary wide" onClick={save}>
            Save launch plan
            <Check />
          </button>
          <button
            className="secondary wide"
            onClick={() => exportPlan(makePlan())}
          >
            Export launch plan
            <Download />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={readiness} onOpenChange={setReadiness}>
        <DialogContent className="loop-dialog">
          <span className="dialog-icon">
            <Wallet />
          </span>
          <DialogTitle>Loop is in pre-launch.</DialogTitle>
          <DialogDescription>
            You can create token plans and test the buyback policy. No wallet
            payments are enabled.
          </DialogDescription>
          <div className="readiness-list">
            <span>
              <Check />
              Site and token planning <b>Ready</b>
            </span>
            <span>
              <Check />
              Buyback policy engine <b>Tested</b>
            </span>
            <span>
              <Info />
              Treasury wallet <b>Needed</b>
            </span>
            <span>
              <Info />
              LOOP token mint <b>Needed</b>
            </span>
            <span>
              <Info />
              Live execution service <b>Needed</b>
            </span>
          </div>
          <button
            className="primary wide"
            onClick={() => {
              setReadiness(false);
              navigate('buybacks');
            }}
          >
            Explore the simulator
            <ArrowRight />
          </button>
          <p className="footnote">
            Loop Finance is independent of pump.fun and Revolve.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
