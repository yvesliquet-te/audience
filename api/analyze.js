const https = require('https');

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(55000, () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const MAX = 22000;
    const safeContent = content.length > MAX ? content.slice(0, MAX) + '\n[...tronqué]' : content;

    const prompt = `Extrais les dossiers de cette feuille d'audience judiciaire belge. Retourne UNIQUEMENT du JSON brut valide, sans markdown, sans texte autour.

FORMAT:
{"meta":{"tribunal":"","division":"","date":"","heure":"","juges":[]},"sections":[{"section":"NOM","items":[{"num":"1.1","ref":"A/26/00001","type":"","conc":false,"dem":"NOM DEM 1 / NOM DEM 2","avDem":"Me X / ","def":"NOM DEF 1 / NOM DEF 2","avDef":" / Me Y"}]}]}

REGLES STRICTES:
1. dem = TOUS les demandeurs separes par " / " (cote qui INTRODUIT l'action, qui POURSUIT)
2. def = TOUS les defendeurs separes par " / " (cote qui est ASSIGNE, qui SE DEFEND)
3. Dans une feuille belge: le demandeur est indique en premier, le defendeur apres "c/" ou "contre"
4. avDem/avDef: UN avocat par partie, alignes position par position avec dem/def. Chaine vide si pas d'avocat.
5. conc=true si la reference commence par M/
6. Inclure ABSOLUMENT TOUS les dossiers sans exception

FEUILLE:
${safeContent}`;

    const bodyStr = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: "Tu es un extracteur JSON pour feuilles d'audience judiciaires belges. Le demandeur (dem) est la partie qui INTRODUIT l'action. Le defendeur (def) est la partie ASSIGNEE. Reponds UNIQUEMENT avec du JSON brut valide, sans markdown, sans texte autour.",
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    let result;
    try {
      result = await httpsPost(options, bodyStr);
    } catch (err) {
      if (err.message === 'timeout') {
        return res.status(504).json({ error: 'Delai depasse. Divisez la feuille en deux parties.' });
      }
      throw err;
    }

    let data;
    try {
      data = JSON.parse(result.body);
    } catch (e) {
      return res.status(502).json({ error: "Reponse invalide de l'API. Reessayez." });
    }

    if (data.error) {
      return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    }

    const modelText = (data.content || []).map(i => i.text || '').join('').trim();
    const cleaned = modelText.replace(/^[\s\S]*?(\{)/, '$1').replace(/\}[^}]*$/, '}').trim();

    try {
      JSON.parse(cleaned); // validation
    } catch (e) {
      return res.status(422).json({
        error: 'JSON invalide: ' + e.message,
        debug_raw: modelText.slice(0, 800),
        stop_reason: data.stop_reason
      });
    }

    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
};
