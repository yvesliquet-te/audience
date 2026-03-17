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

    const prompt = `Extrais les dossiers de cette feuille d'audience judiciaire belge. Retourne UNIQUEMENT du JSON brut valide, sans markdown.

FORMAT:
{"meta":{"tribunal":"","division":"","date":"","heure":"","juges":[]},"sections":[{"section":"NOM","items":[{"num":"1.1","ref":"A/26/00001","type":"","conc":false,"dem":"NOM DEM 1 / NOM DEM 2","avDem":"Me X / ","def":"NOM DEF 1 / NOM DEF 2","avDef":" / Me Y"}]}]}

RÈGLES STRICTES:
1. dem = TOUS les demandeurs séparés par " / " (côté qui INTRODUIT l'action, qui POURSUIT)
2. def = TOUS les défendeurs séparés par " / " (côté qui est ASSIGNÉ, qui SE DÉFEND)
3. Dans une feuille belge: le demandeur est indiqué en premier, le défendeur après "c/" ou "contre"
4. avDem/avDef: UN avocat par partie, alignés position par position avec dem/def
   - Si une partie n'a pas d'avocat: mettre une chaîne VIDE à cette position
   - Exemple: dem="DUPONT / MARTIN SA", avDem="Me ADAM / " (MARTIN SA sans avocat)
5. conc=true si la référence commence par M/
6. Inclure ABSOLUMENT TOUS les dossiers sans exception

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
          system: "Tu es un extracteur JSON pour feuilles d'audience judiciaires belges. Le demandeur (dem) est la partie qui INTRODUIT l'action. Le défendeur (def) est la partie ASSIGNÉE. Réponds UNIQUEMENT avec du JSON brut valide, sans markdown, sans texte autour.",
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
      return res.status(502).json({ error: "Réponse invalide de l'API. Réessayez." });
    }

    if (data.error) {
      return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    }

    const modelText = (data.content || []).map(i => i.text || '').join('').trim();
    const cleaned = modelText.replace(/^[\s\S]*?(\{)/, '$1').replace(/\}[^}]*$/, '}').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch(e) {
      return res.status(422).json({
        error: 'JSON invalide: ' + e.message,
        debug_raw: modelText.slice(0, 800),
        stop_reason: data.stop_reason
      });
    }

    res.status(200).json(data);

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Délai dépassé. Divisez la feuille en deux parties.' });
    }
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
