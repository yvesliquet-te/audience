module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    // Tronquer si trop long (~14000 chars ≈ 4000 tokens de contexte sûr)
    const MAX = 14000;
    const truncated = content.length > MAX;
    const safeContent = truncated ? content.slice(0, MAX) + '\n[...tronqué]' : content;
    if (truncated) {
      console.warn(`Content truncated from ${content.length} to ${MAX} chars`);
    }

    const prompt =
      "Extrais les données de cette feuille d'audience judiciaire belge et retourne UNIQUEMENT ce JSON brut, sans markdown, sans explication.\n\n" +
      "REGLES CRITIQUES pour dem / def / avDem / avDef :\n\n" +
      "1. Il peut y avoir PLUSIEURS demandeurs ou defendeurs. Dans ce cas :\n" +
      '   - "dem" contient tous les demandeurs separes par " / "\n' +
      '   - "def" contient tous les defendeurs separes par " / "\n\n' +
      '2. "avDem" et "avDef" doivent etre alignes position par position sur "dem" et "def" :\n' +
      '   - Un avocat par partie, separes par " / "\n' +
      '   - Si une partie n\'a PAS d\'avocat mentionne, mettre une chaine VIDE a sa position\n' +
      '   - Exemple : def = "SCIARRABBA BIANCA / MUTZHAGEN SRL"\n' +
      '               avDef = " / Me. ORBAN JUDITH"\n' +
      "3. conc = true si la reference commence par M/\n\n" +
      "4. Inclure TOUS les dossiers sans exception.\n\n" +
      '{"meta":{"tribunal":"...","division":"...","date":"...","heure":"...","juges":["..."]},' +
      '"sections":[{"section":"NOM SECTION","items":[{' +
      '"num":"1.1","ref":"A/26/00061","type":"...","conc":false,' +
      '"dem":"NOM1 / NOM2","avDem":"Me NOM1 / (vide si absent)","def":"NOM1 / NOM2","avDef":"Me NOM1 / (vide si absent)"' +
      '}]}]}\n\n' +
      "FEUILLE D'AUDIENCE :\n" + safeContent;

    // Timeout de 55s (Vercel limite à 60s)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

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
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          system: "Tu es un extracteur de données JSON pour feuilles d'audience judiciaires belges. Tu réponds TOUJOURS et UNIQUEMENT avec du JSON brut valide, sans markdown, sans explication, sans refus.",
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    // Lire en texte brut d'abord
    const rawText = await apiResp.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error('Anthropic non-JSON response:', rawText.slice(0, 200));
      return res.status(502).json({ error: 'Réponse invalide de l\'API Anthropic. Réessayez.' });
    }

    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      console.error('Anthropic error:', msg);
      return res.status(500).json({ error: msg });
    }

    res.status(200).json(data);

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Délai dépassé — le texte est peut-être trop long. Essayez de le diviser en deux parties.' });
    }
    console.error('Handler error:', err.message);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
