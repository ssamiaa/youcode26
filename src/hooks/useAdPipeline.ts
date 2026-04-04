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
  const system = `You are an award-winning creative director specializing exclusively in non-profit marketing.
Your copy must be emotionally powerful, specific to the organization's actual mission, and avoid all clichés.
Good Pexels queries are concrete and visual (e.g. "volunteers planting trees community" not "people helping nature").
RESPOND WITH VALID JSON ONLY — no markdown, no explanation, just the JSON object.`;

  const feedbackSection = feedback
    ? `\n\nYour previous attempt was rejected by the critic. Address this feedback directly:\n"${feedback}"`
    : '';

  const user = `Create an ad for this non-profit organization:

Organization: ${input.orgName}
Sector: ${input.sector}
Mission: ${input.mission}
Location: ${input.location}${feedbackSection}

Return this exact JSON structure:
{
  "headline": "Short, powerful headline (max 8 words, no punctuation)",
  "body": "1–2 sentence body copy emphasizing local, measurable impact",
  "pexels_query": "2–4 word specific visual search phrase for Pexels (avoid abstract terms)"
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
  // Cloudinary text overlays: encode the headline, replace %20 with spaces for the overlay param
  const encodedHeadline = encodeURIComponent(headline.replace(/\//g, ' '));
  const encodedImageUrl = encodeURIComponent(imageUrl);

  return [
    `https://res.cloudinary.com/${cloudName}/image/fetch`,
    `w_1080,h_1080,c_fill`,
    `f_auto,q_auto`,
    `b_black,o_50,l_rect,w_1080,h_350,g_south`,
    `co_rgb:ffffff,l_text:Arial_60_bold_center:${encodedHeadline},g_south,y_120`,
    encodedImageUrl,
  ].join('/');
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
      let feedback: string | undefined;
      let attempts = 0;

      // ── Agentic loop: Strategist → Evaluator ──────────────────────────────
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
