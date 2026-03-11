module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const prompt = `Extrais les données de cette feuille d'audience judiciaire belge et retourne UNIQUEMENT ce JSON brut, sans markdown, sans explication.

RÈGLES IMPORTANTES :
- "dem" et "def" peuvent contenir PLUSIEURS parties séparées par " / "
- Exemple : si on voit "Déf) SCIARRABBA BIANCA" suivi de "MUTZHAGEN SRL - Me. ORBAN JUDITH" sur la ligne suivante (sans "Déf)"), ce sont deux défendeurs : def = "SCIARRABBA BIANCA / MUTZHAGEN SRL"
- "avDem" et "avDef" : prendre le dernier avocat mentionné (celui du dernier défendeur/demandeur si plusieurs)
- conc = true si la référence commence par M/
- Inclure TOUS les dossiers sans exception

Format JSON attendu :
{
  "meta": {"tribunal":"...","division":"...","date":"...","heure":"...","juges":["..."]},
  "sections": [{"section":"NOM SECTION","items":[{
    "num":"1.1",
    "ref":"A/26/00061",
    "type":"description courte",
    "conc": false,
    "dem": "NOM DEMANDEUR ou NOM1 / NOM2 si plusieurs",
    "avDem": "Me NOM ou vide",
    "def": "NOM DÉFENDEUR ou NOM1 / NOM2 si plusieurs",
    "avDef": "Me NOM ou vide"
  }]}]
}

FEUILLE D'AUDIENCE :
${content}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
