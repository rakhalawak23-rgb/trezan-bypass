// api/bypass.js
export default async function handler(req, res) {
  // Izinkan permintaan CORS dari frontend Anda
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parameter URL wajib diisi' });
  }

  try {
    // 1. Contoh logika ikuti redirect HTTP
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const targetUrl = response.url; // URL hasil pengalihan akhir

    return res.status(200).json({
      success: true,
      originalUrl: url,
      destinationUrl: targetUrl
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Gagal melakukan bypass: ' + err.message
    });
  }
}
