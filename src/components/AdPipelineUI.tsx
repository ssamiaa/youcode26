import { useState, useEffect, useRef } from 'react';
import { useAdPipeline } from '../hooks/useAdPipeline';
import type { AdInput, PipelineStep, AdArchetype, PostBlueprint, AlignmentResult, CopyAssets, ScrimStyle } from '../hooks/useAdPipeline';
import { supabase } from '../lib/supabaseClient';
import './AdPipelineUI.css';

// ─── Step Definitions ────────────────────────────────────────────────────────

interface StepDef {
  id: PipelineStep;
  label: string;
  icon: string;
}

const PIPELINE_STEPS: StepDef[] = [
  { id: 'blueprint', label: 'Architect', icon: '✦' },
  { id: 'sourcing',  label: 'Hunter',    icon: '⬡' },
  { id: 'observing', label: 'Observer',  icon: '◎' },
  { id: 'aligning',  label: 'Aligner',   icon: '◈' },
  { id: 'writing',   label: 'Copywriter',icon: '✎' },
  { id: 'building',  label: 'Builder',   icon: '⬢' },
];

const STEP_ORDER: PipelineStep[] = [
  'blueprint', 'sourcing', 'observing', 'aligning', 'writing', 'building', 'done',
];

function getStepOrdinal(step: PipelineStep): number {
  const i = STEP_ORDER.indexOf(step);
  return i === -1 ? 0 : i;
}

// ─── Archetype Meta ──────────────────────────────────────────────────────────

const ARCHETYPE_META: Record<AdArchetype, { color: string; icon: string }> = {
  'Skill-Builder':     { color: '#06b6d4', icon: '⚙' },
  'Community-Seeker':  { color: '#22c55e', icon: '◎' },
  'Legacy-Maker':      { color: '#a855f7', icon: '◆' },
};

const SCRIM_LABELS: Record<ScrimStyle, string> = {
  'band-south':  'Band · south',
  'band-north':  'Band · north',
  'panel-left':  'Panel · left',
  'panel-right': 'Panel · right',
  'full':        'Full overlay',
  'dual':        'Dual bands',
};

// ─── Progress Bar ────────────────────────────────────────────────────────────

function PipelineProgress({
  step,
  stepMessage,
}: {
  step: PipelineStep;
  stepMessage: string;
}) {
  const currentOrdinal = getStepOrdinal(step);

  return (
    <div className="pipeline-progress">
      <div className="pipeline-steps">
        {PIPELINE_STEPS.map((s, idx) => {
          const stepOrdinal = getStepOrdinal(s.id);
          const isActive = step === s.id;
          const isDone   = currentOrdinal > stepOrdinal;

          return (
            <div
              key={s.id}
              className={[
                'pipeline-step',
                isActive ? 'active' : '',
                isDone   ? 'done'   : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="step-icon">
                {isDone ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span>{s.icon}</span>
                )}
                {isActive && <span className="pulse-ring" />}
              </div>
              <span className="step-label">{s.label}</span>
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className={`step-connector ${isDone ? 'filled' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      <p className="stage-message">{stepMessage}</p>
    </div>
  );
}

// ─── Progressive Reveal Cards ────────────────────────────────────────────────

function BlueprintCard({ blueprint }: { blueprint: PostBlueprint }) {
  const meta = ARCHETYPE_META[blueprint.archetype];
  return (
    <div className="reveal-card reveal-blueprint">
      <div className="reveal-card-header">
        <span className="reveal-phase-label">Blueprint</span>
        <span
          className="archetype-pill"
          style={{ '--archetype-color': meta.color } as React.CSSProperties}
        >
          <span>{meta.icon}</span>
          {blueprint.archetype}
        </span>
      </div>
      <p className="reveal-idea">"{blueprint.idea}"</p>
      <div className="reveal-meta-row">
        <div className="reveal-meta-item">
          <span className="reveal-meta-label">Feeling</span>
          <span className="reveal-meta-value">{blueprint.feeling}</span>
        </div>
        <div className="reveal-meta-item">
          <span className="reveal-meta-label">Audience</span>
          <span className="reveal-meta-value">{blueprint.targetAudience}</span>
        </div>
      </div>
    </div>
  );
}

function ImageCard({
  imageUrl,
  imageSummary,
}: {
  imageUrl: string;
  imageSummary: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="reveal-card reveal-image-card">
      <div className="reveal-card-header">
        <span className="reveal-phase-label">Image Sourced</span>
      </div>
      <div className="reveal-image-wrap">
        {!loaded && <div className="reveal-img-skeleton"><div className="skeleton-shimmer" /></div>}
        <img
          src={imageUrl}
          alt="Sourced"
          className={loaded ? 'loaded' : 'loading'}
          onLoad={() => setLoaded(true)}
        />
      </div>
      {imageSummary && (
        <p className="reveal-summary">
          <span className="reveal-meta-label">Observer: </span>
          {imageSummary}
        </p>
      )}
    </div>
  );
}

function AlignmentCard({ alignment }: { alignment: AlignmentResult }) {
  return (
    <div className={`reveal-card reveal-alignment ${alignment.aligned ? 'aligned' : 'pivoted'}`}>
      <div className="reveal-card-header">
        <span className="reveal-phase-label">Alignment</span>
        <span className={`alignment-badge ${alignment.aligned ? 'badge-aligned' : 'badge-pivoted'}`}>
          {alignment.aligned ? '✓ Aligned' : '↻ Pivoted'}
        </span>
      </div>
      <p className="reveal-idea">"{alignment.revisedIdea}"</p>
      <p className="reveal-alignment-note">{alignment.alignmentNote}</p>
    </div>
  );
}

function CopyCard({ copyAssets }: { copyAssets: CopyAssets }) {
  const spec = copyAssets.builderSpec;
  return (
    <div className="reveal-card reveal-copy-card">
      <div className="reveal-card-header">
        <span className="reveal-phase-label">Copy Ready</span>
        <span className="placement-pill">
          {SCRIM_LABELS[spec.scrimStyle]} · {spec.layers.length} layers
        </span>
      </div>
      <p className="reveal-headline-preview">{copyAssets.headline}</p>
      <p className="reveal-cta-preview">{copyAssets.cta} →</p>
    </div>
  );
}

// ─── Result View ─────────────────────────────────────────────────────────────

interface AdResultProps {
  cloudinaryUrl: string;
  imageUrl: string;
  copyAssets: CopyAssets;
  blueprint: PostBlueprint;
  imageSummary: string;
  alignment: AlignmentResult;
  onReset: () => void;
}

function AdResult({ cloudinaryUrl, imageUrl, copyAssets, blueprint, imageSummary, alignment, onReset }: AdResultProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError]   = useState(false);
  const archetypeMeta = ARCHETYPE_META[blueprint.archetype];

  return (
    <div className="ad-result">
      <div className="result-header">
        <div className="result-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Ad Generated
        </div>
        <div className="result-header-pills">
          <div
            className="archetype-pill"
            style={{ '--archetype-color': archetypeMeta.color } as React.CSSProperties}
          >
            <span>{archetypeMeta.icon}</span>
            {blueprint.archetype}
          </div>
          <div className="placement-pill">{SCRIM_LABELS[copyAssets.builderSpec.scrimStyle]}</div>
        </div>
      </div>

      {/* Main grid: ad preview + copy metadata */}
      <div className="result-grid">
        <div className="ad-preview-card">
          <div className="preview-label">Cloudinary Render</div>
          {!imgLoaded && !imgError && (
            <div className="img-skeleton">
              <div className="skeleton-shimmer" />
              <span>Rendering ad...</span>
            </div>
          )}
          {imgError ? (
            <div className="img-error">
              <p>Preview unavailable</p>
              <a href={cloudinaryUrl} target="_blank" rel="noopener noreferrer">Open URL</a>
            </div>
          ) : (
            <img
              src={cloudinaryUrl}
              alt={copyAssets.headline}
              className={imgLoaded ? 'loaded' : 'loading'}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          )}
        </div>

        <div className="ad-meta">
          <section className="meta-section">
            <h3>Ad Copy</h3>
            <div className="copy-block">
              <div className="copy-label">Headline</div>
              <p className="headline-text">{copyAssets.headline}</p>
            </div>
            <div className="copy-block">
              <div className="copy-label">Body</div>
              <p className="body-text">{copyAssets.body}</p>
            </div>
            <div className="copy-block">
              <div className="copy-label">CTA</div>
              <p className="body-text">{copyAssets.cta}</p>
            </div>
            <div className="copy-block">
              <div className="copy-label">Layout</div>
              <p className="body-text">
                Style: <strong>{SCRIM_LABELS[copyAssets.builderSpec.scrimStyle]}</strong> ·
                Scrim: <strong>{copyAssets.builderSpec.scrimOpacity}%</strong> ·
                Layers: <strong>{copyAssets.builderSpec.layers.length}</strong> ·
                Colour: <code className="query-text">#{copyAssets.builderSpec.scrimColorHex}</code>
              </p>
            </div>
          </section>

          <section className="meta-section urls-section">
            <h3>URLs</h3>
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="url-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Source Image (Pexels)
            </a>
            <a href={cloudinaryUrl} target="_blank" rel="noopener noreferrer" className="url-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              Cloudinary Transform URL
            </a>
          </section>
        </div>
      </div>

      {/* Strategy Insights row */}
      <div className="strategy-insights">
        <div className="insights-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Pipeline Rationale
        </div>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="insight-content">
              <div className="insight-label">Target Audience</div>
              <p className="insight-text">{blueprint.targetAudience}</p>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
              </svg>
            </div>
            <div className="insight-content">
              <div className="insight-label">Blueprint Idea</div>
              <p className="insight-text">{blueprint.idea}</p>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div className="insight-content">
              <div className="insight-label">Image Analysis</div>
              <p className="insight-text">{imageSummary}</p>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div className="insight-content">
              <div className="insight-label">Alignment Decision</div>
              <p className="insight-text">
                <strong style={{ color: alignment.aligned ? 'var(--green)' : 'var(--yellow)' }}>
                  {alignment.aligned ? 'Image matched brief' : 'Idea pivoted to fit image'}
                </strong>
                {' — '}{alignment.alignmentNote}
              </p>
            </div>
          </div>
        </div>
      </div>

      <button className="btn-reset" onClick={onReset}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
        </svg>
        Generate Another Ad
      </button>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

const ARCH_STRIP = ['Architect', 'Hunter', 'Observer', 'Aligner', 'Copywriter', 'Builder'] as const;

export function AdPipelineUI({ onBack, insightsContext, onInsightsConsumed }: {
  onBack?: () => void;
  insightsContext?: string;
  /** Called once the insights-driven pipeline has been auto-started, so the
   *  parent can clear the context and prevent it re-firing on future visits. */
  onInsightsConsumed?: () => void;
} = {}) {
  const {
    step, stepMessage,
    blueprint, imageUrl, imageSummary, alignment, copyAssets, cloudinaryUrl,
    error, run, reset,
  } = useAdPipeline();

  // ── Fetch org from Supabase ───────────────────────────────────────────────
  const [orgInput, setOrgInput] = useState<AdInput | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [orgFetchError, setOrgFetchError] = useState<string | null>(null);
  const [mission, setMission] = useState('');

  // Track which insights string we've already consumed so we never double-fire.
  const consumedInsightRef = useRef<string | null>(null);

  useEffect(() => {
    async function fetchOrg() {
      if (!supabase) {
        setOrgFetchError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
        setLoadingOrg(false);
        return;
      }
      const { data, error: dbErr } = await supabase
        .from('organizations')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (dbErr) {
        setOrgFetchError(`Database error: ${dbErr.message} (code: ${dbErr.code})`);
        setLoadingOrg(false);
        return;
      }

      if (!data) {
        setOrgFetchError('No organization found. Please register your organization first.');
        setLoadingOrg(false);
        return;
      }

      setOrgInput({
        orgName:  data.legal_name || data.account_name || 'My Organization',
        sector:   data.sector    || 'Other',
        mission:  '',
        location: [data.city, data.province].filter(Boolean).join(', '),
        contact:  data.website || data.email || [data.city, data.province].filter(Boolean).join(', '),
      });
      setLoadingOrg(false);
    }
    fetchOrg();
  }, []);

  // ── Auto-start when insights context arrives ──────────────────────────────
  // Fires whenever insightsContext or orgInput changes. The ref guard ensures
  // each unique insights string triggers exactly one pipeline run.
  useEffect(() => {
    if (!insightsContext?.trim() || !orgInput) {
      // Context was cleared after being consumed — reset so the next click works.
      consumedInsightRef.current = null;
      return;
    }
    if (consumedInsightRef.current === insightsContext) return;

    consumedInsightRef.current = insightsContext;
    onInsightsConsumed?.();
    run({ ...orgInput, mission: '', insightsContext });
  }, [insightsContext, orgInput, onInsightsConsumed, run]);

  const isProcessing = (
    step === 'blueprint' || step === 'sourcing' || step === 'observing' ||
    step === 'aligning'  || step === 'writing'  || step === 'building'
  );

  return (
    <div className="ad-pipeline">
      <header className="pipeline-header">
        {onBack && (
          <button className="pipeline-back-btn" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to dashboard
          </button>
        )}
        <div className="header-badge">6-AGENT PIPELINE</div>
        <h1>Non-Profit Ad Generator</h1>
        <p>
          Six AI agents collaborate — an Architect blueprints the campaign, a Hunter sources imagery,
          an Observer analyses it with vision, an Aligner pivots the idea if needed, a Copywriter
          crafts the copy, and a Builder composes the final creative.
        </p>
      </header>

      <div className="arch-strip">
        {ARCH_STRIP.map((label, i, arr) => (
          <div key={label} className="arch-item">
            <span className="arch-step">{label}</span>
            {i < arr.length - 1 && <span className="arch-arrow">→</span>}
          </div>
        ))}
      </div>

      <main className="pipeline-body">

        {/* ── Idle: show Generate button ── */}
        {step === 'idle' && (
          loadingOrg ? (
            <div className="org-loading">
              <div className="org-loading-spinner" />
              <p>Loading organization data…</p>
            </div>
          ) : orgFetchError ? (
            <div className="error-view">
              <div className="error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3>Organization not found</h3>
              <p className="error-message">{orgFetchError}</p>
            </div>
          ) : orgInput && (
            <div className="generate-view">
              <div className="org-card">
                <div className="org-card-label">Generating for</div>
                <div className="org-card-name">{orgInput.orgName}</div>
                <div className="org-card-meta">
                  <span>{orgInput.sector}</span>
                  {orgInput.location && <><span className="org-card-dot">·</span><span>{orgInput.location}</span></>}
                </div>
              </div>
              <div className="mission-group">
                <label htmlFor="mission-input" className="mission-label">
                  Mission statement <span className="mission-required">required</span>
                </label>
                <textarea
                  id="mission-input"
                  className="mission-textarea"
                  rows={3}
                  placeholder="Briefly describe what your organization does and who it serves…"
                  value={mission}
                  onChange={e => setMission(e.target.value)}
                />
              </div>
              <button
                className="btn-generate"
                disabled={!mission.trim()}
                onClick={() => run({ ...orgInput, mission: mission.trim(), insightsContext })}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate Ad
              </button>
            </div>
          )
        )}

        {/* ── Processing ── */}
        {isProcessing && (
          <div className="processing-view">
            <PipelineProgress step={step} stepMessage={stepMessage} />
            <div className="reveal-stream">
              {blueprint  && <BlueprintCard blueprint={blueprint} />}
              {imageUrl   && <ImageCard imageUrl={imageUrl} imageSummary={imageSummary} />}
              {alignment  && <AlignmentCard alignment={alignment} />}
              {copyAssets && <CopyCard copyAssets={copyAssets} />}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && cloudinaryUrl && copyAssets && blueprint && imageUrl && imageSummary && alignment && (
          <AdResult
            cloudinaryUrl={cloudinaryUrl}
            imageUrl={imageUrl}
            copyAssets={copyAssets}
            blueprint={blueprint}
            imageSummary={imageSummary}
            alignment={alignment}
            onReset={reset}
          />
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="error-view">
            <div className="error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3>Pipeline Error</h3>
            <p className="error-message">{error}</p>
            <button className="btn-reset" onClick={reset}>Try Again</button>
          </div>
        )}
      </main>
    </div>
  );
}
