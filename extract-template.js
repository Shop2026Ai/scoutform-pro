// api/extract-template.js
// Leest een geüpload scoutingsformulier (PDF of Word als base64)
// en extraheert de evaluatiecategorieën via Claude AI

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileBase64, fileName, mimeType } = req.body;

  if (!fileBase64 || !fileName) {
    return res.status(400).json({ error: 'fileBase64 en fileName vereist' });
  }

  // Bepaal documenttype
  const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isWord = mimeType?.includes('word') || fileName.toLowerCase().match(/\.docx?$/);

  if (!isPDF && !isWord) {
    return res.status(400).json({ error: 'Alleen PDF en Word bestanden worden ondersteund' });
  }

  const prompt = `Je bent een expert in het analyseren van voetbal scoutingsformulieren. Analyseer dit scoutingsformulier en extraheer alle evaluatiecategorieën.

Geef je antwoord UITSLUITEND als geldig JSON (geen uitleg, geen markdown):
{
  "clubNaam": "naam van de club als zichtbaar in het formulier, anders leeg",
  "categories": [
    {
      "id": "unieke_slug_zonder_spaties",
      "label": "Leesbare naam van de categorie",
      "description": "Korte omschrijving van wat beoordeeld wordt",
      "hasScore": true of false (heeft dit veld een cijfer/letter score?),
      "scoreType": "ABCD" of "1-10" of "1-5" of "none"
    }
  ],
  "hasEndVerdict": true of false,
  "extraFields": ["lijst van andere vaste velden in het formulier buiten categorieën"]
}

Regels:
- Extraheer ALLE beoordelingscategorieën, ook subonderdelen
- Gebruik Nederlandstalige labels
- id mag alleen kleine letters, cijfers en underscores bevatten
- Geef minimaal 3 en maximaal 15 categorieën terug
- Als het geen scoutingsformulier lijkt te zijn, geef dan categories: [] terug`;

  try {
    // Bouw het bericht op met het document
    const messageContent = isPDF
      ? [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: fileBase64
            }
          },
          { type: 'text', text: prompt }
        ]
      : [
          // Voor Word: stuur als tekst-extractie instructie (Word kan Claude niet direct lezen)
          {
            type: 'text',
            text: `Het volgende is de base64-encoded inhoud van een Word document (${fileName}). Behandel het als een scoutingsformulier en voer de volgende taak uit:\n\n${prompt}\n\nNoot: Als je de Word inhoud niet kunt decoderen, gebruik dan de bestandsnaam als hint en geef standaard voetbal scoutingscategorieën terug.`
          }
        ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI service tijdelijk niet beschikbaar' });
    }

    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('').trim();
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse error:', clean);
      return res.status(500).json({ error: 'AI gaf onverwacht formaat terug' });
    }

    // Valideer en normaliseer output
    if (!parsed.categories || !Array.isArray(parsed.categories)) {
      parsed.categories = [];
    }

    // Zorg voor geldige IDs
    parsed.categories = parsed.categories.map(cat => ({
      ...cat,
      id: cat.id?.replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'categorie_' + Math.random().toString(36).substr(2, 5)
    }));

    return res.status(200).json({
      success: true,
      fileName,
      ...parsed
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Interne serverfout', message: err.message });
  }
}
