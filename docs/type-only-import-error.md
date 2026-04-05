# Fixing: “does not provide an export named 'AdInput'” (Vite + TypeScript)

## What the error means

When you see:

```text
SyntaxError: The requested module '/src/hooks/useAdPipeline.ts' does not provide an export named 'AdInput'
```

the browser is loading the **compiled JavaScript** for `useAdPipeline.ts`. In that output, **there is no `AdInput` binding**.

`AdInput` was declared in TypeScript as an **`export interface`**. Interfaces exist only for **type checking**. The compiler **erases** them; they never become a real `export` in the running code.

## Why Vite still complained

In `AdPipelineUI.tsx` the import looked like:

```ts
import { useAdPipeline, AdInput, PipelineStage } from '../hooks/useAdPipeline';
```

That tells the module loader to load **three** named exports at **runtime**: `useAdPipeline`, `AdInput`, and `PipelineStage`. Only `useAdPipeline` actually exists in the emitted module, so the runtime throws.

TypeScript *can* remove type-only names from that list when it knows they are types only—but with Vite’s pipeline (and mixed value/type imports), it is safer to be explicit so nothing asks for a non-existent export.

## Solution

**Import types separately** with `import type`:

```ts
import { useAdPipeline } from '../hooks/useAdPipeline';
import type { AdInput, PipelineStage } from '../hooks/useAdPipeline';
```

Or use inline type modifiers (TypeScript 4.5+):

```ts
import { useAdPipeline, type AdInput, type PipelineStage } from '../hooks/useAdPipeline';
```

Both approaches guarantee `AdInput` and `PipelineStage` are **compile-time only** and never appear in the runtime import statement.

## Same idea for other type-only exports

Use `import type` (or `type` in the import list) for anything that is **not** a value at runtime, for example:

- `interface` / `type` aliases
- Enums are values in TS (they emit code)—**don’t** use `import type` for enums you use as values

## Reference

This project applies the fix in `src/components/AdPipelineUI.tsx` so `npm run dev` loads without that error.
