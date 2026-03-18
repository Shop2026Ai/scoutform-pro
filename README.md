# ScoutForm Pro

AI-powered voetbal scoutingsrapport platform. Scouts spreken observaties in, AI verdeelt automatisch over de juiste categorieën. Elke club kan zijn eigen scoutingsformulier uploaden.

## Features

- **Alles inspreken** — één centrale voice knop, AI verdeelt over categorieën
- **Stapelmethode** — meerdere inspreekondes stapelen vóór AI-verwerking
- **Club-eigen templates** — upload PDF/Word formulier, AI extraheert categorieën automatisch
- **Clubkleuren** — volledig aanpasbaar per club
- **Export** — PDF/print klaar rapport

## Stack

- Frontend: Vanilla HTML/CSS/JS (geen framework)
- Backend: Vercel serverless functions (Node.js)
- AI: Claude claude-sonnet-4-20250514 via Anthropic API

## Project structuur

```
scoutform-pro/
├── api/
│   ├── scout.js              # Verdeelt transcript over categorieën
│   └── extract-template.js   # Extraheert categorieën uit geüpload formulier
├── public/
│   └── index.html            # Frontend (single page app)
├── .env.local                # API key (niet committen!)
├── vercel.json               # Vercel configuratie
└── package.json
```

## Setup

### 1. Clone en installeer

```bash
git clone https://github.com/Shop2026Ai/scoutform-pro
cd scoutform-pro
npm install
```

### 2. Environment variabelen

Maak een `.env.local` bestand aan:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Voeg in Vercel dashboard toe onder **Settings → Environment Variables**:
- `ANTHROPIC_API_KEY` = jouw Anthropic API key

### 3. Lokaal draaien

```bash
npx vercel dev
```

Open `http://localhost:3000`

### 4. Deployen

```bash
npx vercel --prod
```

Of push naar GitHub — Vercel deployt automatisch.

## API Routes

### POST `/api/scout`

Verdeelt een of meerdere transcripts (stapelmethode) over scoutingscategorieën.

**Request:**
```json
{
  "transcripts": ["Goede eerste aanname, past snel...", "Tweede ronde: fysiek sterk..."],
  "categories": [
    { "id": "techniek", "label": "Techniek" },
    { "id": "fysiek", "label": "Fysieke kwaliteiten" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "distribution": {
    "techniek": "Goede eerste aanname, past snel",
    "fysiek": "Fysiek sterk"
  },
  "categoriesFound": 2
}
```

### POST `/api/extract-template`

Leest een geüpload scoutingsformulier en extraheert de evaluatiecategorieën.

**Request:**
```json
{
  "fileBase64": "JVBERi0x...",
  "fileName": "ajax-scoutingsformulier.pdf",
  "mimeType": "application/pdf"
}
```

**Response:**
```json
{
  "success": true,
  "clubNaam": "Ajax",
  "categories": [
    {
      "id": "techniek",
      "label": "Technische kwaliteiten",
      "description": "Balbeheersing, passing, afwerking",
      "hasScore": true,
      "scoreType": "ABCD"
    }
  ],
  "hasEndVerdict": true,
  "extraFields": ["Speeltijd", "Wedstrijdnummer"]
}
```

## Roadmap

- [x] Voice inspreken + stapelmethode
- [x] AI verdeling over categorieën
- [x] Club-eigen template upload (PDF/Word)
- [ ] Spelersdatabase + rapporthistorie
- [ ] Multi-scout workflow
- [ ] Offline PWA
- [ ] Wyscout/InStat ID koppeling
