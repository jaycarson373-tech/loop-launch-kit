'use client';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Flame,
  Rocket,
  ShieldCheck,
  Upload,
  Download,
  FileText,
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
import {
  LoopProvider,
  useLoop,
  WalletControl,
  ServerLaunches,
  ExploreLive,
  requestApi,
} from './live';
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
  return (
    <LoopProvider>
      <HomeContent />
    </LoopProvider>
  );
}
function HomeContent() {
  const { address, openWallet, config, changed } = useLoop();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('launch');
  const [form, setForm] = useState(initial);
  const [plans, setPlans] = useState<LaunchPlan[]>([]);
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imageError, setImageError] = useState(false);
  const [extras, setExtras] = useState(false);
  const [currentId, setCurrentId] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
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
    }, 0);
    return () => clearTimeout(timer);
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
  async function save() {
    if (!address) {
      openWallet();
      return;
    }
    setSaving(true);
    setError('');
    try {
      validatePlan(form);
      const result = await requestApi<{ id: string }>('launches', {
        id: currentId || undefined,
        wallet: address,
        plan: form,
      });
      setCurrentId(result.id);
      setReview(false);
      changed();
      navigate('my-launches');
      setNotice(
        'Launch plan saved to your workspace. Review and sign a separate transaction to launch.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
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
    try {
      setSaving(true);
      const response = await fetch('/api/loop/assets', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = (await response.json()) as { image: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setForm((v) => ({ ...v, image: data.image }));
      setImageError(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
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
          Solana · {config?.cluster === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}
        </span>
        <WalletControl />
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
            <span className="muted">
              {config?.launchEnabled ? 'CONFIGURED' : 'SETUP REQUIRED'}
            </span>
          </div>
          {notice && (
            <div className="notice" aria-live="polite">
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
                  <label className="form-label" htmlFor="token-artwork">
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
                        <Image
                          unoptimized
                          width={128}
                          height={128}
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
                      id="token-artwork"
                      aria-label="Upload token artwork"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      onChange={(e) => void uploadImage(e.target.files?.[0])}
                    />
                  </div>
                  <label className="form-label" htmlFor="token-artwork">
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
                    Saving is free. Launch transactions require your wallet
                    signature.
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
                    <Image
                      unoptimized
                      width={128}
                      height={128}
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
                    Buyback policy
                  </span>
                  <span>
                    {config?.automationEnabled
                      ? 'Keeper configured'
                      : 'Keeper setup required'}
                  </span>
                </div>
              </aside>
            </div>
          </TabsContent>
          <TabsContent value="explore">
            <div className="view-title">
              <div>
                <span className="eyebrow">EXPLORE THE ECOSYSTEM</span>
                <h2>Every token has a loop.</h2>
                <p>Confirmed launches and their accounted buyback pools.</p>
              </div>
            </div>
            <ExploreLive />
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
                <p>Saved launches, transaction review and on-chain receipts.</p>
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
            <ServerLaunches
              onEdit={(row) => {
                setForm({ ...initial, ...row.plan });
                setCurrentId(row.id);
                setError('');
                navigate('launch');
              }}
            />
            {plans.length > 0 && (
              <div className="panel legacy-drafts">
                <h3>Earlier drafts on this device</h3>
                {plans.map((plan) => (
                  <button
                    className="secondary"
                    key={plan.id}
                    onClick={() => {
                      setForm({ ...initial, ...plan, image: '' });
                      setCurrentId('');
                      navigate('launch');
                      setNotice(
                        'Connect your wallet and re-upload the artwork to save this earlier draft to your workspace.',
                      );
                    }}
                  >
                    {plan.name} · Import
                  </button>
                ))}
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
            Save the details to your workspace, then prepare a launch for
            simulation and wallet review. Saving a draft does not charge your
            wallet.
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
              Network<b>{config?.cluster || 'Devnet'}</b>
            </span>
          </div>
          <div className="inline-note">
            <Info />
            <p>
              Launch fees include network costs and 0.01 SOL of operating funds
              for your token’s dedicated creator wallet. Metadata is published
              when you prepare the launch.
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving
              ? 'Saving…'
              : address
                ? 'Save launch plan'
                : 'Connect wallet to save'}
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
    </div>
  );
}
