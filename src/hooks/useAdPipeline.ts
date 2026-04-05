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

export interface CopyAssets {
  headline: string;
  body: string;
  cta: string;
  textColor: string;       // hex without '#'
  textPlacement: 'south' | 'north' | 'center';
  scrimOpacity: number;    // 40–80
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
    max_tokens: 1024,
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
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=5&orientation=square`,
      { headers: { Authorization: import.meta.env.VITE_PEXELS_API_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.photos?.length) return null;
    return data.photos[0].src.large as string;
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
    'Describe this image in one concise sentence. Identify the main subject, setting, and dominant lighting/mood.'
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
  const system = `You are a direct-response non-profit copywriter following these strict rules:
- Headline: max 8 words, active voice, must include "${input.orgName}" OR a specific impact stat. No punctuation.
- Body: 1–2 sentences. Name "${input.orgName}" if not in headline. One concrete detail (number, place, or outcome). End with an implicit CTA.
- CTA: 3–5 words, action verb first (e.g. "Donate today", "Volunteer this weekend").
- textColor: hex without '#' — choose for legibility against the image (dark image → ffffff, light image → 1a1a2e).
- textPlacement: choose 'south', 'north', or 'center' based on where the image has open compositional space.
- scrimOpacity: integer 40–80 — higher for busy images, lower for clean/minimal images.
RESPOND WITH VALID JSON ONLY.`;

  const user = `Write final ad copy for this non-profit.

Organization: ${input.orgName}
Sector: ${input.sector}
Mission: ${input.mission}
Location: ${input.location}
Archetype: ${blueprint.archetype}
Core Idea: ${finalIdea}
Image Description: ${imageSummary}

Return this exact JSON:
{
  "headline": "Max 8 words, active voice, includes org name or impact stat",
  "body": "1–2 sentences with concrete detail and CTA",
  "cta": "3–5 word action phrase",
  "textColor": "hex without # (e.g. ffffff or 1a1a2e)",
  "textPlacement": "south | north | center",
  "scrimOpacity": <integer 40–80>
}`;

  const assets = extractJSON<CopyAssets>(await callClaude(system, user));
  assets.scrimOpacity = Math.max(40, Math.min(80, Math.round(assets.scrimOpacity)));
  assets.textColor = assets.textColor.replace(/^#/, '');
  return assets;
}

// ─── Phase 6: The Builder (Cloudinary) ───────────────────────────────────────

function sanitizeForCloudinary(text: string): string {
  return text
    .replace(/\//g, ' ')
    .replace(/,/g, '%252C')
    .replace(/\$/g, '%2524');
}

export function buildCloudinaryUrl(
  copyAssets: CopyAssets,
  input: AdInput,
  imageUrl: string
): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

  const h   = encodeURIComponent(sanitizeForCloudinary(copyAssets.headline));
  const cta = encodeURIComponent(sanitizeForCloudinary(copyAssets.cta));
  const o   = encodeURIComponent(sanitizeForCloudinary(input.orgName));
  const c   = encodeURIComponent(sanitizeForCloudinary(input.contact));
  const img = encodeURIComponent(imageUrl);

  const gravity = copyAssets.textPlacement;   // 'south' | 'north' | 'center'
  const opacity = copyAssets.scrimOpacity;
  const col     = copyAssets.textColor;

  // Scrim size and text offsets vary by placement
  const scrimH    = gravity === 'center' ? 520 : 440;
  const headlineY = gravity === 'north'  ? 75  : gravity === 'center' ? -70 : 175;
  const ctaY      = gravity === 'north'  ? 165 : gravity === 'center' ? 20  : 85;

  const layers: string[] = [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    // Base
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    // Main content scrim — space-text primitive, dynamic gravity and opacity
    `co_black,l_text:Arial_10:%20,w_1080,h_${scrimH},o_${opacity},g_${gravity}`,
  ];

  // Footer scrim — always at south; only needed when content isn't already there
  if (gravity !== 'south') {
    layers.push(`co_black,l_text:Arial_10:%20,w_1080,h_100,o_85,g_south`);
  }

  layers.push(
    // Headline — word-wrapped (c_fit + w), dynamic colour and gravity
    `co_rgb:${col},l_text:Arial_56_bold:${h},w_920,c_fit,g_${gravity},y_${headlineY}`,
    // CTA — smaller, same axis
    `co_rgb:${col}bb,l_text:Arial_30_bold:${cta},g_${gravity},y_${ctaY}`,
    // Divider hairline above footer
    `co_rgb:ffffff,l_text:Arial_2:%20,w_980,h_1,o_35,g_south,y_90`,
    // Footer: org name left, contact right
    `co_rgb:ffffff,l_text:Arial_28_bold:${o},g_south_west,x_40,y_38`,
    `co_rgb:ffffffcc,l_text:Arial_24:${c},g_south_east,x_40,y_40`,
    img,
  );

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
      patch({ alignment, step: 'writing', stepMessage: 'Writing final copy...' });

      // Phase 5 — Copywriter
      const copyAssets = await runCopywriter(input, blueprint, alignment.revisedIdea, imageSummary);
      patch({ copyAssets, step: 'building', stepMessage: 'Assembling final ad...' });

      // Phase 6 — Builder
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
