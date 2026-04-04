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
}

export interface AdStrategy {
  headline: string;
  body: string;
  pexels_query: string;
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
  "headline": "Headline: max 8 words, includes the org name OR a specific impact stat, no punctuation",
  "body": "1–2 sentences of body copy. Must name '${input.orgName}' if not in headline. Use one concrete detail (number, place, or outcome). End with an implicit or explicit call to action.",
  "pexels_query": "3–5 word literal photo description for Pexels search"
}`;

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

function buildCloudinaryUrl(headline: string, imageUrl: string): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

  // 1. Sanitize and Escape the Headline
  // We use double-encoding for commas because Cloudinary uses commas as delimiters.
  const cleanHeadline = headline
    .replace(/\//g, ' ')         // Slashes break URL paths
    .replace(/,/g, '%252C');    // Comma must be escaped for Cloudinary layers

  const encodedHeadline = encodeURIComponent(cleanHeadline);
  const encodedImageUrl = encodeURIComponent(imageUrl);

  // 2. Base Configuration (1080x1080 Square Ad)
  const baseConfig = `w_1080,h_1080,c_fill,f_auto,q_auto`;

  // 3. The Scrim (Background Box)
  // We create a "space" character, stretch it to 1080px wide, and make it black/transparent.
  const scrim = [
    `co_black`,
    `l_text:Arial_10:%20`, // The "Space" primitive
    `w_1080,h_350`,       // Box dimensions
    `o_50`,               // 50% opacity
    `g_south`             // Pinned to the bottom
  ].join(',');

  // 4. The Headline Text
  // We pin to south and use y_120 to provide "padding" from the bottom edge.
  const textLayer = [
    `co_rgb:ffffff`,
    `l_text:Arial_60_bold:${encodedHeadline}`,
    `g_south`,
    `y_120`
  ].join(',');

  // 5. Final Assembly
  return `https://res.cloudinary.com/${cloudName}/image/fetch/${baseConfig}/${scrim}/${textLayer}/${encodedImageUrl}`;
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
      const cloudinaryUrl = buildCloudinaryUrl(strategy!.headline, imageUrl);

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
