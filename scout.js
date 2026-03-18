// api/scout.js
// Verdeelt een ingesproken transcript over scoutingcategorieën via Claude AI
// Ondersteunt transcript stacking: meerdere transcripts worden samengevoegd

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { transcripts, categories } = req.body;

  // Validatie
  if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
    return res.status(400).json({ error: 'transcripts array vereist' });
  }
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'categories array vereist' });
  }

  // Stapel alle transcripts samen (de stapelmethode)
  const combinedTranscript = transcripts
    .map((t, i) => transcripts.length > 1 ? `[Ronde ${i + 1}]: ${t}` : t)
    .join('\n\n');

  const categoryList = categories.map(c => `- "${c.id}": ${c.label}`).join('\n');
  const emptyJson = '{' + categories.map(c => `"${c.id}":""`).join(',') + '}';

  const prompt = `Je bent een professionele voetbalscout-assistent. Een scout heeft de volgende observatie(s) ingesproken over een speler:

${combinedTranscript}

Verdeel deze observaties over de volgende evaluatiecategorieën:
${categoryList}

Geef je antwoord UITSLUITEND als geldig JSON (geen uitleg, geen markdown, geen codeblokken):
${emptyJson}

Strikte regels:
- Schrijf ALTIJD in het Nederlands
- Gebruik de exacte woorden en zinnen van de scout zo veel mogelijk
- Laat een veld leeg ("") als de scout er niets over zei — verzin niets
- Verdeel overlap logisch: "goede eerste aanname en past goed" → techniek én tactiek
- Verander nooit de feitelijke betekenis van wat gezegd is
- Geen samenvattingen — gebruik de ruwe observaties zelf`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI service tijdelijk niet beschikbaar' });
    }

    const data = await response.json();
    const raw = (data.content || []).map(b => b.text || '').join('').trim();

    // Strip markdown code fences als Claude die toch stuurt
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse error:', clean);
      return res.status(500).json({ error: 'AI gaf onverwacht formaat terug', raw: clean });
    }

    // Filter lege waarden en stuur terug
    const result = {};
    categories.forEach(cat => {
      if (parsed[cat.id] && parsed[cat.id].trim()) {
        result[cat.id] = parsed[cat.id].trim();
      }
    });

    return res.status(200).json({
      success: true,
      distribution: result,
      categoriesFound: Object.keys(result).length,
      transcriptLength: combinedTranscript.length
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Interne serverfout', message: err.message });
  }
}
