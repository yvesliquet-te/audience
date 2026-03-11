module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content, docxBase64 } = req.body;
    let texte = content;

    if (docxBase64) {
      const mammoth = require('mammoth');
      const buffer = Buffer.from(docxBase64, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      texte = result.value;
    }

    if (!texte) return res.status(400).json({ error: 'Contenu manquant' });

    const prompt = `Extrais les données de cette feuille d'audience judiciaire belge et retourne UNIQUEMENT ce JSON brut, sans markdown, sans explication :
{
  "meta":{"tribunal":"...","division":"...","date":"...","heure":"...","juges":["..."]},
  "sections":[{"section":"NOM","items":[{"num":"1.1","ref":"A/26/00061","type":"...","conc":false,"dem":"...","avDem":"Me NOM ou vide","def":"...","avDef":"Me NOM ou vide"}]}]
}
Règles : conc=true si ref commence par M/ — avDem/avDef : "Me NOM" si avocat mentionné sinon "" — inclure TOUS les dossiers.

FEUILLE :
${texte}`;

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
