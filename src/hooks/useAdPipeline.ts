import { useState, useCallback } from 'react';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | 'idle'
  | 'strategizing'
  | 'evaluating'
  | 'retrying'
  | 'hunting'
  | 'building'
  | 'done'
  | 'error';

export interface AdInput {
  orgName: string;
  sector: string;
  mission: string;
  location: string;
  contact: string;
}

export type AdVisualStyle =
  | 'bottom-bar'   // Classic dark bar at bottom — versatile, works for any org
  | 'bold-center'  // Full-image overlay, large centred headline — high drama/crisis orgs
  | 'top-headline' // Dark bar at top, clean footer — professional/authoritative orgs
  | 'side-panel'   // Left dark panel, text on left — modern, arts & community orgs
  | 'dramatic'     // Dark purple-tinted scrim, auto-contrast boost — advocacy/environmental
  | 'minimal';     // Subtle fade, small elegant text — established/senior-services orgs

export interface AdStrategy {
  headline: string;
  body: string;
  pexels_query: string;
  /** The target audience persona Claude modelled before writing */
  persona: string;
  /** Which copy framework was applied and why */
  copyFramework: string;
  /** The tone register chosen for this sector/org */
  tone: string;
  /** Visual layout style chosen for the Cloudinary composition */
  visualStyle: AdVisualStyle;
  /** One-sentence rationale for the visual style choice */
  visualStyleRationale: string;
}

export interface EvaluationResult {
  score: number;
  feedback: string;
  passed: boolean;
}

export interface AdResult {
  strategy: AdStrategy;
  evaluation: EvaluationResult;
  attempts: number;
  imageUrl: string;
  cloudinaryUrl: string;
}

export interface PipelineState {
  stage: PipelineStage;
  stageMessage: string;
  result: AdResult | null;
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const MODEL = 'claude-haiku-4-5';

/** When false, skips the Claude critic and retry loop; strategist output goes straight to imagery. */
export const EVALUATION_ENABLED = false;

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
  if (block.type !== 'text') {
    throw new Error('Unexpected non-text response from Claude.');
  }
  return block.text;
}

function extractJSON<T>(raw: string): T {
  // Try to extract a JSON block (with or without markdown fences)
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fencedMatch ? fencedMatch[1].trim() : raw.trim();

  // Find the outermost { } object
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

// ─── Pipeline Steps ──────────────────────────────────────────────────────────

async function runStrategist(input: AdInput, feedback?: string): Promise<AdStrategy> {
  const system = `You are an expert non-profit advertising strategist trained in direct-response copywriting.
You write ads that perform — not ads that just sound good. Every element you produce must follow these principles:

1. AUDIENCE PERSONA — Before writing, silently model the target donor/volunteer for this specific org:
   their age bracket, motivations, emotional triggers, and what objections they might have.
   The copy must speak directly to that person's values, not to a generic audience.

2. CLEAR, SINGLE MESSAGE — Each ad communicates exactly ONE idea. No compound asks, no laundry lists.
   If you can't say what the ad is about in five words, simplify.

3. BRAND VOICE — The organization's name must appear naturally in either the headline or body copy.
   The tone should match the sector (urgent for crisis orgs, warm for community orgs, authoritative for health orgs, etc.).

4. PROVEN COPY STRUCTURE — Use one of these frameworks:
   - Problem → Solution → Proof  (best for crisis/urgent sectors)
   - Aspiration → Bridge → Call  (best for community/education sectors)
   - Social Proof → Mission → Ask (best for well-known regional orgs)

5. SPECIFICITY OVER VAGUENESS — Use concrete numbers, places, or outcomes wherever possible.
   "Fed 4,200 families" beats "helped the community". "Vancouver's street youth" beats "people in need".

6. PEXELS QUERY — Must be 3–5 words, highly visual, and search for what is LITERALLY in the ideal photo.
   Think like a stock photographer: describe the subject, action, and setting. No abstract nouns.
   Good: "elderly woman receiving meal delivery"   Bad: "community support kindness"

RESPOND WITH VALID JSON ONLY — no markdown, no explanation, just the JSON object.`;

  const feedbackSection = feedback
    ? `\n\nYour previous attempt was rejected by the critic. Address this feedback directly:\n"${feedback}"`
    : '';

  const user = `Write a high-performing ad for this non-profit organization.

Organization: ${input.orgName}
Sector: ${input.sector}
Mission: ${input.mission}
Location: ${input.location}${feedbackSection}

Return this exact JSON structure:
{
  "persona": "1–2 sentence description of the target donor/volunteer you modelled: age bracket, core motivation, and the single biggest objection they'd have before donating",
  "copyFramework": "Name of the framework you used (e.g. 'Problem → Solution → Proof') and one sentence explaining why it fits this org",
  "tone": "The tone register you chose (e.g. 'Urgent and direct') and one sentence explaining why it fits the sector",
  "visualStyle": "<one of: bottom-bar | bold-center | top-headline | side-panel | dramatic | minimal>",
  "visualStyleRationale": "One sentence explaining why this visual layout fits the emotional register of the ad",
  "headline": "Max 8 words, includes the org name OR a specific impact stat, no punctuation",
  "body": "1–2 sentences of body copy. Must name '${input.orgName}' if not in headline. Use one concrete detail (number, place, or outcome). End with an implicit or explicit call to action.",
  "pexels_query": "3–5 word literal photo description for Pexels search"
}

Visual style guide — choose the ONE that best matches the emotional register of your copy:
- "bottom-bar"   → Classic, safe. Dark bar at bottom. Works for any sector.
- "bold-center"  → High drama. Full-image overlay, large centred headline. Best for crisis sectors (food security, homeless services, disaster relief).
- "top-headline" → Clean, authoritative. Dark bar at top, footer at bottom. Best for health, education, professional services.
- "side-panel"   → Modern, editorial. Left-side dark panel with left-aligned text. Best for arts, culture, community development.
- "dramatic"     → Cinematic, urgent. Dark purple-tinted scrim, contrast-boosted image. Best for advocacy, human rights, environmental.
- "minimal"      → Elegant, trustworthy. Subtle fade, refined small text. Best for well-established orgs, seniors services, arts foundations.`;

  const raw = await callClaude(system, user);
  return extractJSON<AdStrategy>(raw);
}

async function runEvaluator(input: AdInput, strategy: AdStrategy): Promise<EvaluationResult> {
  const system = `You are a harsh but fair creative director who reviews non-profit ad copy before it goes live.
You score 1–10 and are NOT lenient. A score of 8+ means this ad is genuinely great.
Penalize: clichés, vague body copy, Pexels queries that won't return relevant/high-quality photos,
copy that could belong to any org (not specific to THIS org's mission), and emotional manipulation without substance.
RESPOND WITH VALID JSON ONLY — no markdown, no explanation, just the JSON object.`;

  const user = `Evaluate this ad copy against the brief below.

BRIEF:
Organization: ${input.orgName}
Sector: ${input.sector}
Mission: ${input.mission}
Location: ${input.location}

AD COPY:
Headline: "${strategy.headline}"
Body: "${strategy.body}"
Pexels Query: "${strategy.pexels_query}"

Scoring criteria:
1. Brand alignment — does the copy reflect THIS specific org and mission? (not generic)
2. Emotional resonance — does it move people to act without being manipulative or saccharine?
3. Pexels searchability — will "${strategy.pexels_query}" return visually striking, relevant, licensable images?

Return this exact JSON structure:
{
  "score": <integer 1–10>,
  "feedback": "Specific, actionable critique: what failed and exactly how to fix it",
  "passed": <true if score >= 8, false otherwise>
}`;

  const raw = await callClaude(system, user);
  const result = extractJSON<EvaluationResult>(raw);
  // Enforce the passed rule in case Claude is inconsistent
  result.passed = result.score >= 8;
  return result;
}

async function runHunter(query: string): Promise<string> {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=square`,
    {
      headers: {
        Authorization: import.meta.env.VITE_PEXELS_API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Pexels API error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.photos || data.photos.length === 0) {
    throw new Error(`No images found on Pexels for query: "${query}"`);
  }

  // Prefer the large2x size for best Cloudinary quality
  return data.photos[0].src.large2x as string;
}

function sanitizeForCloudinary(text: string): string {
  return text
    .replace(/\//g, ' ')       // Slashes break URL paths
    .replace(/,/g, '%252C')    // Commas are Cloudinary layer delimiters
    .replace(/\$/g, '%2524');  // Dollar signs are Cloudinary variable sigils
}

// ─── Style Builders ───────────────────────────────────────────────────────────
// Each function returns the ordered transformation segments (joined with '/').
// Segments are assembled as: base / ...layers / encodedImageUrl

type StyleContext = {
  cloudName: string;
  h: string;  // encoded headline
  o: string;  // encoded org name
  c: string;  // encoded contact
  img: string; // encoded image URL
};

/** Classic dark bar at the bottom — versatile fallback. */
function styleBottomBar({ cloudName, h, o, c, img }: StyleContext): string {
  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    // scrim
    `co_black,l_text:Arial_10:%20,w_1080,h_420,o_65,g_south`,
    // headline (word-wrapped)
    `co_rgb:ffffff,l_text:Arial_56_bold_center:${h},w_940,c_fit,g_south,y_160`,
    // divider hairline
    `co_rgb:ffffff,l_text:Arial_2:%20,w_980,h_1,o_35,g_south,y_90`,
    // footer text
    `co_rgb:ffffff,l_text:Arial_28_bold:${o},g_south_west,x_40,y_38`,
    `co_rgb:ffffffcc,l_text:Arial_24:${c},g_south_east,x_40,y_40`,
    img,
  ].join('/');
}

/** Full-image overlay, large centred headline — high drama for crisis orgs. */
function styleBoldCenter({ cloudName, h, o, c, img }: StyleContext): string {
  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    // full overlay
    `co_black,l_text:Arial_10:%20,w_1080,h_1080,o_50,g_center`,
    // headline centred, slightly above middle
    `co_rgb:ffffff,l_text:Arial_64_bold_center:${h},w_900,c_fit,g_center,y_-80`,
    // footer bar
    `co_black,l_text:Arial_10:%20,w_1080,h_110,o_85,g_south`,
    // divider
    `co_rgb:ffffff,l_text:Arial_2:%20,w_980,h_1,o_30,g_south,y_110`,
    // footer text
    `co_rgb:ffffff,l_text:Arial_28_bold:${o},g_south_west,x_40,y_38`,
    `co_rgb:ffffffcc,l_text:Arial_24:${c},g_south_east,x_40,y_40`,
    img,
  ].join('/');
}

/** Dark bar at top, clean footer — authoritative and professional. */
function styleTopHeadline({ cloudName, h, o, c, img }: StyleContext): string {
  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    // top scrim
    `co_black,l_text:Arial_10:%20,w_1080,h_360,o_75,g_north`,
    // headline (word-wrapped, anchored to top)
    `co_rgb:ffffff,l_text:Arial_52_bold_center:${h},w_940,c_fit,g_north,y_65`,
    // bottom footer bar
    `co_black,l_text:Arial_10:%20,w_1080,h_100,o_85,g_south`,
    // footer divider
    `co_rgb:ffffff,l_text:Arial_2:%20,w_980,h_1,o_30,g_south,y_100`,
    // footer text
    `co_rgb:ffffff,l_text:Arial_28_bold:${o},g_south_west,x_40,y_36`,
    `co_rgb:ffffffcc,l_text:Arial_24:${c},g_south_east,x_40,y_38`,
    img,
  ].join('/');
}

/** Left dark panel with left-aligned text — modern and editorial. */
function styleSidePanel({ cloudName, h, o, c, img }: StyleContext): string {
  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    // left panel
    `co_black,l_text:Arial_10:%20,w_430,h_1080,o_80,g_west`,
    // headline left-aligned, vertically centred in panel
    `co_rgb:ffffff,l_text:Arial_50_bold:${h},w_360,c_fit,g_west,x_35,y_-60`,
    // divider line above footer in panel
    `co_rgb:ffffff,l_text:Arial_2:%20,w_360,h_1,o_35,g_south_west,x_35,y_90`,
    // footer text in panel
    `co_rgb:ffffff,l_text:Arial_26_bold:${o},g_south_west,x_35,y_56`,
    `co_rgb:ffffffcc,l_text:Arial_22:${c},g_south_west,x_35,y_28`,
    img,
  ].join('/');
}

/** Dark purple tint + contrast boost — cinematic, urgent, advocacy-ready. */
function styleDramatic({ cloudName, h, o, c, img }: StyleContext): string {
  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    // base with auto-contrast for extra punch
    `w_1080,h_1080,c_fill,f_auto,q_auto,e_auto_contrast`,
    // deep purple-tinted scrim
    `co_rgb:0d0628,l_text:Arial_10:%20,w_1080,h_440,o_82,g_south`,
    // purple accent bar above footer
    `co_rgb:9333ea,l_text:Arial_6:%20,w_1080,h_4,o_90,g_south,y_90`,
    // headline
    `co_rgb:ffffff,l_text:Arial_58_bold_center:${h},w_940,c_fit,g_south,y_160`,
    // footer text
    `co_rgb:e8d5ff,l_text:Arial_28_bold:${o},g_south_west,x_40,y_38`,
    `co_rgb:c4b5fd,l_text:Arial_24:${c},g_south_east,x_40,y_40`,
    img,
  ].join('/');
}

/** Subtle fade, refined small text — elegant for established orgs. */
function styleMinimal({ cloudName, h, o, c, img }: StyleContext): string {
  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill,f_auto,q_auto`,
    // gentle gradient-like scrim (two stacked semi-transparent layers for a softer fade)
    `co_black,l_text:Arial_10:%20,w_1080,h_420,o_30,g_south`,
    `co_black,l_text:Arial_10:%20,w_1080,h_220,o_40,g_south`,
    // headline: smaller, refined
    `co_rgb:ffffff,l_text:Arial_44_bold_center:${h},w_880,c_fit,g_south,y_130`,
    // hairline divider
    `co_rgb:ffffff,l_text:Arial_2:%20,w_820,h_1,o_45,g_south,y_88`,
    // footer text — slightly dimmed for elegance
    `co_rgb:ffffffee,l_text:Arial_26_bold:${o},g_south_west,x_40,y_36`,
    `co_rgb:ffffffaa,l_text:Arial_22:${c},g_south_east,x_40,y_40`,
    img,
  ].join('/');
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function buildCloudinaryUrl(
  strategy: AdStrategy,
  input: AdInput,
  imageUrl: string
): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

  const ctx: StyleContext = {
    cloudName,
    h:   encodeURIComponent(sanitizeForCloudinary(strategy.headline)),
    o:   encodeURIComponent(sanitizeForCloudinary(input.orgName)),
    c:   encodeURIComponent(sanitizeForCloudinary(input.contact)),
    img: encodeURIComponent(imageUrl),
  };

  const builders: Record<AdVisualStyle, (ctx: StyleContext) => string> = {
    'bottom-bar':   styleBottomBar,
    'bold-center':  styleBoldCenter,
    'top-headline': styleTopHeadline,
    'side-panel':   styleSidePanel,
    'dramatic':     styleDramatic,
    'minimal':      styleMinimal,
  };

  const style = strategy.visualStyle ?? 'bottom-bar';
  const builder = builders[style] ?? styleBottomBar;
  return builder(ctx);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdPipeline() {
  const [state, setState] = useState<PipelineState>({
    stage: 'idle',
    stageMessage: '',
    result: null,
    error: null,
  });

  const setStage = (stage: PipelineStage, stageMessage: string) =>
    setState((prev) => ({ ...prev, stage, stageMessage, error: null }));

  const run = useCallback(async (input: AdInput) => {
    setState({ stage: 'strategizing', stageMessage: 'Crafting ad strategy...', result: null, error: null });

    try {
      let strategy: AdStrategy | null = null;
      let evaluation: EvaluationResult | null = null;
      let attempts = 0;

      if (EVALUATION_ENABLED) {
        // ── Agentic loop: Strategist → Evaluator ───────────────────────────
        let feedback: string | undefined;
        while (attempts <= MAX_RETRIES) {
          const isRetry = attempts > 0;

          setStage(
            isRetry ? 'retrying' : 'strategizing',
            isRetry
              ? `Refining strategy (attempt ${attempts + 1} of ${MAX_RETRIES + 1})...`
              : 'Crafting ad strategy...'
          );

          strategy = await runStrategist(input, feedback);

          setStage('evaluating', 'Criticizing strategy...');
          evaluation = await runEvaluator(input, strategy);

          if (evaluation.passed) break;

          feedback = evaluation.feedback;
          attempts++;

          if (attempts > MAX_RETRIES) {
            throw new Error(
              `Strategy failed quality check after ${MAX_RETRIES + 1} attempts. ` +
                `Final score: ${evaluation.score}/10. Last feedback: ${evaluation.feedback}`
            );
          }
        }
      } else {
        setStage('strategizing', 'Crafting ad strategy...');
        strategy = await runStrategist(input);
        evaluation = {
          score: 10,
          passed: true,
          feedback:
            'Evaluation is turned off. Set EVALUATION_ENABLED to true in useAdPipeline.ts to enable the critic and retries.',
        };
        attempts = 0;
      }

      // ── Hunter: source image from Pexels ──────────────────────────────────
      setStage('hunting', 'Sourcing imagery from Pexels...');
      const imageUrl = await runHunter(strategy!.pexels_query);

      // ── Builder: compose Cloudinary URL ───────────────────────────────────
      setStage('building', 'Assembling final ad...');
      const cloudinaryUrl = buildCloudinaryUrl(strategy!, input, imageUrl);

      setState({
        stage: 'done',
        stageMessage: 'Ad ready!',
        result: {
          strategy: strategy!,
          evaluation: evaluation!,
          attempts: attempts + 1,
          imageUrl,
          cloudinaryUrl,
        },
        error: null,
      });
    } catch (err) {
      setState({
        stage: 'error',
        stageMessage: '',
        result: null,
        error: err instanceof Error ? err.message : 'An unknown error occurred.',
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ stage: 'idle', stageMessage: '', result: null, error: null });
  }, []);

  return { ...state, run, reset };
}
