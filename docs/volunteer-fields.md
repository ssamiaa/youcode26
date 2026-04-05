# Volunteer profile fields

Volunteers in YouCode are stored in Supabase in the **`volunteers`** table. The app reads them for **CSV import**, **AI matching** (conversation → scored shortlist), **Find volunteers** cards in the org dashboard, and **pipeline** rows (joined from matches).

This document describes each field the product expects, how data should be shaped, and how matching uses them.

---

## Core identity

| Field | Type | Required for import | Description |
|--------|------|---------------------|-------------|
| **`volunteer_id`** | string (UUID or stable id) | Recommended | Unique id for the person. CSV headers `volunteer_id` or `id` map here. |
| **`first_name`** | string | Typical | Given name. Aliases: `firstname`. |
| **`last_name`** | string | Typical | Family name. Aliases: `lastname`. |

---

## Demographics & location

| Field | Type | Description |
|--------|------|-------------|
| **`age`** | number | Age in years. Parsed from CSV as a number. |
| **`neighbourhood`** | string | Area / neighbourhood (e.g. for local placement). Aliases: `neighborhood`. Used in matching when the parsed need includes a neighbourhood (substring match, case-insensitive). |

---

## Languages & skills

| Field | Type | CSV format | Description |
|--------|------|------------|-------------|
| **`languages_spoken`** | string[] (DB) | Semicolon-separated | Languages the volunteer speaks. Aliases: `languages`, `languages_spoken`. **Matching:** compared to languages extracted from the org’s need; strong weight in the score. |
| **`skills`** | string[] (DB) | Semicolon-separated | Skills or competencies. **Matching:** substring match against skills requested in the need. |

---

## Causes & availability

| Field | Type | CSV format | Description |
|--------|------|------------|-------------|
| **`cause_areas_of_interest`** | string[] (DB) | Semicolon-separated | Cause areas they care about. Aliases: `causes`, `cause_areas`, `cause_areas_of_interest`. **Matching:** substring match against cause areas in the need. |
| **`availability`** | string | plain text | When they are generally free (e.g. weekdays, evenings, weekends). **Matching:** substring match against availability phrases from the need. |
| **`hours_available_per_month`** | number | numeric | Approximate hours per month. Aliases: `hours`, `hours_available_per_month`. |

---

## Logistics & compliance

| Field | Type | CSV format | Description |
|--------|------|------------|-------------|
| **`prior_volunteer_experience`** | boolean | `true` / `yes` / `1` (case-insensitive) | Whether they have volunteered before. Aliases: `experience`, `prior_volunteer_experience`. |
| **`has_vehicle`** | boolean | same as above | Whether they can drive / have a vehicle. Aliases: `vehicle`, `has_vehicle`. |
| **`background_check_status`** | string | free text | Status of a background check (e.g. pending, completed). Aliases: `background_check`, `background_check_status`. **Matching:** if the need requires a background check, volunteers with status **`Completed`** (exact string) get extra points. |
| **`phone`** | string | plain text | Contact number. Aliases: `phone`, `phone_number`, `mobile`. |

---

## Fields added at match time (not stored on `volunteers`)

When the **match API** returns volunteers, each row may include:

| Field | Description |
|--------|-------------|
| **`match_score`** | Integer score from rule-based matching (`lib/matching/score.ts`), higher is better. |
| **`match_reason`** | Short natural-language sentence from the model explaining why they fit the need. |

These support the org UI and outreach; they are not columns you import on the volunteer row itself.

---

## CSV import behaviour

Implemented in `src/components/ImportCSV.tsx`:

- **Header aliases:** headers are normalized (lowercase, spaces → underscores) and mapped via `FIELD_ALIASES` (e.g. `neighborhood` → `neighbourhood`, `causes` → `cause_areas_of_interest`).
- **Multi-value columns:** `languages_spoken`, `skills`, and `cause_areas_of_interest` are split on **`;`** and trimmed into arrays.
- **Booleans:** `prior_volunteer_experience`, `has_vehicle` accept `true`, `yes`, or `1` as true.
- **Numbers:** `age` and `hours_available_per_month` are parsed with `Number()`; invalid values are skipped.
- **Empty cells:** skipped empty values are not sent for that column.

---

## How matching uses volunteer fields

`lib/matching/score.ts` loads volunteers with `select('*')` and adds points when volunteer attributes align with the **parsed need** (`ParsedNeed` from the conversation):

| Volunteer field | Role in scoring |
|------------------|-----------------|
| `languages_spoken` | Strong match vs need languages |
| `availability` | Match vs need availability phrases |
| `background_check_status` | Bonus when need requires check and status is `Completed` |
| `skills` | Match vs requested skills |
| `cause_areas_of_interest` | Match vs need cause areas |
| `neighbourhood` | Light match vs need neighbourhood |

The API returns the **top five** volunteers by score, then enriches them with a human-readable **match reason** and normalizes some fields for the client (e.g. splitting `skills` / `languages_spoken` on `;` when they arrive as strings from the database).

---

## Related types in code

- **`VolunteerCard`** — `src/app/org/OrgDashboard.tsx`: shape used when listing matches in the Find tab.
- **`PipelineEntry`** — `src/components/pipeline/PipelineBoard.tsx`: match row plus joined `first_name`, `last_name`, `neighbourhood`, `skills` from `volunteers`.

If your Supabase schema differs (extra columns, different types), align migrations with the types above so CSV import and scoring stay consistent.
