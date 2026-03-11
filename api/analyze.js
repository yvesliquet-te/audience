module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Test : affiche si la clé est présente
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Clé API manquante', key: 'undefined' });

  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content }]
      })
    });

    const text = await response.text();
    // Renvoie la réponse brute pour diagnostic
    res.status(response.ok ? 200 : 500).json({ raw: text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
