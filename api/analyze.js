module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const prompt =
      "Extrais les données de cette feuille d'audience judiciaire belge et retourne UNIQUEMENT ce JSON brut, sans markdown, sans explication.\n\n" +
      "REGLES CRITIQUES pour dem / def / avDem / avDef :\n\n" +
      "1. Il peut y avoir PLUSIEURS demandeurs ou defendeurs. Dans ce cas :\n" +
      '   - "dem" contient tous les demandeurs separes par " / "  ex: "DUPONT SA / MARTIN SRL"\n' +
      '   - "def" contient tous les defendeurs separes par " / "  ex: "DURAND / LEBLANC"\n\n' +
      '2. "avDem" et "avDef" doivent etre alignes position par position sur "dem" et "def" :\n' +
      '   - Un avocat par partie, separes par " / "\n' +
      '   - Si une partie n\'a PAS d\'avocat mentionne, mettre une chaine VIDE a sa position\n' +
      '   - Exemple : def = "SCIARRABBA BIANCA / MUTZHAGEN SRL"\n' +
      '               avDef = " / Me. ORBAN JUDITH"   (SCIARRABBA sans avocat, MUTZHAGEN avec)\n' +
      '   - Exemple : dem = "DUPONT / MARTIN"\n' +
      '               avDem = "Me. SMITH / Me. JONES"  (un avocat par demandeur)\n\n' +
      "3. conc = true si la reference commence par M/\n\n" +
      "4. Inclure TOUS les dossiers sans exception.\n\n" +
      "5. Les lignes sans 'Dem)' ou 'Def)' qui suivent une ligne de parties appartiennent au meme groupe.\n\n" +
      "Format JSON :\n" +
      '{"meta":{"tribunal":"...","division":"...","date":"...","heure":"...","juges":["..."]},' +
      '"sections":[{"section":"NOM SECTION","items":[{' +
      '"num":"1.1","ref":"A/26/00061","type":"...","conc":false,' +
      '"dem":"NOM1 / NOM2 si plusieurs",' +
      '"avDem":"Me NOM1 / (vide si absent) — aligne sur dem",' +
      '"def":"NOM1 / NOM2 si plusieurs",' +
      '"avDef":"Me NOM1 / (vide si absent) — aligne sur def"' +
      '}]}]}\n\n' +
      "FEUILLE D'AUDIENCE :\n" +
      content;

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
