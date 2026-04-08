# Relinkd

Relinkd is an end-to-end volunteer recruitment platform for BC nonprofits. A coordinator describes what they need in plain language, Relinkd finds the best matches from a real volunteer database, sends SMS outreach automatically, tracks responses, and uses engagement data to generate targeted social media recruitment posts — all in one platform.

## Features

- **AI-guided matching** — describe your need in plain language, Relinkd asks follow up questions and returns the top 5 volunteers with scores and match reasons
- **SMS outreach** — hit Connect and the volunteer gets a text immediately. They reply YES or NO and the status updates automatically
- **Pipeline tracker** — see every match tracked from outreach to confirmed in one place
- **Ad generator** — pipeline data identifies your volunteer gaps and generates targeted social media recruitment posts based on your organization's website

## Tech Stack

- **Frontend** — React, TypeScript, Vite, Tailwind CSS
- **AI** — Claude API (Anthropic)
- **Database** — Supabase (PostgreSQL)
- **SMS** — Twilio
- **Images** — Pexels API
- **Media** — Cloudinary
- **Backend** — Express.js (Node.js)

## Prerequisites

Before running this project you will need accounts and API keys for the following services:

| Service | What it's used for | Link |
|---|---|---|
| Anthropic | AI matching + ad copy generation | https://console.anthropic.com |
| Supabase | Database | https://supabase.com |
| Twilio | SMS outreach | https://twilio.com |
| Pexels | Stock images for ad generator | https://www.pexels.com/api |
| Cloudinary | Image hosting for ads | https://cloudinary.com |
| ngrok | Expose local server for Twilio webhooks | https://ngrok.com |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/ssamiaa/youcode26.git
cd youcode26
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a `.env` file in the root

```
ANTHROPIC_API_KEY=your_anthropic_key
VITE_ANTHROPIC_API_KEY=your_anthropic_key

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

VITE_PEXELS_API_KEY=your_pexels_api_key
VITE_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
```

> Note: Keys prefixed with `VITE_` are used by the frontend. Keys without the prefix are server-only.

### 4. Set up Twilio webhook (required for SMS replies)

Twilio needs a public URL to send incoming SMS replies to your local server. Use ngrok to expose it:

```bash
ngrok http 3001
```

Copy the `https://` URL ngrok gives you (e.g. `https://abc123.ngrok-free.app`) and paste it into your Twilio console:

**Twilio Console → Phone Numbers → your number → Messaging → Webhook URL:**
```
https://your-ngrok-url.ngrok-free.app/api/webhook
```

Set the method to **HTTP POST**.

### 5. Run the app

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
