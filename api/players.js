// api/players.js
// Spelersdatabase via Vercel KV (Redis)
// GET  /api/players          — alle spelers ophalen
// GET  /api/players?id=xxx   — één speler ophalen
// GET  /api/players?q=naam   — zoeken op naam/positie/club
// POST /api/players          — speler aanmaken of rapport toevoegen
// PUT  /api/players          — speler updaten (status, notities)
// DELETE /api/players?id=xxx — speler verwijderen

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    switch (req.method) {

      // ── GET ──
      case 'GET': {
        const { id, q } = req.query;

        // Één speler ophalen
        if (id) {
          const player = await kv.get(`player:${id}`);
          if (!player) return res.status(404).json({ error: 'Speler niet gevonden' });
          return res.status(200).json({ success: true, player });
        }

        // Alle speler-IDs ophalen
        const allIds = await kv.smembers('players:index') || [];
        if (allIds.length === 0) return res.status(200).json({ success: true, players: [] });

        // Alle spelers ophalen
        const players = await Promise.all(
          allIds.map(pid => kv.get(`player:${pid}`))
        );
        const validPlayers = players.filter(Boolean);

        // Zoeken indien q meegegeven
        if (q && q.trim()) {
          const term = q.toLowerCase().trim();
          const filtered = validPlayers.filter(p =>
            p.naam?.toLowerCase().includes(term) ||
            p.positie?.toLowerCase().includes(term) ||
            p.club?.toLowerCase().includes(term) ||
            p.nationaliteit?.toLowerCase().includes(term)
          );
          return res.status(200).json({ success: true, players: filtered, total: filtered.length });
        }

        // Sorteer op laatste rapport datum
        validPlayers.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return res.status(200).json({ success: true, players: validPlayers, total: validPlayers.length });
      }

      // ── POST — speler aanmaken of rapport toevoegen ──
      case 'POST': {
        const { player: playerData, rapport } = req.body;

        if (!playerData?.naam) {
          return res.status(400).json({ error: 'naam vereist' });
        }

        // Controleer of speler al bestaat (op naam + geboortedatum)
        const allIds = await kv.smembers('players:index') || [];
        let existingPlayer = null;
        let existingId = null;

        if (allIds.length > 0) {
          const allPlayers = await Promise.all(allIds.map(pid => kv.get(`player:${pid}`)));
          const match = allPlayers.find(p =>
            p?.naam?.toLowerCase() === playerData.naam.toLowerCase() &&
            p?.geboortedatum === playerData.geboortedatum
          );
          if (match) {
            existingPlayer = match;
            existingId = match.id;
          }
        }

        const now = new Date().toISOString();

        if (existingPlayer && rapport) {
          // Voeg rapport toe aan bestaande speler
          const rapportMet = {
            ...rapport,
            id: generateId(),
            createdAt: now
          };
          existingPlayer.rapporten = [...(existingPlayer.rapporten || []), rapportMet];
          existingPlayer.updatedAt = now;
          existingPlayer.aantalRapporten = existingPlayer.rapporten.length;

          // Update status op basis van laatste verdict
          if (rapport.verdict) existingPlayer.status = verdictToStatus(rapport.verdict);

          await kv.set(`player:${existingId}`, existingPlayer);
          return res.status(200).json({ success: true, player: existingPlayer, action: 'rapport_toegevoegd' });
        }

        // Nieuwe speler aanmaken
        const id = generateId();
        const rapportMet = rapport ? {
          ...rapport,
          id: generateId(),
          createdAt: now
        } : null;

        const newPlayer = {
          id,
          naam: playerData.naam,
          geboortedatum: playerData.geboortedatum || '',
          positie: playerData.positie || '',
          club: playerData.club || '',
          nationaliteit: playerData.nationaliteit || '',
          status: rapport?.verdict ? verdictToStatus(rapport.verdict) : 'volgen',
          notities: '',
          rapporten: rapportMet ? [rapportMet] : [],
          aantalRapporten: rapportMet ? 1 : 0,
          createdAt: now,
          updatedAt: now
        };

        await kv.set(`player:${id}`, newPlayer);
        await kv.sadd('players:index', id);

        return res.status(201).json({ success: true, player: newPlayer, action: 'speler_aangemaakt' });
      }

      // ── PUT — status of notities updaten ──
      case 'PUT': {
        const { id, status, notities } = req.body;
        if (!id) return res.status(400).json({ error: 'id vereist' });

        const player = await kv.get(`player:${id}`);
        if (!player) return res.status(404).json({ error: 'Speler niet gevonden' });

        if (status !== undefined) player.status = status;
        if (notities !== undefined) player.notities = notities;
        player.updatedAt = new Date().toISOString();

        await kv.set(`player:${id}`, player);
        return res.status(200).json({ success: true, player });
      }

      // ── DELETE ──
      case 'DELETE': {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id vereist' });

        await kv.del(`player:${id}`);
        await kv.srem('players:index', id);
        return res.status(200).json({ success: true, deleted: id });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Players API error:', err);
    return res.status(500).json({ error: 'Interne serverfout', message: err.message });
  }
}

// ── Helpers ──
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function verdictToStatus(verdict) {
  if (!verdict) return 'volgen';
  const v = verdict.toLowerCase();
  if (v.includes('ja') || v.includes('oppakken')) return 'oppakken';
  if (v.includes('nee') || v.includes('niet')) return 'afwijzen';
  return 'volgen';
}
