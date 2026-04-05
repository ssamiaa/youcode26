import { useState, useCallback } from 'react';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStep =
  | 'idle'
  | 'blueprint'
  | 'sourcing'
  | 'observing'
  | 'aligning'
  | 'writing'
  | 'building'
  | 'done'
  | 'error';

export type AdArchetype = 'Skill-Builder' | 'Community-Seeker' | 'Legacy-Maker';

export interface AdInput {
  orgName: string;
  sector: string;
  mission: string;
  location: string;
  contact: string;
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

// ─── Builder Spec Types (Phase 5 output → Phase 6 input) ─────────────────────

/**
 * Structural overlay shape.
 * band-south  – black/tinted horizontal band anchored to the bottom (~35% height)
 * band-north  – band anchored to the top
 * panel-left  – vertical panel on the left ~43% of width (full height)
 * panel-right – vertical panel on the right
 * full        – semi-transparent colour wash over the entire image
 * dual        – thinner band at both north AND south; photo is visible in the middle
 */
export type ScrimStyle =
  | 'band-south'
  | 'band-north'
  | 'panel-left'
  | 'panel-right'
  | 'full'
  | 'dual';

/**
 * Where a text layer's content comes from.
 * headline      – use copyAssets.headline verbatim
 * cta           – use copyAssets.cta verbatim
 * body_excerpt  – first N chars of copyAssets.body (N = maxBodyChars, default 80)
 * custom        – use customText field verbatim (for eyebrows, taglines, etc.)
 */
export type LayerTextSource = 'headline' | 'cta' | 'body_excerpt' | 'custom';

/**
 * Cloudinary-supported font families for text overlays.
 * Arial        – clean, versatile, modern sans-serif (default)
 * Impact       – condensed, heavy — great for punchy headlines
 * Georgia      – authoritative serif — legacy/trust messaging
 * Verdana      – open humanist sans — friendly, highly legible
 * Courier_New  – monospace — documentary, stats-driven, raw authenticity
 */
export type FontFamily = 'Arial' | 'Impact' | 'Georgia' | 'Verdana' | 'Courier_New';

export interface BuilderLayer {
  /** What text to render. */
  textSource: LayerTextSource;
  /** Required when textSource is "custom". */
  customText?: string;
  /** Max chars when textSource is "body_excerpt". Default 80. */
  maxBodyChars?: number;
  /**
   * Font family. Default "Arial".
   * Arial | Impact | Georgia | Verdana | Courier_New
   */
  fontFamily?: FontFamily;
  /** Font size in pixels (16–80). */
  size: number;
  bold: boolean;
  /** Italic style. Combine with bold for bold-italic. */
  italic?: boolean;
  /**
   * Cloudinary gravity string.
   * Bands: "south" or "north".  Center overlay: "center".
   * Side panels: "west" (left) or "east" (right).
   * Corners: "south_west", "south_east", "north_west", "north_east".
   */
  gravity: string;
  /**
   * Vertical pixel offset.
   * south/north: positive = distance inward from that edge.
   * center/west/east: negative = above the gravity mid-point, positive = below.
   */
  y: number;
  /**
   * Horizontal pixel offset.
   * west: positive = distance from the left edge (rightward).
   * east: positive = distance from the right edge (toward center).
   * south/north/center: 0 = horizontally centered.
   */
  x: number;
  /** Max word-wrap width in pixels (200–960). */
  width: number;
  /** Text fill colour, 6-char hex without '#'. e.g. "ffffff", "f59e0b". */
  colorHex: string;
  /** Layer opacity 50–100. Primary text = 100, secondary = 75–85. */
  opacity: number;
  /**
   * Optional solid background box drawn behind this text layer.
   * 6-char hex without '#'. Great for CTA badges, eyebrow labels, stat callouts.
   * e.g. "f59e0b" (amber pill), "ffffff" (white card on dark image).
   */
  background?: string;
  /**
   * Border-radius of the background box (0–40 px). Only applies when background is set.
   * 0 = sharp rectangle, 8 = slightly rounded, 40 = pill shape.
   */
  backgroundRadius?: number;
}

export interface BuilderSpec {
  scrimStyle: ScrimStyle;
  /**
   * Scrim fill colour, 6-char hex without '#'.
   * Usually "000000". Brand tints e.g. "1b4332", "1a1a2e" give a distinct feel.
   */
  scrimColorHex: string;
  /** Scrim opacity 25–80. */
  scrimOpacity: number;
  /**
   * Text overlay layers in render order (bottom → top).
   * 2–4 layers. First layer renders beneath later layers.
   */
  layers: BuilderLayer[];
}

export interface CopyAssets {
  headline: string;
  body: string;
  cta: string;
  /** Full layout spec used by the Builder to construct the Cloudinary URL. */
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
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5';

const INITIAL_STATE: PipelineState = {
  step: 'idle',
  stepMessage: '',
  blueprint: null,
  imageUrl: null,
  imageSummary: null,
  alignment: null,
  copyAssets: null,
  cloudinaryUrl: null,
  error: null,
};

// ─── Anthropic Client (browser-safe) ─────────────────────────────────────────

const getClient = () =>
  new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1400,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude.');
  return block.text;
}

async function callClaudeVision(imageUrl: string, prompt: string): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: prompt },
        ],
      },
    ],
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
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in Claude response:\n${raw}`);
  }
  try {
    return JSON.parse(jsonStr.slice(start, end + 1)) as T;
  } catch {
    throw new Error(`Failed to parse JSON from Claude response:\n${raw}`);
  }
}

// ─── Phase 1: The Architect ───────────────────────────────────────────────────

async function runArchitect(input: AdInput): Promise<PostBlueprint> {
  const system = `You are an expert non-profit campaign architect. Your job is to produce a "Post Blueprint" — the creative DNA of an ad before any copy is written.

You MUST pick ONE of three target archetypes based on the org's mission and sector:
- Skill-Builder: Audiences who want to contribute expertise and feel professionally valuable.
- Community-Seeker: Audiences motivated by belonging, local pride, and collective impact.
- Legacy-Maker: Audiences driven by a desire to leave something lasting for future generations.

Your pexelsQuery must be 3–5 words describing what is LITERALLY in the ideal photo (subject + action + setting).
No abstract nouns. Good: "elderly woman receiving meal delivery"  Bad: "community support kindness".

RESPOND WITH VALID JSON ONLY — no markdown, no explanation.`;

  const user = `Create a Post Blueprint for this non-profit.

Organization: ${input.orgName}
Sector: ${input.sector}
Mission: ${input.mission}
Location: ${input.location}

Return this exact JSON:
{
  "idea": "The single core concept this ad communicates — one sentence",
  "feeling": "The primary emotion you want the viewer to feel (e.g. 'urgent hope', 'quiet pride', 'inspired action')",
  "targetAudience": "1–2 sentence description of who this ad specifically targets",
  "archetype": "Skill-Builder | Community-Seeker | Legacy-Maker",
  "pexelsQuery": "3–5 word literal photo description"
}`;

  return extractJSON<PostBlueprint>(await callClaude(system, user));
}

// ─── Phase 2: The Hunter (Pexels) ─────────────────────────────────────────────

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

// ─── Phase 3: The Observer (Vision) ──────────────────────────────────────────

async function runObserver(imageUrl: string): Promise<string> {
  return callClaudeVision(
    imageUrl,
    'In 1–2 sentences: describe the main subject, setting, dominant mood/lighting, and note which side of the frame has the most open / empty space (left, right, top, or bottom).'
  );
}

// ─── Phase 4: The Aligner ────────────────────────────────────────────────────

async function runAligner(
  blueprint: PostBlueprint,
  imageSummary: string
): Promise<AlignmentResult> {
  const system = `You are a creative director who ensures visual-copy alignment.
If the image contradicts the blueprint's emotional register or subject matter, pivot the idea to authentically use the actual image rather than discarding it.
RESPOND WITH VALID JSON ONLY.`;

  const user = `Compare this ad blueprint against the image that was actually retrieved.

BLUEPRINT:
Idea: ${blueprint.idea}
Feeling: ${blueprint.feeling}
Target Audience: ${blueprint.targetAudience}
Archetype: ${blueprint.archetype}

IMAGE (observed): ${imageSummary}

If the image broadly supports the blueprint, set aligned:true and keep the original idea in revisedIdea.
If the image contradicts the blueprint (wrong subject, wrong mood), set aligned:false and write a new idea that honestly uses the actual image.

Return this exact JSON:
{
  "aligned": true | false,
  "revisedIdea": "The idea to use going forward — original if aligned, pivoted if not",
  "alignmentNote": "One sentence explaining your decision"
}`;

  return extractJSON<AlignmentResult>(await callClaude(system, user));
}

// ─── Phase 5: The Copywriter ─────────────────────────────────────────────────

async function runCopywriter(
  input: AdInput,
  blueprint: PostBlueprint,
  finalIdea: string,
  imageSummary: string
): Promise<CopyAssets> {
  const system = `You are a non-profit copywriter AND visual layout designer. You write the ad copy AND specify exactly how it should be rendered on the image by Phase 6 (the Cloudinary Builder).

─── COPY RULES ────────────────────────────────────────────────────────────────
- headline: 5–10 words. Lead with a question, striking image detail, number, or the org name. No end-punctuation.
- body: 2–3 sentences. Name the org, include one concrete detail (stat, place, outcome), and end with an implicit call-to-action.
- cta: 3–6 words, action verb first. Be specific — not "Donate now" but "Give two hours this Saturday".

─── BUILDER SPEC RULES ────────────────────────────────────────────────────────
You must output a builderSpec that controls how Phase 6 assembles the Cloudinary image.

SCRIM STYLES — choose based on the image's open space and the emotional register:
  "band-south"  → solid/tinted horizontal band at the bottom ~35% of the image.
                  Best when the top of the photo has visual interest and the bottom is calmer.
                  Text layers use gravity "south", y = distance inward from the bottom edge.
  "band-north"  → band at the top ~35%.
                  Best for sky, bright ceilings, or when subjects are low in the frame.
                  Text layers use gravity "north", y = distance inward from the top edge.
  "panel-left"  → vertical panel on the LEFT ~43% of width (full height).
                  Best when subjects or action is on the RIGHT side of the photo.
                  Text layers use gravity "west", x = distance from the left edge, y = offset from vertical center (negative = above, positive = below).
  "panel-right" → vertical panel on the RIGHT. Mirror of panel-left.
                  Text layers use gravity "east", x = distance from the right edge, y = offset from vertical center.
  "full"        → semi-transparent wash over the whole image.
                  Best for very busy/detailed images. Text layers use gravity "center",
                  y negative = above center, y positive = below center.
  "dual"        → thin band at both north AND south; the photo shows through in the middle.
                  Use for an editorial split: eyebrow at north, headline+cta at south.

LAYER TEXT SOURCES — never duplicate copy; reference it by role:
  "headline"     → copies the headline field verbatim
  "cta"          → copies the cta field verbatim
  "body_excerpt" → first N chars of body (set maxBodyChars; max 90)
  "custom"       → write any short string in customText (for eyebrows, labels, taglines)

─── TYPOGRAPHY & EFFECTS ──────────────────────────────────────────────────────
fontFamily (optional, default "Arial"):
  "Arial"        – clean, versatile sans-serif. Safe for most layouts.
  "Impact"       – condensed, heavy weight. Powerful for short hero headlines.
  "Georgia"      – classic serif. Trust, authority, legacy campaigns.
  "Verdana"      – open humanist sans. Approachable, community-focused ads.
  "Courier_New"  – monospace. Raw, documentary, stat-driven messaging.

bold / italic: combine freely. Impact is already visually heavy; avoid bold+Impact.

size: 16–80 px. Guidelines:
  eyebrow / label  → 16–22
  body excerpt     → 22–28
  CTA              → 26–34
  headline         → 38–68
  hero/single-word → up to 80

background (optional hex): draws a solid colour box BEHIND this layer's text.
  Use for CTA badge/pills, eyebrow chips, stat callouts.
  Pair with a contrasting colorHex for the text inside.
  e.g. background "f59e0b" + colorHex "1a1a2e" = amber pill with dark text.
  e.g. background "ffffff" + colorHex "000000" = white card.

backgroundRadius (optional int 0–40): rounded corners of the background box.
  0 = sharp rectangle, 6–10 = subtle rounding, 40 = pill.
  Only applies when background is set.

─── LAYER POSITIONING EXAMPLES ────────────────────────────────────────────────

  band-south (2 layers, Impact headline + amber CTA badge):
    { "textSource":"headline", "fontFamily":"Impact", "size":60, "bold":false, "gravity":"south", "y":210, "x":0, "width":920, "colorHex":"ffffff", "opacity":100 }
    { "textSource":"cta", "size":28, "bold":true, "gravity":"south", "y":118, "x":0, "width":360, "colorHex":"1a1a2e", "opacity":100, "background":"f59e0b", "backgroundRadius":8 }

  band-north (3 layers — eyebrow chip + Georgia headline at top, CTA badge at bottom):
    { "textSource":"custom", "customText":"VOLUNTEER OPPORTUNITY", "size":18, "bold":false, "gravity":"north", "y":44, "x":0, "width":880, "colorHex":"000000", "opacity":100, "background":"fbbf24", "backgroundRadius":4 }
    { "textSource":"headline", "fontFamily":"Georgia", "size":48, "bold":true, "italic":true, "gravity":"north", "y":82, "x":0, "width":920, "colorHex":"ffffff", "opacity":100 }
    { "textSource":"cta", "size":28, "bold":true, "gravity":"south", "y":108, "x":0, "width":920, "colorHex":"ffffff", "opacity":85 }

  panel-left (3 layers inside the left column):
    { "textSource":"custom", "customText":"FOOD SECURITY", "size":18, "bold":false, "gravity":"west", "y":-240, "x":28, "width":400, "colorHex":"000000", "opacity":100, "background":"ffffff", "backgroundRadius":4 }
    { "textSource":"headline", "fontFamily":"Verdana", "size":40, "bold":true, "gravity":"west", "y":-140, "x":28, "width":404, "colorHex":"ffffff", "opacity":100 }
    { "textSource":"cta", "size":26, "bold":true, "gravity":"west", "y":100, "x":28, "width":400, "colorHex":"1a1a2e", "opacity":100, "background":"ffffff", "backgroundRadius":6 }

  panel-right (3 layers):
    { "textSource":"headline", "fontFamily":"Georgia", "size":42, "bold":true, "gravity":"east", "y":-150, "x":28, "width":404, "colorHex":"ffffff", "opacity":100 }
    { "textSource":"body_excerpt", "maxBodyChars":60, "fontFamily":"Georgia", "size":22, "bold":false, "italic":true, "gravity":"east", "y":-28, "x":28, "width":400, "colorHex":"ffffff", "opacity":80 }
    { "textSource":"cta", "size":26, "bold":true, "gravity":"east", "y":100, "x":28, "width":320, "colorHex":"000000", "opacity":100, "background":"f59e0b", "backgroundRadius":8 }

  full overlay:
    { "textSource":"custom", "customText":"MENTAL HEALTH NONPROFIT", "size":17, "bold":false, "fontFamily":"Courier_New", "gravity":"center", "y":-130, "x":0, "width":880, "colorHex":"ffffff", "opacity":65 }
    { "textSource":"headline", "fontFamily":"Impact", "size":64, "bold":false, "gravity":"center", "y":-40, "x":0, "width":920, "colorHex":"ffffff", "opacity":100 }
    { "textSource":"cta", "size":28, "bold":true, "gravity":"center", "y":58, "x":0, "width":320, "colorHex":"ffffff", "opacity":100, "background":"dc2626", "backgroundRadius":40 }

  dual (eyebrow chip at top, headline + CTA badge at bottom):
    { "textSource":"custom", "customText":"JOIN US THIS WEEKEND", "size":20, "bold":false, "gravity":"north", "y":82, "x":0, "width":600, "colorHex":"000000", "opacity":100, "background":"ffffff", "backgroundRadius":4 }
    { "textSource":"headline", "fontFamily":"Georgia", "size":50, "bold":true, "gravity":"south", "y":200, "x":0, "width":920, "colorHex":"ffffff", "opacity":100 }
    { "textSource":"cta", "size":26, "bold":true, "gravity":"south", "y":112, "x":0, "width":300, "colorHex":"1a1a2e", "opacity":100, "background":"fbbf24", "backgroundRadius":40 }

COLOR GUIDANCE:
- For dark or medium images: colorHex "ffffff" (white text)
- For light/washed images: colorHex "1a1a2e" (near-black text)
- scrimColorHex is usually "000000"; tint it for brand effect e.g. "1b4332" (forest), "1a1a2e" (midnight)
- CTA badge accent colours: "f59e0b" amber, "fbbf24" gold, "16a34a" green, "dc2626" red, "2563eb" blue

RESPOND WITH VALID JSON ONLY — no markdown, no extra keys.`;

  const user = `Write ad copy and a complete builderSpec for this non-profit.

Organization: ${input.orgName}
Sector: ${input.sector}
Mission: ${input.mission}
Location: ${input.location}
Archetype: ${blueprint.archetype}
Core Idea: ${finalIdea}
Image: ${imageSummary}

Return this exact JSON shape:
{
  "headline": "5–10 words",
  "body": "2–3 sentence paragraph",
  "cta": "3–6 word action phrase",
  "builderSpec": {
    "scrimStyle": "band-south | band-north | panel-left | panel-right | full | dual",
    "scrimColorHex": "6-char hex without #",
    "scrimOpacity": <int 25–80>,
    "layers": [
      {
        "textSource": "headline | cta | body_excerpt | custom",
        "customText": "<only when textSource=custom>",
        "maxBodyChars": <int, only when textSource=body_excerpt>,
        "fontFamily": "Arial | Impact | Georgia | Verdana | Courier_New",
        "size": <int 16–80>,
        "bold": <true|false>,
        "italic": <true|false, optional>,
        "gravity": "<cloudinary gravity string>",
        "y": <int>,
        "x": <int>,
        "width": <int 200–960>,
        "colorHex": "6-char hex without #",
        "opacity": <int 50–100>,
        "background": "<6-char hex without #, optional — draws a box behind the text>",
        "backgroundRadius": <int 0–40, optional — rounded corners of the background box>
      }
    ]
  }
}`;

  const raw = extractJSON<CopyAssets & { builderSpec: BuilderSpec }>(await callClaude(system, user));

  // Validate and clamp
  const validStyles: ScrimStyle[] = ['band-south', 'band-north', 'panel-left', 'panel-right', 'full', 'dual'];
  const spec = raw.builderSpec ?? {} as BuilderSpec;
  if (!validStyles.includes(spec.scrimStyle)) spec.scrimStyle = 'band-south';
  spec.scrimColorHex = (spec.scrimColorHex ?? '000000').replace(/^#/, '').slice(0, 6) || '000000';
  spec.scrimOpacity = Math.max(25, Math.min(80, Math.round(spec.scrimOpacity ?? 60)));
  spec.layers = Array.isArray(spec.layers) ? spec.layers : [];

  const validSources: LayerTextSource[] = ['headline', 'cta', 'body_excerpt', 'custom'];
  const validFonts: FontFamily[] = ['Arial', 'Impact', 'Georgia', 'Verdana', 'Courier_New'];
  spec.layers = spec.layers
    .filter(l => l && validSources.includes(l.textSource))
    .map(l => ({
      ...l,
      fontFamily:       validFonts.includes(l.fontFamily as FontFamily) ? l.fontFamily : undefined,
      size:             Math.max(16, Math.min(80, Math.round(l.size ?? 36))),
      bold:             !!l.bold,
      italic:           !!l.italic,
      gravity:          l.gravity || 'south',
      y:                Math.round(l.y ?? 0),
      x:                Math.round(l.x ?? 0),
      width:            Math.max(200, Math.min(960, Math.round(l.width ?? 900))),
      colorHex:         (l.colorHex ?? 'ffffff').replace(/^#/, '').slice(0, 6) || 'ffffff',
      opacity:          Math.max(50, Math.min(100, Math.round(l.opacity ?? 100))),
      background:       l.background ? l.background.replace(/^#/, '').slice(0, 6) : undefined,
      backgroundRadius: l.background && l.backgroundRadius != null
        ? Math.max(0, Math.min(40, Math.round(l.backgroundRadius)))
        : undefined,
    }));

  if (spec.layers.length === 0) {
    spec.layers = [
      { textSource: 'headline', size: 52, bold: true,  gravity: 'south', y: 195, x: 0, width: 920, colorHex: 'ffffff', opacity: 100 },
      { textSource: 'cta',      size: 30, bold: true,  gravity: 'south', y: 110, x: 0, width: 920, colorHex: 'ffffff', opacity: 80  },
    ];
  }

  return { headline: raw.headline, body: raw.body, cta: raw.cta, builderSpec: spec };
}

// ─── Phase 6: The Builder (Cloudinary) ───────────────────────────────────────

function sanitizeForCloudinary(text: string): string {
  return text
    .replace(/\//g, ' ')
    .replace(/,/g, '%252C')
    .replace(/\$/g, '%2524');
}

function truncateText(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function resolveLayerText(layer: BuilderLayer, assets: CopyAssets): string {
  switch (layer.textSource) {
    case 'headline':     return assets.headline;
    case 'cta':          return assets.cta;
    case 'body_excerpt': return truncateText(assets.body, layer.maxBodyChars ?? 80);
    case 'custom':       return (layer.customText ?? '').trim();
    default:             return '';
  }
}

function buildScrimLayers(spec: BuilderSpec): string[] {
  const c = spec.scrimColorHex;
  const o = spec.scrimOpacity;
  switch (spec.scrimStyle) {
    case 'band-south':  return [`co_rgb:${c},l_text:Arial_10:%20,w_1080,h_340,o_${o},g_south`];
    case 'band-north':  return [`co_rgb:${c},l_text:Arial_10:%20,w_1080,h_340,o_${o},g_north`];
    case 'panel-left':  return [`co_rgb:${c},l_text:Arial_10:%20,w_460,h_1080,o_${o},g_west`];
    case 'panel-right': return [`co_rgb:${c},l_text:Arial_10:%20,w_460,h_1080,o_${o},g_east`];
    case 'full':        return [`co_rgb:${c},l_text:Arial_10:%20,w_1080,h_1080,o_${o},g_center`];
    case 'dual': return [
      `co_rgb:${c},l_text:Arial_10:%20,w_1080,h_200,o_${Math.max(25, o - 8)},g_north`,
      `co_rgb:${c},l_text:Arial_10:%20,w_1080,h_340,o_${o},g_south`,
    ];
    default: return [`co_rgb:${c},l_text:Arial_10:%20,w_1080,h_340,o_${o},g_south`];
  }
}

function buildTextLayer(layer: BuilderLayer, assets: CopyAssets): string | null {
  const rawText = resolveLayerText(layer, assets);
  if (!rawText) return null;

  const text = encodeURIComponent(sanitizeForCloudinary(rawText));
  const font = layer.fontFamily ?? 'Arial';
  const size = layer.size;
  const styles = [layer.bold ? 'bold' : '', layer.italic ? 'italic' : ''].filter(Boolean).join('_');
  const fontSpec = styles ? `${font}_${size}_${styles}` : `${font}_${size}`;
  const col = layer.colorHex;
  const o = layer.opacity;
  const w = layer.width;
  const g = layer.gravity;
  const y = layer.y;
  const x = layer.x;

  // Background box: b_rgb must precede l_text in the same transform segment
  let t = `co_rgb:${col}`;
  if (layer.background) {
    const bg = layer.background.replace(/^#/, '').slice(0, 6);
    t += `,b_rgb:${bg}`;
  }
  t += `,l_text:${fontSpec}:${text},w_${w},c_fit`;
  if (layer.background && layer.backgroundRadius != null) {
    t += `,r_${Math.max(0, Math.min(40, Math.round(layer.backgroundRadius)))}`;
  }
  t += `,g_${g}`;
  if (x !== 0) t += `,x_${x}`;
  if (y !== 0) t += `,y_${y}`;
  if (o < 100) t += `,o_${o}`;
  return t;
}

/**
 * Returns a single Cloudinary transformation segment that renders a solid-colour
 * rectangle at the given position. Uses Cloudinary's b_rgb background fill on a
 * text layer (space character) — a single segment, so there is no multi-step layer
 * context that could mis-sequence with the following text layers.
 */
function buildPixelRect(
  colorHex: string,
  width: number,
  height: number,
  gravity: string,
  opacity = 100
): string[] {
  // b_rgb fills the bounding box background; co_rgb colours the (invisible) space glyph.
  // Both set to the same hex so the rectangle is a solid uniform colour.
  return [`b_rgb:${colorHex},co_rgb:${colorHex},l_text:Arial_10:%20,w_${width},h_${height},o_${opacity},g_${gravity}`];
}

/**
 * Converts a Copywriter-supplied BuilderSpec into a Cloudinary fetch-URL transformation chain.
 *
 * Layers in order:
 *   1. Base: 1080×1080 square crop
 *   2. Creative scrim(s): driven by builderSpec.scrimStyle
 *   3. Text layers: driven by builderSpec.layers (typography, gravity, offset)
 *   4. Brand footer: opaque dark south bar + org name + contact (not copywriter-controlled)
 *   5. Source image URL
 */
export function buildCloudinaryUrl(
  copyAssets: CopyAssets,
  input: AdInput,
  imageUrl: string
): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const spec = copyAssets.builderSpec;

  const o = encodeURIComponent(sanitizeForCloudinary(input.orgName));
  const c = encodeURIComponent(sanitizeForCloudinary(input.contact));
  const img = encodeURIComponent(imageUrl);

  const textLayers = spec.layers
    .map(l => buildTextLayer(l, copyAssets))
    .filter((l): l is string => l !== null);

  const layers: string[] = [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    ...buildScrimLayers(spec),
    ...textLayers,
    // Brand footer — 1×1 pixel scaled to full-width dark bar (not copywriter-controlled)
    ...buildPixelRect('070708', 1080, 100, 'south'),
    `co_rgb:ffffff,l_text:Arial_2:%20,w_980,h_1,o_45,g_south,y_100`,
    `co_rgb:ffffff,l_text:Arial_28_bold:${o},g_south_west,x_40,y_36`,
    `co_rgb:ffffffcc,l_text:Arial_24:${c},g_south_east,x_40,y_38`,
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
    setState({ ...INITIAL_STATE, step: 'blueprint', stepMessage: 'Architecting your campaign...' });

    try {
      // Phase 1 — Architect
      const blueprint = await runArchitect(input);
      patch({ blueprint, step: 'sourcing', stepMessage: 'Sourcing imagery from Pexels...' });

      // Phase 2 — Hunter
      const imageUrl = await runHunter(blueprint.pexelsQuery, input.sector);
      patch({ imageUrl, step: 'observing', stepMessage: 'Analysing image with vision...' });

      // Phase 3 — Observer
      const imageSummary = await runObserver(imageUrl);
      patch({ imageSummary, step: 'aligning', stepMessage: 'Aligning idea to image...' });

      // Phase 4 — Aligner
      const alignment = await runAligner(blueprint, imageSummary);
      patch({ alignment, step: 'writing', stepMessage: 'Writing copy and layout spec...' });

      // Phase 5 — Copywriter (outputs copy + builderSpec)
      const copyAssets = await runCopywriter(input, blueprint, alignment.revisedIdea, imageSummary);
      patch({ copyAssets, step: 'building', stepMessage: 'Assembling final ad...' });

      // Phase 6 — Builder (translates builderSpec → Cloudinary URL)
      const cloudinaryUrl = buildCloudinaryUrl(copyAssets, input, imageUrl);

      setState({
        step: 'done',
        stepMessage: 'Ad ready!',
        blueprint,
        imageUrl,
        imageSummary,
        alignment,
        copyAssets,
        cloudinaryUrl,
        error: null,
      });
    } catch (err) {
      setState({
        ...INITIAL_STATE,
        step: 'error',
        stepMessage: '',
        error: err instanceof Error ? err.message : 'An unknown error occurred.',
      });
    }
  }, [patch]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { ...state, run, reset };
}
