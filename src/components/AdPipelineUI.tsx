import { useState, useEffect, useRef } from 'react';
import { useAdPipeline, buildCloudinaryUrl } from '../hooks/useAdPipeline';
import type { AdInput, PipelineStep, AdArchetype, PostBlueprint, AlignmentResult, CopyAssets, ScrimStyle } from '../hooks/useAdPipeline';
import { supabase } from '../lib/supabaseClient';
import './AdPipelineUI.css';

// ─── Gallery Types & Storage ──────────────────────────────────────────────────

const GALLERY_KEY = 'relinkd_ad_gallery';
const GALLERY_MAX = 20;

interface SavedAd {
  id: string;
  timestamp: number;
  cloudinaryUrl: string;
  headline: string;
  body: string;
  cta: string;
  archetype: AdArchetype;
  orgName: string;
  /** Stored so we can rebuild the Cloudinary URL after text edits. */
  imageUrl?: string;
  copyAssets?: CopyAssets;
  orgContact?: string;
}

function loadGallery(): SavedAd[] {
  try { return JSON.parse(localStorage.getItem(GALLERY_KEY) ?? '[]'); }
  catch { return []; }
}

function persistGallery(ads: SavedAd[]): void {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(ads));
}

function formatTimeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function downloadAd(url: string, headline: string): Promise<void> {
  const filename = `${headline.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.jpg`;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(url, '_blank');
  }
}

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

function BlueprintCard({ blueprint, focusedInsight }: { blueprint: PostBlueprint; focusedInsight?: string | null }) {
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
      {focusedInsight && (
        <div className="blueprint-anchor-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>"{focusedInsight}"</span>
        </div>
      )}
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
  focusedInsight?: string | null;
  orgInput: AdInput;
  onReset: () => void;
}

function AdResult({ cloudinaryUrl, imageUrl, copyAssets, blueprint, imageSummary, alignment, focusedInsight, orgInput, onReset }: AdResultProps) {
  const [imgLoaded, setImgLoaded]   = useState(false);
  const [imgError, setImgError]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(cloudinaryUrl);

  // Draft text state — initialised from copyAssets
  const [draftHeadline, setDraftHeadline] = useState(copyAssets.headline);
  const [draftBody,     setDraftBody]     = useState(copyAssets.body);
  const [draftCta,      setDraftCta]      = useState(copyAssets.cta);

  // Track the copyAssets in use so the preview image matches downloads
  const [activeCopy, setActiveCopy] = useState<CopyAssets>(copyAssets);

  const archetypeMeta = ARCHETYPE_META[blueprint.archetype];

  function handleEditToggle() {
    if (!editing) {
      setDraftHeadline(activeCopy.headline);
      setDraftBody(activeCopy.body);
      setDraftCta(activeCopy.cta);
    }
    setEditing(e => !e);
  }

  function handleApply() {
    const updated: CopyAssets = {
      ...activeCopy,
      headline: draftHeadline.trim() || activeCopy.headline,
      body:     draftBody.trim()     || activeCopy.body,
      cta:      draftCta.trim()      || activeCopy.cta,
    };
    setRebuilding(true);
    setImgLoaded(false);
    setImgError(false);
    const newUrl = buildCloudinaryUrl(updated, orgInput, imageUrl);
    setActiveCopy(updated);
    setPreviewUrl(newUrl);
    setEditing(false);
    setRebuilding(false);
  }

  return (
    <div className="ad-result">
      <div className="result-header">
        <div className="result-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Post Generated
        </div>
          <div className="result-header-pills">
          <div
            className="archetype-pill"
            style={{ '--archetype-color': archetypeMeta.color } as React.CSSProperties}
          >
            <span>{archetypeMeta.icon}</span>
            {blueprint.archetype}
          </div>
          {focusedInsight && (
            <div className="anchor-insight-pill">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Targeted Insight
            </div>
          )}
          <div className="placement-pill">{SCRIM_LABELS[activeCopy.builderSpec.scrimStyle]}</div>
        </div>
      </div>

      {/* Main grid: ad preview + copy metadata */}
      <div className="result-grid">
        <div className="ad-preview-card">
          <div className="preview-label">
            Post Preview
            {previewUrl !== cloudinaryUrl && (
              <span className="preview-edited-badge">edited</span>
            )}
          </div>
          {(rebuilding || (!imgLoaded && !imgError)) && (
            <div className="img-skeleton">
              <div className="skeleton-shimmer" />
              <span>{rebuilding ? 'Rebuilding…' : 'Rendering post...'}</span>
            </div>
          )}
          {imgError ? (
            <div className="img-error">
              <p>Preview unavailable</p>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">Open URL</a>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt={activeCopy.headline}
              className={imgLoaded ? 'loaded' : 'loading'}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          )}
        </div>

        <div className="ad-meta">
          <section className="meta-section">
            <div className="meta-section-header">
              <h3>Post Copy</h3>
              <button
                className={`btn-edit-text${editing ? ' btn-edit-text--active' : ''}`}
                onClick={handleEditToggle}
              >
                {editing ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Cancel
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Text
                  </>
                )}
              </button>
            </div>

            {editing ? (
              <div className="ad-text-editor">
                <label className="edit-field">
                  <span className="edit-field-label">Headline</span>
                  <input
                    className="edit-input"
                    value={draftHeadline}
                    onChange={e => setDraftHeadline(e.target.value)}
                    placeholder="Headline (≤5 words)"
                  />
                </label>
                <label className="edit-field">
                  <span className="edit-field-label">Body</span>
                  <textarea
                    className="edit-textarea"
                    value={draftBody}
                    onChange={e => setDraftBody(e.target.value)}
                    rows={3}
                    placeholder="2–3 sentences"
                  />
                </label>
                <label className="edit-field">
                  <span className="edit-field-label">CTA</span>
                  <input
                    className="edit-input"
                    value={draftCta}
                    onChange={e => setDraftCta(e.target.value)}
                    placeholder="3–6 word call-to-action"
                  />
                </label>
                <div className="edit-actions">
                  <button className="btn-apply-edit" onClick={handleApply}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Apply &amp; Rebuild
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="copy-block">
                  <div className="copy-label">Headline</div>
                  <p className="headline-text">{activeCopy.headline}</p>
                </div>
                <div className="copy-block">
                  <div className="copy-label">Body</div>
                  <p className="body-text">{activeCopy.body}</p>
                </div>
                <div className="copy-block">
                  <div className="copy-label">CTA</div>
                  <p className="body-text">{activeCopy.cta}</p>
                </div>
              </>
            )}
            <div className="copy-block">
              <div className="copy-label">Layout</div>
              <p className="body-text">
                Style: <strong>{SCRIM_LABELS[activeCopy.builderSpec.scrimStyle]}</strong> ·
                Scrim: <strong>{activeCopy.builderSpec.scrimOpacity}%</strong> ·
                Layers: <strong>{activeCopy.builderSpec.layers.length}</strong> ·
                Colour: <code className="query-text">#{activeCopy.builderSpec.scrimColorHex}</code>
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
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="url-link">
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
          {focusedInsight && (
            <div className="insight-card insight-card--anchor">
              <div className="insight-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div className="insight-content">
                <div className="insight-label">Anchor Insight</div>
                <p className="insight-text">"{focusedInsight}"</p>
              </div>
            </div>
          )}


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

      <div className="result-actions">
        <button
          className="btn-download"
          onClick={() => downloadAd(previewUrl, activeCopy.headline)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Save Post
        </button>
        <button className="btn-reset" onClick={onReset}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
          </svg>
          Generate Another Post
        </button>
      </div>
    </div>
  );
}


// ─── Gallery Components ───────────────────────────────────────────────────────

interface EditModalProps {
  ad: SavedAd;
  onClose: () => void;
  onSave: (id: string, updates: { cloudinaryUrl: string; headline: string; body: string; cta: string }) => void;
}

function EditModal({ ad, onClose, onSave }: EditModalProps) {
  const [draftHeadline, setDraftHeadline] = useState(ad.headline);
  const [draftBody,     setDraftBody]     = useState(ad.body ?? '');
  const [draftCta,      setDraftCta]      = useState(ad.cta);
  const [previewUrl,    setPreviewUrl]    = useState(ad.cloudinaryUrl);
  const [imgLoaded,     setImgLoaded]     = useState(false);
  const [rebuilding,    setRebuilding]    = useState(false);

  const canRebuild = !!(ad.copyAssets && ad.imageUrl);

  function handleApply() {
    if (!ad.copyAssets || !ad.imageUrl) return;
    const updated: CopyAssets = {
      ...ad.copyAssets,
      headline: draftHeadline.trim() || ad.headline,
      body:     draftBody.trim()     || (ad.body ?? ''),
      cta:      draftCta.trim()      || ad.cta,
    };
    setRebuilding(true);
    setImgLoaded(false);
    const minInput: AdInput = {
      orgName:  ad.orgName,
      contact:  ad.orgContact ?? ad.orgName,
      sector:   '',
      mission:  '',
      location: '',
    };
    setPreviewUrl(buildCloudinaryUrl(updated, minInput, ad.imageUrl));
    setRebuilding(false);
  }

  function handleSave() {
    onSave(ad.id, {
      cloudinaryUrl: previewUrl,
      headline:      draftHeadline.trim() || ad.headline,
      body:          draftBody.trim()     || (ad.body ?? ''),
      cta:           draftCta.trim()      || ad.cta,
    });
    onClose();
  }

  return (
    <div className="edit-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-modal">
        <div className="edit-modal-header">
          <h3>Edit Post</h3>
          <button className="edit-modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="edit-modal-body">
          <div className="edit-modal-preview">
            {(rebuilding || !imgLoaded) && (
              <div className="img-skeleton edit-modal-skeleton">
                <div className="skeleton-shimmer" />
                <span>{rebuilding ? 'Rebuilding…' : 'Loading…'}</span>
              </div>
            )}
            <img
              src={previewUrl}
              alt={draftHeadline}
              className={`edit-modal-img${imgLoaded ? ' loaded' : ''}`}
              onLoad={() => setImgLoaded(true)}
            />
          </div>

          <div className="edit-modal-fields">
            <label className="edit-field">
              <span className="edit-field-label">Headline</span>
              <input
                className="edit-input"
                value={draftHeadline}
                onChange={e => setDraftHeadline(e.target.value)}
                placeholder="Headline (≤5 words)"
              />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">Body</span>
              <textarea
                className="edit-textarea"
                value={draftBody}
                onChange={e => setDraftBody(e.target.value)}
                rows={3}
                placeholder="2–3 sentences"
              />
            </label>
            <label className="edit-field">
              <span className="edit-field-label">CTA</span>
              <input
                className="edit-input"
                value={draftCta}
                onChange={e => setDraftCta(e.target.value)}
                placeholder="3–6 word call-to-action"
              />
            </label>

            {canRebuild && (
              <button className="btn-apply-edit" onClick={handleApply}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
                </svg>
                Preview Changes
              </button>
            )}

            <div className="edit-modal-footer-actions">
              <button className="btn-apply-edit btn-apply-edit--save" onClick={handleSave}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Save to Gallery
              </button>
              <button className="gallery-card-action-btn" onClick={() => downloadAd(previewUrl, draftHeadline || ad.headline)} title="Download">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GalleryCard({ ad, onRemove, onEdit }: { ad: SavedAd; onRemove: (id: string) => void; onEdit: (id: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const meta = ARCHETYPE_META[ad.archetype];
  return (
    <div className="gallery-card">
      <a href={ad.cloudinaryUrl} target="_blank" rel="noopener noreferrer" className="gallery-card-thumb">
        {!loaded && <div className="gallery-thumb-skeleton"><div className="skeleton-shimmer" /></div>}
        <img
          src={ad.cloudinaryUrl}
          alt={ad.headline}
          onLoad={() => setLoaded(true)}
          className={loaded ? 'loaded' : ''}
        />
        <div className="gallery-card-overlay">
          <span className="gallery-card-open-label">Open full size ↗</span>
        </div>
      </a>
      <div className="gallery-card-meta">
        <p className="gallery-card-headline">{ad.headline}</p>
        <span className="gallery-card-time">{formatTimeAgo(ad.timestamp)}</span>
        <div className="gallery-card-footer">
          <span
            className="gallery-card-archetype"
            style={{ '--archetype-color': meta.color } as React.CSSProperties}
          >
            {meta.icon} {ad.archetype}
          </span>
          <div className="gallery-card-actions">
            <button
              className="gallery-card-action-btn"
              onClick={() => onEdit(ad.id)}
              title="Edit text"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="gallery-card-action-btn"
              onClick={() => downloadAd(ad.cloudinaryUrl, ad.headline)}
              title="Save image"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              className="gallery-card-action-btn gallery-card-action-btn--remove"
              onClick={() => onRemove(ad.id)}
              title="Remove"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdGallery({
  gallery,
  onRemove,
  onUpdate,
}: {
  gallery: SavedAd[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: { cloudinaryUrl: string; headline: string; body: string; cta: string }) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingAd = editingId ? gallery.find(a => a.id === editingId) ?? null : null;

  if (gallery.length === 0) return null;
  return (
    <section className="ad-gallery">
      <div className="gallery-header">
        <span className="gallery-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Previously Created
        </span>
        <span className="gallery-count">{gallery.length} / {GALLERY_MAX}</span>
      </div>
      <div className="gallery-grid">
        {gallery.map(ad => (
          <GalleryCard
            key={ad.id}
            ad={ad}
            onRemove={onRemove}
            onEdit={id => setEditingId(id)}
          />
        ))}
      </div>
      {editingAd && (
        <EditModal
          ad={editingAd}
          onClose={() => setEditingId(null)}
          onSave={(id, updates) => { onUpdate(id, updates); setEditingId(null); }}
        />
      )}
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ARCH_STRIP = ['Architect', 'Hunter', 'Observer', 'Aligner', 'Copywriter', 'Builder'] as const;

export function AdPipelineUI({
  insightsContext,
  onInsightsConsumed,
  organizationRefreshKey = 0,
}: {
  onBack?: () => void;
  insightsContext?: string;
  /** Called once the insights-driven pipeline has been auto-started, so the
   *  parent can clear the context and prevent it re-firing on future visits. */
  onInsightsConsumed?: () => void;
  /** Bump after organization profile is saved so this view reloads org fields. */
  organizationRefreshKey?: number;
} = {}) {
  const {
    step, stepMessage,
    blueprint, imageUrl, imageSummary, alignment, copyAssets, cloudinaryUrl,
    focusedInsight, error, run,
  } = useAdPipeline();

  // ── Fetch org from Supabase ───────────────────────────────────────────────
  const [orgInput, setOrgInput] = useState<AdInput | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [orgFetchError, setOrgFetchError] = useState<string | null>(null);

  // Track which insights string we've already consumed so we never double-fire.
  const consumedInsightRef = useRef<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // ── Gallery ───────────────────────────────────────────────────────────────
  const [gallery, setGallery] = useState<SavedAd[]>(loadGallery);
  const savedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (step !== 'done' || !cloudinaryUrl || !copyAssets || !blueprint) return;
    if (savedUrlRef.current === cloudinaryUrl) return;
    savedUrlRef.current = cloudinaryUrl;
    const entry: SavedAd = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      cloudinaryUrl,
      headline: copyAssets.headline,
      body: copyAssets.body,
      cta: copyAssets.cta,
      archetype: blueprint.archetype,
      orgName: orgInput?.orgName ?? '',
      imageUrl: imageUrl ?? undefined,
      copyAssets,
      orgContact: orgInput?.contact ?? '',
    };
    setGallery(prev => {
      const updated = [entry, ...prev].slice(0, GALLERY_MAX);
      persistGallery(updated);
      return updated;
    });
  }, [step, cloudinaryUrl, copyAssets, blueprint, orgInput]);

  function handleRemove(id: string) {
    setGallery(prev => {
      const updated = prev.filter(a => a.id !== id);
      persistGallery(updated);
      return updated;
    });
  }

  function handleUpdate(id: string, updates: { cloudinaryUrl: string; headline: string; body: string; cta: string }) {
    setGallery(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      persistGallery(updated);
      return updated;
    });
  }

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
        // Stable pick when multiple rows exist; this schema has no `id` on organizations.
        .order('bn', { ascending: true })
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
        mission:  data.mission   || '',
        location: [data.city, data.province].filter(Boolean).join(', '),
        contact:  data.website || data.email || [data.city, data.province].filter(Boolean).join(', '),
      });
      setLoadingOrg(false);
    }
    fetchOrg();
  }, [organizationRefreshKey]);

  // ── Auto-start when insights context arrives ────────────────────────────
  // The ref guard ensures each unique insights string triggers exactly one run.
  // When insightsContext clears (parent called onInsightsConsumed), we reset
  // the ref so the same string can trigger again on the next click.
  useEffect(() => {
    if (!insightsContext?.trim() || !orgInput) {
      consumedInsightRef.current = null;
      return;
    }
    if (consumedInsightRef.current === insightsContext) return;

    consumedInsightRef.current = insightsContext;
    onInsightsConsumed?.();
    run({ ...orgInput, insightsContext });
  }, [insightsContext, orgInput, onInsightsConsumed, run]);

  const isProcessing = (
    step === 'blueprint' || step === 'sourcing' || step === 'observing' ||
    step === 'aligning'  || step === 'writing'  || step === 'building'
  );

  function handleRegenerate() {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (orgInput) run({ ...orgInput, insightsContext });
  }

  return (
    <div className="ad-pipeline" ref={topRef}>
      <header className="pipeline-header">
        <div className="header-badge">6-AGENT PIPELINE</div>
        <h1>Outreach Post Creator</h1>
        <p>
          A six-step agentic pipeline creates posts for your outreach campaign, using your outreach analytics and copywrite-free images from Pexels.
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
              <button
                className="btn-generate"
                onClick={() => run({ ...orgInput, insightsContext })}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate Post
              </button>
            </div>
          )
        )}

        {/* ── Processing ── */}
        {isProcessing && (
          <div className="processing-view">
            <PipelineProgress step={step} stepMessage={stepMessage} />
            <div className="reveal-stream">
              {blueprint  && <BlueprintCard blueprint={blueprint} focusedInsight={focusedInsight} />}
              {imageUrl   && <ImageCard imageUrl={imageUrl} imageSummary={imageSummary} />}
              {alignment  && <AlignmentCard alignment={alignment} />}
              {copyAssets && <CopyCard copyAssets={copyAssets} />}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && cloudinaryUrl && copyAssets && blueprint && imageUrl && imageSummary && alignment && orgInput && (
          <AdResult
            cloudinaryUrl={cloudinaryUrl}
            imageUrl={imageUrl}
            copyAssets={copyAssets}
            blueprint={blueprint}
            imageSummary={imageSummary}
            alignment={alignment}
            focusedInsight={focusedInsight}
            orgInput={orgInput}
            onReset={handleRegenerate}
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
            <button className="btn-reset" onClick={handleRegenerate}>Try Again</button>
          </div>
        )}
      </main>

      <AdGallery gallery={gallery} onRemove={handleRemove} onUpdate={handleUpdate} />
    </div>
  );
}
