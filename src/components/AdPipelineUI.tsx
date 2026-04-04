import { useState, type FormEvent } from 'react';
import { useAdPipeline, EVALUATION_ENABLED } from '../hooks/useAdPipeline';
import type { AdInput, AdVisualStyle, PipelineStage } from '../hooks/useAdPipeline';
import './AdPipelineUI.css';

// ─── Step Definitions ────────────────────────────────────────────────────────

interface Step {
  id: PipelineStage;
  label: string;
  icon: string;
  activeMessage?: string;
}

const PIPELINE_STEPS_ALL: Step[] = [
  { id: 'strategizing', label: 'Strategy', icon: '✦', activeMessage: 'Claude is writing copy...' },
  { id: 'evaluating', label: 'Critique', icon: '◈', activeMessage: 'Evaluating quality...' },
  { id: 'hunting', label: 'Imagery', icon: '⬡', activeMessage: 'Searching Pexels...' },
  { id: 'building', label: 'Build', icon: '⬢', activeMessage: 'Composing in Cloudinary...' },
];

const PIPELINE_STEPS = EVALUATION_ENABLED
  ? PIPELINE_STEPS_ALL
  : PIPELINE_STEPS_ALL.filter((s) => s.id !== 'evaluating');

const ARCH_STRIP_LABELS = EVALUATION_ENABLED
  ? (['Input', 'Strategist', 'Evaluator', 'Hunter', 'Builder'] as const)
  : (['Input', 'Strategist', 'Hunter', 'Builder'] as const);

/** Ordinal along the pipeline for progress UI (retrying counts as strategizing). */
function getProgressOrdinal(stage: PipelineStage): number {
  if (stage === 'retrying') return 0;
  const order: PipelineStage[] = EVALUATION_ENABLED
    ? ['strategizing', 'evaluating', 'hunting', 'building', 'done']
    : ['strategizing', 'hunting', 'building', 'done'];
  const i = order.indexOf(stage);
  return i === -1 ? 0 : i;
}

// ─── Visual Style Meta ───────────────────────────────────────────────────────

const VISUAL_STYLE_META: Record<AdVisualStyle, { label: string; icon: string; accent: string }> = {
  'bottom-bar':   { label: 'Bottom Bar',   icon: '▬', accent: '#6c63ff' },
  'bold-center':  { label: 'Bold Center',  icon: '◉', accent: '#ef4444' },
  'top-headline': { label: 'Top Headline', icon: '▀', accent: '#06b6d4' },
  'side-panel':   { label: 'Side Panel',   icon: '▌', accent: '#10b981' },
  'dramatic':     { label: 'Dramatic',     icon: '◆', accent: '#9333ea' },
  'minimal':      { label: 'Minimal',      icon: '·', accent: '#f59e0b' },
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

function PipelineProgress({
  stage,
  stageMessage,
}: {
  stage: PipelineStage;
  stageMessage: string;
}) {
  const progress = getProgressOrdinal(stage);
  const stageOrder: PipelineStage[] = EVALUATION_ENABLED
    ? ['strategizing', 'evaluating', 'hunting', 'building', 'done']
    : ['strategizing', 'hunting', 'building', 'done'];

  return (
    <div className="pipeline-progress">
      <div className="pipeline-steps">
        {PIPELINE_STEPS.map((step, idx) => {
          const stepPos = stageOrder.indexOf(step.id);

          const isActive =
            (step.id === 'strategizing' && (stage === 'strategizing' || stage === 'retrying')) ||
            (step.id === 'evaluating' && stage === 'evaluating') ||
            (step.id === 'hunting' && stage === 'hunting') ||
            (step.id === 'building' && stage === 'building');

          const isDone = progress > stepPos || (step.id === 'building' && stage === 'done');

          return (
            <div
              key={step.id}
              className={[
                'pipeline-step',
                isActive ? 'active' : '',
                isDone ? 'done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="step-icon">
                {isDone ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span>{step.icon}</span>
                )}
                {isActive && <span className="pulse-ring" />}
              </div>
              <span className="step-label">{step.label}</span>
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className={`step-connector ${isDone ? 'filled' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      <p className="stage-message">
        {stage === 'retrying' ? (
          <>
            <span className="retry-badge">RETRY</span>
            {stageMessage}
          </>
        ) : (
          stageMessage
        )}
      </p>
    </div>
  );
}

function AdResult({
  result,
  onReset,
}: {
  result: NonNullable<ReturnType<typeof useAdPipeline>['result']>;
  onReset: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

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
          {result.strategy.visualStyle && (() => {
            const meta = VISUAL_STYLE_META[result.strategy.visualStyle];
            return (
              <div
                className="style-pill"
                style={{ '--style-accent': meta.accent } as React.CSSProperties}
              >
                <span className="style-icon">{meta.icon}</span>
                {meta.label}
              </div>
            );
          })()}
          <div className="score-pill">
            Score: {result.evaluation.score}/10
            {result.attempts > 1 && (
              <span className="attempts-note"> · {result.attempts} attempts</span>
            )}
          </div>
        </div>
      </div>

      <div className="result-grid">
        {/* Ad Preview */}
        <div className="ad-preview-card">
          <div className="preview-label">Cloudinary Render</div>
          {!imgLoaded && !imgError && (
            <div className="img-skeleton">
              <div className="skeleton-shimmer" />
              <span>Loading ad preview...</span>
            </div>
          )}
          {imgError ? (
            <div className="img-error">
              <p>Preview unavailable</p>
              <a href={result.cloudinaryUrl} target="_blank" rel="noopener noreferrer">
                Open Cloudinary URL
              </a>
            </div>
          ) : (
            <img
              src={result.cloudinaryUrl}
              alt={result.strategy.headline}
              className={imgLoaded ? 'loaded' : 'loading'}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          )}
        </div>

        {/* Copy & Metadata */}
        <div className="ad-meta">
          <section className="meta-section">
            <h3>Ad Copy</h3>
            <div className="copy-block">
              <div className="copy-label">Headline</div>
              <p className="headline-text">{result.strategy.headline}</p>
            </div>
            <div className="copy-block">
              <div className="copy-label">Body</div>
              <p className="body-text">{result.strategy.body}</p>
            </div>
            <div className="copy-block">
              <div className="copy-label">Pexels Query</div>
              <code className="query-text">"{result.strategy.pexels_query}"</code>
            </div>
          </section>

          <section className="meta-section">
            <h3>Evaluation</h3>
            <div className="score-bar-wrapper">
              <div className="score-bar">
                <div
                  className="score-fill"
                  style={{ width: `${(result.evaluation.score / 10) * 100}%` }}
                />
              </div>
              <span className="score-num">{result.evaluation.score}/10</span>
            </div>
            <p className="feedback-text">{result.evaluation.feedback}</p>
          </section>

          <section className="meta-section urls-section">
            <h3>URLs</h3>
            <a
              href={result.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="url-link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Source Image (Pexels)
            </a>
            <a
              href={result.cloudinaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="url-link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              Cloudinary Transform URL
            </a>
          </section>
        </div>
      </div>

      {/* Strategy Insights — full-width row below the grid */}
      <div className="strategy-insights">
        <div className="insights-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Strategy Rationale
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
              <div className="insight-label">Audience Persona</div>
              <p className="insight-text">{result.strategy.persona}</p>
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
              <div className="insight-label">Copy Framework</div>
              <p className="insight-text">{result.strategy.copyFramework}</p>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="insight-content">
              <div className="insight-label">Tone & Voice</div>
              <p className="insight-text">{result.strategy.tone}</p>
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
              <div className="insight-label">Visual Style</div>
              <p className="insight-text">
                {result.strategy.visualStyle && (
                  <strong style={{ color: VISUAL_STYLE_META[result.strategy.visualStyle]?.accent }}>
                    {VISUAL_STYLE_META[result.strategy.visualStyle]?.label}
                  </strong>
                )}
                {result.strategy.visualStyleRationale && (
                  <> — {result.strategy.visualStyleRationale}</>
                )}
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

// ─── Input Form ───────────────────────────────────────────────────────────────

const SECTORS = [
  'Animal Welfare',
  'Arts & Culture',
  'Children & Youth',
  'Community Development',
  'Disability Services',
  'Education',
  'Environmental',
  'Food Security',
  'Health & Medical',
  'Homeless Services',
  'Human Rights',
  'Mental Health',
  'Seniors',
  'Veterans',
  'Women & Families',
  'Other',
];

function InputForm({ onSubmit }: { onSubmit: (input: AdInput) => void }) {
  const [form, setForm] = useState<AdInput>({
    orgName: '',
    sector: '',
    mission: '',
    location: '',
    contact: '',
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.orgName && form.sector && form.mission && form.location && form.contact) {
      onSubmit(form);
    }
  };

  const set = (field: keyof AdInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="orgName">Organization Name</label>
          <input
            id="orgName"
            type="text"
            placeholder="e.g. Vancouver Food Bank"
            value={form.orgName}
            onChange={set('orgName')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="sector">Sector</label>
          <select id="sector" value={form.sector} onChange={set('sector')} required>
            <option value="" disabled>
              Select a sector...
            </option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group full-width">
          <label htmlFor="mission">Mission Statement</label>
          <textarea
            id="mission"
            placeholder="e.g. To eliminate hunger in Metro Vancouver by redistributing surplus food to families in need."
            value={form.mission}
            onChange={set('mission')}
            rows={3}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            type="text"
            placeholder="e.g. Vancouver, BC"
            value={form.location}
            onChange={set('location')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="contact">Contact (email, website, or phone)</label>
          <input
            id="contact"
            type="text"
            placeholder="e.g. www.foodbank.bc.ca"
            value={form.contact}
            onChange={set('contact')}
            required
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn-generate"
        disabled={!form.orgName || !form.sector || !form.mission || !form.location || !form.contact}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Generate Ad
      </button>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdPipelineUI() {
  const { stage, stageMessage, result, error, run, reset } = useAdPipeline();

  const isProcessing = ['strategizing', 'evaluating', 'retrying', 'hunting', 'building'].includes(
    stage
  );

  return (
    <div className="ad-pipeline">
      {/* Header */}
      <header className="pipeline-header">
        <div className="header-badge">AI-POWERED</div>
        <h1>Non-Profit Ad Pipeline</h1>
        <p>
          Claude drafts your ad copy
          {EVALUATION_ENABLED ? ', critiques and refines it,' : ''} then Pexels supplies imagery and Cloudinary
          composes the final creative.
        </p>
      </header>

      {/* Architecture strip */}
      <div className="arch-strip">
        {ARCH_STRIP_LABELS.map((step, i, arr) => (
          <div key={step} className="arch-item">
            <span className="arch-step">{step}</span>
            {i < arr.length - 1 && <span className="arch-arrow">→</span>}
          </div>
        ))}
      </div>

      {/* Body */}
      <main className="pipeline-body">
        {stage === 'idle' && <InputForm onSubmit={run} />}

        {isProcessing && (
          <div className="processing-view">
            <PipelineProgress stage={stage} stageMessage={stageMessage} />
          </div>
        )}

        {stage === 'done' && result && (
          <AdResult result={result} onReset={reset} />
        )}

        {stage === 'error' && (
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
            <button className="btn-reset" onClick={reset}>
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
