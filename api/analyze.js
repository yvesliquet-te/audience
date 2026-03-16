// v2 — claude-haiku (rapide) + prompt compact + vercel.json maxDuration:60
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const MAX = 18000;
    const safeContent = content.length > MAX ? content.slice(0, MAX) + '\n[...tronqué]' : content;

    const prompt = `Extrais les dossiers de cette feuille d'audience belge. JSON brut uniquement, sans markdown.

Format exact:
{"meta":{"tribunal":"","division":"","date":"","heure":"","juges":[]},"sections":[{"section":"","items":[{"num":"1.1","ref":"","type":"","conc":false,"dem":"NOM1 / NOM2","avDem":"Me X / ","def":"NOM","avDef":"Me Y"}]}]}

Règles:
- dem/def: plusieurs parties séparées par " / "
- avDem/avDef: alignés position par position, chaîne vide si pas d'avocat
- conc=true si ref commence par M/
- Tous les dossiers sans exception

FEUILLE:
${safeContent}`;

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 55000);

    let apiResp;
    try {
      apiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8000,
          system: "Tu es un extracteur JSON pour feuilles d'audience judiciaires belges. Réponds UNIQUEMENT avec du JSON brut valide, sans markdown, sans texte autour.",
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(tid);
    }

    const rawText = await apiResp.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error('Non-JSON:', rawText.slice(0, 300));
      return res.status(502).json({ error: "Réponse invalide de l'API. Réessayez." });
    }

    if (data.error) {
      return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    }

    res.status(200).json(data);

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Délai dépassé (55s). Divisez la feuille en deux parties et analysez-les séparément.' });
    }
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
