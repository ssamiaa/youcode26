```
# Relinkd

Relinkd is an end-to-end volunteer management platform for BC nonprofits. A coordinator describes what they need in plain language, Relinkd finds the best matches from a real volunteer database, sends SMS outreach automatically, tracks responses, and uses engagement data to generate targeted social media recruitment posts — all in one platform.

## Features

- **AI-guided matching** — describe your need in plain language, Relinkd asks follow up questions and returns the top 5 volunteers with scores and match reasons
- **SMS outreach** — hit Connect and the volunteer gets a text immediately. They reply YES or NO and the status updates automatically
- **Pipeline tracker** — see every match tracked from outreach to confirmed in one place
- **Ad generator** — pipeline data identifies your volunteer gaps and generates targeted social media recruitment posts based on your organization's website

## Tech Stack

- **Frontend** — React, TypeScript, Vite, Tailwind CSS
- **AI** — Claude Haiku (Anthropic)
- **Database** — Supabase (PostgreSQL)
- **SMS** — Twilio
- **Analytics** — SAP BTP
- **Deployment** — Vercel

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a `.env.local` file in the root

```
ANTHROPIC_API_KEY=your_anthropic_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

### 3. Run the app

You need two terminals open at the same time.

**Terminal 1 — API server:**
```bash
npx tsx server.ts
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Open http://localhost:5173
```
