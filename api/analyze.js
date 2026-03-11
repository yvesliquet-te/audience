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

RÈGLES CRITIQUES pour dem / def / avDem / avDef :

1. Il peut y avoir PLUSIEURS demandeurs ou défendeurs. Dans ce cas :
   - "dem" contient tous les demandeurs séparés par " / "  ex: "DUPONT SA / MARTIN SRL"
   - "def" contient tous les défendeurs séparés par " / "  ex: "DURAND / LEBLANC"

2. "avDem" et "avDef" doivent être alignés position par position sur "dem" et "def" :
   - Un avocat par partie, séparés par " / "
   - Si une partie n'a PAS d'avocat mentionné, mettre une chaîne VIDE à sa position
   - Exemple : def = "SCIARRABBA BIANCA / MUTZHAGEN SRL"
               avDef = " / Me. ORBAN JUDITH"   ← SCIARRABBA sans avocat, MUTZHAGEN avec
   - Exemple : dem = "DUPONT / MARTIN"
               avDem = "Me. SMITH / Me. JONES"  ← un avocat par demandeur

3. conc = true si la référence commence par M/

4. Inclure TOUS les dossiers sans exception.

5. Les lignes sans "Dem)" ou "Déf)" qui suivent une ligne de parties appartiennent au même groupe.

Format JSON :
{
  "meta": {"tribunal":"...","division":"...","date":"...","heure":"...","juges":["..."]},
  "sections": [{"section":"NOM SECTION","items":[{
    "num":"1.1",
    "ref":"A/26/00061",
    "type":"...",
    "conc": false,
    "dem": "NOM1 / NOM2 si plusieurs",
    "avDem": "Me NOM1 / Me NOM2 (vide si absent, aligné sur dem)",
    "def": "NOM1 / NOM2 si plusieurs",
    "avDef": "Me NOM1 / Me NOM2 (vide si absent, aligné sur def)"
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
