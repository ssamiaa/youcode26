import { useState, useCallback } from 'react';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStep =
  | 'idle' | 'blueprint' | 'sourcing' | 'observing'
  | 'aligning' | 'writing' | 'building' | 'done' | 'error';

export type AdArchetype = 'Skill-Builder' | 'Community-Seeker' | 'Legacy-Maker';

export interface AdInput {
  orgName: string;
  sector: string;
  mission: string;
  location: string;
  contact: string;
  /** Outreach analytics insights forwarded from the Analytics tab. */
  insightsContext?: string;
}

export interface PostBlueprint {
  idea: string;
  feeling: string;
  targetAudience: string;
  archetype: AdArchetype;
  pexelsQuery: string;
}

export interface AlignmentResult {
  aligned: boolean;
  revisedIdea: string;
  alignmentNote: string;
}

// ─── Builder Spec Types ───────────────────────────────────────────────────────

/**
 * Structural overlay shape chosen by CODE (random), not by the model.
 * band-south  – horizontal band at the bottom ~35%
 * band-north  – horizontal band at the top ~35%
 * panel-left  – full-height vertical panel on the left ~43%
 * panel-right – full-height vertical panel on the right ~43%
 * full        – semi-transparent wash over the entire image
 * dual        – thin band at north AND south; photo visible in the middle
 */
export type ScrimStyle =
  | 'band-south' | 'band-north' | 'panel-left'
  | 'panel-right' | 'full' | 'dual';

/**
 * Named text positions within each layout.
 * headline – the primary message
 * cta      – call-to-action phrase
 * eyebrow  – small label / chip above the headline
 * body     – short excerpt from the body copy
 */
export type SlotName = 'headline' | 'cta' | 'eyebrow' | 'body';

/** Where the text content for a layer comes from. */
export type LayerTextSource = 'headline' | 'cta' | 'body_excerpt' | 'custom';

/**
 * Cloudinary-supported font families for text overlays.
 * Arial        – clean, versatile, modern sans-serif (default)
 * Impact       – condensed, heavy — punchy hero headlines
 * Georgia      – authoritative serif — legacy/trust campaigns
 * Verdana      – open humanist sans — friendly, community feel
 * Courier_New  – monospace — raw, stats-driven, documentary
 */
export type FontFamily = 'Arial' | 'Impact' | 'Georgia' | 'Verdana' | 'Courier_New';

/**
 * Creative styling per text layer — ONLY what the model should control.
 * Positions (gravity, x, y, font-size, width) are code-owned via LAYOUT_SLOTS.
 */
export interface LayerCreative {
  /** Which named position in the layout to fill. */
  slot: SlotName;
  textSource: LayerTextSource;
  /** Required when textSource is "custom". */
  customText?: string;
  /** Max chars when textSource is "body_excerpt". */
  maxBodyChars?: number;
  fontFamily?: FontFamily;
  bold: boolean;
  italic?: boolean;
  /** Text fill colour, 6-char hex without '#'. */
  colorHex: string;
  /** Layer opacity 50–100. */
  opacity: number;
  /**
   * Optional solid colour box drawn behind the text (badge/pill effect).
   * 6-char hex without '#'. Great for CTA buttons, eyebrow chips.
   */
  background?: string;
  /** Border-radius of the background box 0–40. Only when background is set. */
  backgroundRadius?: number;
}

export interface BuilderSpec {
  /** Set by CODE before calling the copywriter. Model must echo it unchanged. */
  scrimStyle: ScrimStyle;
  /** Scrim fill colour hex without '#'. Usually "000000". */
  scrimColorHex: string;
  /** Scrim opacity 30–80. */
  scrimOpacity: number;
  layers: LayerCreative[];
}

export interface CopyAssets {
  headline: string;
  body: string;
  cta: string;
  builderSpec: BuilderSpec;
}

export interface PipelineState {
  step: PipelineStep;
  stepMessage: string;
  blueprint: PostBlueprint | null;
  imageUrl: string | null;
  imageSummary: string | null;
  alignment: AlignmentResult | null;
  copyAssets: CopyAssets | null;
  cloudinaryUrl: string | null;
  /** The single outreach insight clause the Architect was anchored to, if any. */
  focusedInsight: string | null;
  error: string | null;
}

// ─── Layout Slot Positions (code-owned) ──────────────────────────────────────

/**
 * Fixed pixel layout for each slot within each scrim style.
 * These are never controlled by the model — they are tested, safe values.
 *
 * Coordinate conventions (Cloudinary):
 *   south/north gravity  →  y = distance from that edge to the CENTER of the overlay
 *   center/west/east     →  y = signed offset from the canvas mid-point (negative = up)
 *   west/east            →  x = distance from that edge inward to the CENTER of the overlay
 *
 * Footer occupies the bottom 100px. Anything with g_south must have y > 148 to
 * keep even a 30px single-line text clear of the footer bar.
 */
interface SlotPosition {
  size: number;
  gravity: string;
  y: number;
  x: number;
  width: number;
}

const LAYOUT_SLOTS: Record<ScrimStyle, Partial<Record<SlotName, SlotPosition>>> = {
  // ── band-south ──  Band occupies bottom 340px.
  // Slot centers measured from the south edge (positive = upward).
  // body floats above the band for a layered look.
  'band-south': {
    body:     { size: 26, gravity: 'south', y: 420, x:  0, width: 900 },
    headline: { size: 60, gravity: 'south', y: 275, x:  0, width: 900 },
    cta:      { size: 30, gravity: 'south', y: 150, x:  0, width: 400 },
  },
  // ── band-north ──  Band occupies top 340px.
  // eyebrow near the top, headline fills the band, CTA far south for contrast.
  'band-north': {
    eyebrow:  { size: 20, gravity: 'north', y:  38, x:  0, width: 880 },
    headline: { size: 58, gravity: 'north', y: 140, x:  0, width: 900 },
    cta:      { size: 30, gravity: 'south', y: 150, x:  0, width: 400 },
  },
  // ── panel-left ──  Panel occupies left 460px (full height).
  // y = signed offset from vertical center (negative = above).
  'panel-left': {
    eyebrow:  { size: 20, gravity: 'west', y: -260, x: 26, width: 390 },
    headline: { size: 52, gravity: 'west', y: -100, x: 26, width: 390 },
    body:     { size: 24, gravity: 'west', y:   40, x: 26, width: 390 },
    cta:      { size: 30, gravity: 'west', y:  150, x: 26, width: 360 },
  },
  // ── panel-right ──  Mirror of panel-left.
  'panel-right': {
    eyebrow:  { size: 20, gravity: 'east', y: -260, x: 26, width: 390 },
    headline: { size: 52, gravity: 'east', y: -100, x: 26, width: 390 },
    body:     { size: 24, gravity: 'east', y:   40, x: 26, width: 390 },
    cta:      { size: 30, gravity: 'east', y:  150, x: 26, width: 360 },
  },
  // ── full ──  Wash over entire image. All slots use center gravity.
  'full': {
    eyebrow:  { size: 20, gravity: 'center', y: -175, x: 0, width: 880 },
    headline: { size: 64, gravity: 'center', y:  -60, x: 0, width: 900 },
    cta:      { size: 30, gravity: 'center', y:   78, x: 0, width: 340 },
    body:     { size: 24, gravity: 'center', y:  155, x: 0, width: 880 },
  },
  // ── dual ──  Thin north band (200px) + normal south band (340px).
  // eyebrow in the north band; headline/cta in the south band.
  'dual': {
    eyebrow:  { size: 20, gravity: 'north', y:  78, x: 0, width: 600 },
    headline: { size: 56, gravity: 'south', y: 275, x: 0, width: 900 },
    cta:      { size: 30, gravity: 'south', y: 150, x: 0, width: 400 },
    body:     { size: 24, gravity: 'south', y: 410, x: 0, width: 900 },
  },
};

// Cycled randomly in the hook — guarantees structural variety across pipeline runs.
const SCRIM_STYLES: ScrimStyle[] = [
  'band-south', 'band-north', 'panel-left', 'panel-right', 'full', 'dual',
];

// Per-layout description injected into the copywriter prompt (slots only, no coords).
const LAYOUT_SLOT_GUIDES: Record<ScrimStyle, string> = {
  'band-south': `Dark band across the BOTTOM ~35% of the image.
  Available slots:
    "headline" — main text in the upper part of the band          (REQUIRED)
    "cta"      — call-to-action in the lower part of the band     (REQUIRED)
    "body"     — short excerpt floating above the band            (optional)`,

  'band-north': `Dark band across the TOP ~35% of the image.
  Available slots:
    "eyebrow"  — small label/chip at the very top of the band     (optional)
    "headline" — main text filling the band                       (REQUIRED)
    "cta"      — call-to-action at the BOTTOM of the image,       (REQUIRED)
                 deliberately contrasting with the north headline`,

  'panel-left': `Dark vertical panel on the LEFT ~43%; subject visible on the right.
  Available slots:
    "eyebrow"  — small label near the top of the panel            (optional)
    "headline" — main text in the upper-centre of the panel       (REQUIRED)
    "body"     — short excerpt in the centre of the panel         (optional)
    "cta"      — call-to-action in the lower area                 (REQUIRED)`,

  'panel-right': `Dark vertical panel on the RIGHT ~43%; subject visible on the left.
  Available slots:
    "eyebrow"  — small label near the top of the panel            (optional)
    "headline" — main text in the upper-centre of the panel       (REQUIRED)
    "body"     — short excerpt in the centre of the panel         (optional)
    "cta"      — call-to-action in the lower area                 (REQUIRED)`,

  'full': `Semi-transparent colour wash over the ENTIRE image.
  Available slots:
    "eyebrow"  — small sector or org label at the top             (optional)
    "headline" — dominant large text in the centre                (REQUIRED)
    "cta"      — call-to-action below the headline                (REQUIRED)
    "body"     — short excerpt below the CTA                      (optional)`,

  'dual': `Thin band at TOP AND BOTTOM; clean photo visible in the middle.
  Available slots:
    "eyebrow"  — short label in the TOP band (urgency, category)  (optional)
    "headline" — main text in the BOTTOM band                     (REQUIRED)
    "cta"      — call-to-action in the BOTTOM band, below headline (REQUIRED)`,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5';

const INITIAL_STATE: PipelineState = {
  step: 'idle', stepMessage: '', blueprint: null, imageUrl: null,
  imageSummary: null, alignment: null, copyAssets: null, cloudinaryUrl: null,
  focusedInsight: null, error: null,
};

// ─── Anthropic Client (browser-safe) ─────────────────────────────────────────

const getClient = () =>
  new Anthropic({ apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userMessage: string, maxTokens = 1024): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL, max_tokens: maxTokens, system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude.');
  return block.text;
}

async function callClaudeVision(imageUrl: string, prompt: string): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL, max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude Vision.');
  return block.text;
}

function extractJSON<T>(raw: string): T {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fencedMatch ? fencedMatch[1].trim() : raw.trim();
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object found in Claude response:\n${raw}`);
  try { return JSON.parse(jsonStr.slice(start, end + 1)) as T; }
  catch { throw new Error(`Failed to parse JSON from Claude response:\n${raw}`); }
}

/** Models sometimes emit URL-encoded commas in prose; decode so copy reads naturally. */
function decodeModelEscapesInCopy(text: string): string {
  return text
    .replace(/%252[cC]/g, ',')
    .replace(/%2[cC]/g, ',');
}

// ─── Phase 1: Architect ───────────────────────────────────────────────────────

async function runArchitect(input: AdInput, focusedInsight: string | null): Promise<PostBlueprint> {
  const system = `You are a non-profit campaign architect. Produce a creative blueprint.
Pick ONE archetype:
- Skill-Builder: audiences who want to contribute expertise and feel professionally valuable.
- Community-Seeker: motivated by belonging, local pride, collective impact.
- Legacy-Maker: driven by a desire to leave something lasting.
pexelsQuery: 3–5 words describing LITERALLY what should be in the photo. No abstractions.${focusedInsight ? `
A single outreach data point anchors this campaign. Let it determine the archetype, core idea, and target audience. Do not draw on any other information.` : ''}
RESPOND WITH VALID JSON ONLY.`;

  const user = `Blueprint for: ${input.orgName} | ${input.sector} | ${input.location}
Mission: ${input.mission}
${focusedInsight ? `\nAnchor insight (build the entire campaign around this one data point):\n"${focusedInsight}"\n` : ''}
{
  "idea": "one-sentence core concept",
  "feeling": "primary emotion (e.g. 'urgent hope', 'quiet pride')",
  "targetAudience": "1–2 sentence description",
  "archetype": "Skill-Builder | Community-Seeker | Legacy-Maker",
  "pexelsQuery": "3–5 word literal photo description"
}`;

  return extractJSON<PostBlueprint>(await callClaude(system, user));
}

// ─── Phase 2: Hunter (Pexels) ─────────────────────────────────────────────────

async function runHunter(query: string, sector: string): Promise<string> {
  const tryFetch = async (q: string): Promise<string | null> => {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=square`,
      { headers: { Authorization: import.meta.env.VITE_PEXELS_API_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.photos?.length) return null;
    const pool = data.photos as Array<{ src: { large: string } }>;
    return pool[Math.floor(Math.random() * pool.length)].src.large;
  };

  return (
    (await tryFetch(query)) ??
    (await tryFetch(`${sector} volunteers community`)) ??
    (await tryFetch('nonprofit volunteers helping people')) ??
    (() => { throw new Error(`No images found for "${query}" or any fallback.`); })()
  );
}

// ─── Phase 3: Observer (Vision) ──────────────────────────────────────────────

async function runObserver(imageUrl: string): Promise<string> {
  return callClaudeVision(
    imageUrl,
    'In 1–2 sentences: describe the main subject, setting, dominant mood/lighting, and note which side of the frame has the most open / empty space (left, right, top, or bottom).'
  );
}

// ─── Phase 4: Aligner ────────────────────────────────────────────────────────

async function runAligner(blueprint: PostBlueprint, imageSummary: string): Promise<AlignmentResult> {
  const system = `You are a creative director ensuring visual-copy alignment.
If the image contradicts the blueprint, pivot the idea to honestly use the actual image.
RESPOND WITH VALID JSON ONLY.`;

  const user = `BLUEPRINT: ${blueprint.idea} | Feeling: ${blueprint.feeling} | Archetype: ${blueprint.archetype}
IMAGE: ${imageSummary}

{"aligned":true|false,"revisedIdea":"keep original or pivot","alignmentNote":"one sentence"}`;

  return extractJSON<AlignmentResult>(await callClaude(system, user));
}

// ─── Phase 5: Copywriter ─────────────────────────────────────────────────────

async function runCopywriter(
  input: AdInput,
  blueprint: PostBlueprint,
  finalIdea: string,
  imageSummary: string,
  scrimStyle: ScrimStyle
): Promise<CopyAssets> {
  finalIdea = decodeModelEscapesInCopy(finalIdea);
  const system = `You are a non-profit copywriter AND visual art director.

─── COPY ──────────────────────────────────────────────────────────────────────
headline: MAX 5 words. Short, active, striking. No end-punctuation.
body:     2–3 sentences. Org name, one concrete detail (stat/place/outcome), implicit CTA.
cta:      3–6 words, specific action verb first (e.g. "Give two hours this Saturday").
In headline, body, cta, and customText use a LITERAL comma character — never %2C or other URL escapes.

─── LAYOUT — CHOSEN: ${scrimStyle} ────────────────────────────────────────────
${LAYOUT_SLOT_GUIDES[scrimStyle]}

The scrimStyle is FIXED — you must echo "${scrimStyle}" unchanged in your JSON.
Each layer uses one named slot from the list above.
Do NOT invent slot names outside the list.

─── CREATIVE CHOICES PER LAYER ────────────────────────────────────────────────
fontFamily (optional, default "Arial"):
  "Arial"       — clean, modern, versatile
  "Impact"      — condensed and heavy (avoid combining with bold=true)
  "Georgia"     — authoritative serif, trust and legacy
  "Verdana"     — friendly humanist sans, community-focused
  "Courier_New" — monospace, raw statistical feel

bold / italic: combine freely. Impact is already visually heavy.

colorHex: 6-char hex for the text fill.
  Dark/medium image → "ffffff"   |   Light/washed image → "1a1a2e"

background (optional): solid colour box BEHIND the text (badge / pill).
  Use for CTA buttons, eyebrow chips, stat callouts.
  Always pair with a contrasting colorHex.
  Accent examples: "f59e0b" amber, "fbbf24" gold, "dc2626" red, "16a34a" green, "2563eb" blue

backgroundRadius (optional 0–40): 0=rectangle, 8=rounded, 40=pill. Requires background.

opacity: 50–100. Primary text = 100, secondary = 72–85.

scrimColorHex: "000000" default. Brand tints: "1b4332" forest, "1a1a2e" midnight, "7f1d1d" deep red.
scrimOpacity: 30–80. Higher = busier image.

RESPOND WITH VALID JSON ONLY — no markdown, no extra fields.`;

  const user = `Write the ad for: ${input.orgName} | ${input.sector} | ${input.location}
Mission: ${input.mission}
Archetype: ${blueprint.archetype}
Core Idea: ${finalIdea}
Image: ${imageSummary}

Return exactly this shape:
{
  "headline": "≤5 words",
  "body": "2–3 sentences",
  "cta": "3–6 word action phrase",
  "builderSpec": {
    "scrimStyle": "${scrimStyle}",
    "scrimColorHex": "6-char hex",
    "scrimOpacity": <int 30–80>,
    "layers": [
      {
        "slot": "headline | cta | eyebrow | body",
        "textSource": "headline | cta | body_excerpt | custom",
        "customText": "<only when textSource=custom>",
        "maxBodyChars": <int 40–90, only when textSource=body_excerpt>,
        "fontFamily": "Arial | Impact | Georgia | Verdana | Courier_New",
        "bold": <true|false>,
        "italic": <true|false>,
        "colorHex": "6-char hex",
        "opacity": <int 50–100>,
        "background": "<optional 6-char hex>",
        "backgroundRadius": <optional int 0–40>
      }
    ]
  }
}`;

  const raw = extractJSON<CopyAssets>(await callClaude(system, user, 900));
  const headline = decodeModelEscapesInCopy(String(raw.headline ?? ''));
  const body = decodeModelEscapesInCopy(String(raw.body ?? ''));
  const cta = decodeModelEscapesInCopy(String(raw.cta ?? ''));

  // ── Validate & clamp ────────────────────────────────────────────────────────
  const spec = (raw.builderSpec ?? {}) as BuilderSpec;

  // Code-chosen scrimStyle always wins — model must not override it.
  spec.scrimStyle    = scrimStyle;
  spec.scrimColorHex = ((spec.scrimColorHex ?? '000000') as string).replace(/^#/, '').slice(0, 6) || '000000';
  spec.scrimOpacity  = Math.max(30, Math.min(80, Math.round(Number(spec.scrimOpacity) || 60)));

  const validSlots   = LAYOUT_SLOTS[scrimStyle];
  const validSources: LayerTextSource[] = ['headline', 'cta', 'body_excerpt', 'custom'];
  const validFonts:   FontFamily[]      = ['Arial', 'Impact', 'Georgia', 'Verdana', 'Courier_New'];
  const validSlotNames                  = Object.keys(validSlots) as SlotName[];

  spec.layers = Array.isArray(spec.layers) ? spec.layers : [];
  spec.layers = spec.layers
    .filter(l => l && validSlotNames.includes(l.slot as SlotName) && validSources.includes(l.textSource))
    .map(l => ({
      slot:             l.slot as SlotName,
      textSource:       l.textSource,
      customText:       l.customText != null && l.customText !== ''
        ? decodeModelEscapesInCopy(String(l.customText))
        : undefined,
      maxBodyChars:     l.maxBodyChars,
      fontFamily:       validFonts.includes(l.fontFamily as FontFamily) ? l.fontFamily : undefined,
      bold:             !!l.bold,
      italic:           !!l.italic,
      colorHex:         ((l.colorHex ?? 'ffffff') as string).replace(/^#/, '').slice(0, 6) || 'ffffff',
      opacity:          Math.max(50, Math.min(100, Math.round(Number(l.opacity) || 100))),
      background:       l.background ? (l.background as string).replace(/^#/, '').slice(0, 6) : undefined,
      backgroundRadius: l.background && l.backgroundRadius != null
        ? Math.max(0, Math.min(40, Math.round(Number(l.backgroundRadius))))
        : undefined,
    }));

  // Ensure the two required slots are always present.
  if (!spec.layers.some(l => l.slot === 'headline')) {
    spec.layers.unshift({ slot: 'headline', textSource: 'headline', bold: true, colorHex: 'ffffff', opacity: 100 });
  }
  if (!spec.layers.some(l => l.slot === 'cta')) {
    spec.layers.push({
      slot: 'cta', textSource: 'cta', bold: true,
      colorHex: '1a1a2e', opacity: 100, background: 'f59e0b', backgroundRadius: 8,
    });
  }

  return { headline, body, cta, builderSpec: spec };
}

// ─── Phase 6: Builder (Cloudinary) ───────────────────────────────────────────

function sanitizeForCloudinary(text: string): string {
  return text
    .replace(/\//g, ' ')
    .replace(/,/g, '%2C')
    .replace(/\$/g, '%24')
    .replace(/'/g, '%27')
    .replace(/!/g, '%21')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function truncateText(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '\u2026';
}

function resolveLayerText(layer: LayerCreative, assets: CopyAssets): string {
  switch (layer.textSource) {
    case 'headline':     return assets.headline;
    case 'cta':          return assets.cta;
    case 'body_excerpt': return truncateText(assets.body, layer.maxBodyChars ?? 80);
    case 'custom':       return (layer.customText ?? '').trim();
    default:             return '';
  }
}

/**
 * Draws a solid colour rectangle using Cloudinary's b_rgb background fill on a
 * single-space text layer. Both co_rgb and b_rgb are set to the same hex so the
 * result is a uniform solid block with no visible glyph.
 */
function buildRect(hex: string, w: number, h: number, gravity: string, opacity = 100): string {
  return `co_rgb:${hex},b_rgb:${hex},l_text:Arial_10:%20,w_${w},h_${h},o_${opacity},g_${gravity}`;
}

function buildScrimLayers(spec: BuilderSpec): string[] {
  const c = spec.scrimColorHex;
  const o = spec.scrimOpacity;
  switch (spec.scrimStyle) {
    case 'band-south':  return [buildRect(c, 1080, 340, 'south', o)];
    case 'band-north':  return [buildRect(c, 1080, 340, 'north', o)];
    case 'panel-left':  return [buildRect(c, 460, 1080, 'west',  o)];
    case 'panel-right': return [buildRect(c, 460, 1080, 'east',  o)];
    case 'full':        return [buildRect(c, 1080, 1080, 'center', o)];
    case 'dual': return [
      buildRect(c, 1080, 200, 'north', Math.max(25, o - 8)),
      buildRect(c, 1080, 340, 'south', o),
    ];
    default: return [buildRect(c, 1080, 340, 'south', o)];
  }
}

function buildTextLayer(layer: LayerCreative, pos: SlotPosition, assets: CopyAssets): string | null {
  const rawText = resolveLayerText(layer, assets);
  if (!rawText) return null;

  const text     = encodeURIComponent(sanitizeForCloudinary(rawText));
  const font     = layer.fontFamily ?? 'Arial';
  const styles   = [layer.bold ? 'bold' : '', layer.italic ? 'italic' : ''].filter(Boolean).join('_');
  const fontSpec = styles ? `${font}_${pos.size}_${styles}` : `${font}_${pos.size}`;
  const col      = layer.colorHex;
  const o        = layer.opacity;

  // co_rgb sets text colour; optional b_rgb adds background box; l_text renders glyph.
  let t = `co_rgb:${col}`;
  if (layer.background) {
    t += `,b_rgb:${layer.background}`;
  }
  t += `,l_text:${fontSpec}:${text},w_${pos.width},c_fit`;
  if (layer.background && layer.backgroundRadius != null) {
    t += `,r_${layer.backgroundRadius}`;
  }
  t += `,g_${pos.gravity}`;
  if (pos.x !== 0) t += `,x_${pos.x}`;
  if (pos.y !== 0) t += `,y_${pos.y}`;
  if (o < 100)     t += `,o_${o}`;
  return t;
}

/**
 * Phase 6 — Translates the Copywriter's BuilderSpec into a Cloudinary fetch-URL.
 *
 * Layer order:
 *   1. Base: 1080×1080 square crop with auto quality/format
 *   2. Creative scrim: geometry from scrimStyle, colour/opacity from model
 *   3. Text layers: POSITION from LAYOUT_SLOTS (code), STYLING from model
 *   4. Brand footer: always-present south bar — never model-controlled
 *   5. Source image URL
 */
export function buildCloudinaryUrl(
  copyAssets: CopyAssets,
  input: AdInput,
  imageUrl: string
): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const spec      = copyAssets.builderSpec;
  const slots     = LAYOUT_SLOTS[spec.scrimStyle];

  const orgName = encodeURIComponent(sanitizeForCloudinary(input.orgName));
  const contact = encodeURIComponent(sanitizeForCloudinary(input.contact));
  const img     = encodeURIComponent(imageUrl);

  const textLayers = spec.layers
    .map(layer => {
      const pos = slots[layer.slot];
      return pos ? buildTextLayer(layer, pos, copyAssets) : null;
    })
    .filter((l): l is string => l !== null);

  const layers: string[] = [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    ...buildScrimLayers(spec),
    ...textLayers,
    // Brand footer (always south, not model-controlled)
    buildRect('070708', 1080, 100, 'south'),
    `co_rgb:ffffff,l_text:Arial_2:%20,w_980,h_1,o_45,g_south,y_100`,
    `co_rgb:ffffff,l_text:Arial_28_bold:${orgName},g_south_west,x_40,y_36`,
    `co_rgb:ffffffcc,l_text:Arial_24:${contact},g_south_east,x_40,y_38`,
    img,
  ];

  return layers.join('/');
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdPipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);

  const patch = useCallback((updates: Partial<PipelineState>) =>
    setState((prev) => ({ ...prev, ...updates, error: null })), []);

  const run = useCallback(async (input: AdInput) => {
    // Randomly choose the layout structure BEFORE any AI calls.
    // This guarantees a different visual format on every run regardless of
    // what the model would otherwise default to.
    const scrimStyle = SCRIM_STYLES[Math.floor(Math.random() * SCRIM_STYLES.length)];

    // When insights are present, pick ONE random clause so the campaign has
    // a single sharp focus rather than trying to honour all data at once.
    let focusedInsight: string | null = null;
    if (input.insightsContext?.trim()) {
      const clauses = input.insightsContext
        .split(/\.\s+/)
        .map(s => s.replace(/\.$/, '').trim())
        .filter(Boolean);
      if (clauses.length > 0) {
        focusedInsight = clauses[Math.floor(Math.random() * clauses.length)];
      }
    }

    setState({ ...INITIAL_STATE, step: 'blueprint', stepMessage: 'Architecting your campaign...', focusedInsight });

    try {
      const blueprint = await runArchitect(input, focusedInsight);
      patch({ blueprint, step: 'sourcing', stepMessage: 'Sourcing imagery from Pexels...' });

      const imageUrl = await runHunter(blueprint.pexelsQuery, input.sector);
      patch({ imageUrl, step: 'observing', stepMessage: 'Analysing image with vision...' });

      const imageSummary = await runObserver(imageUrl);
      patch({ imageSummary, step: 'aligning', stepMessage: 'Aligning idea to image...' });

      // When the campaign is anchored to a single outreach insight, the idea
      // is locked — skip the Aligner so it cannot pivot away from it.
      const alignment: AlignmentResult = input.insightsContext?.trim()
        ? { aligned: true, revisedIdea: blueprint.idea, alignmentNote: 'Insights-anchored campaign — idea locked to anchor insight.' }
        : await runAligner(blueprint, imageSummary);
      patch({ alignment, step: 'writing', stepMessage: `Writing copy for ${scrimStyle} layout...` });

      // Copywriter receives the pre-chosen scrimStyle; it only makes creative decisions.
      const copyAssets = await runCopywriter(input, blueprint, alignment.revisedIdea, imageSummary, scrimStyle);
      patch({ copyAssets, step: 'building', stepMessage: 'Assembling final ad...' });

      // Builder resolves slot positions from LAYOUT_SLOTS; no model coordinates used.
      const cloudinaryUrl = buildCloudinaryUrl(copyAssets, input, imageUrl);

      setState({
        step: 'done', stepMessage: 'Ad ready!',
        blueprint, imageUrl, imageSummary, alignment, copyAssets, cloudinaryUrl,
        focusedInsight, error: null,
      });
    } catch (err) {
      setState({
        ...INITIAL_STATE, step: 'error', stepMessage: '',
        error: err instanceof Error ? err.message : 'An unknown error occurred.',
      });
    }
  }, [patch]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, run, reset };
}
