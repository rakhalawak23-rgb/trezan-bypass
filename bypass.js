// api/bypass.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: 'Parameter URL wajib diisi.' });
  }

  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const parsedUrl = new URL(cleanUrl);

    // 1. CEK PARAMETER QUERY (sfl.gl sering menyembunyikan URL di query Base64)
    const possibleParams = ['url', 'dest', 'target', 'link', 'go', 'r', 'out'];
    for (const param of possibleParams) {
      const val = parsedUrl.searchParams.get(param);
      if (val) {
        // Cek dekode Base64
        try {
          const decoded = Buffer.from(val, 'base64').toString('utf-8');
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
            return res.status(200).json({ success: true, destinationUrl: decoded, method: 'Query Base64' });
          }
        } catch (e) {}

        // Cek URL standar
        if (val.startsWith('http://') || val.startsWith('https://')) {
          return res.status(200).json({ success: true, destinationUrl: val, method: 'Query Parameter' });
        }
      }
    }

    // 2. FETCH ISI HALAMAN & ANALISIS KODE JAVASCRIPT / META REFRESH
    const response = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    });

    const finalFetchUrl = response.url;
    const htmlText = await response.text();

    // 2a. Cari URL pengalihan di dalam JavaScript (window.location / location.replace)
    const jsLocationMatch = htmlText.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i) ||
                            htmlText.match(/location\.replace\(["']([^"']+)["']\)/i);
    if (jsLocationMatch && jsLocationMatch[1] && jsLocationMatch[1].startsWith('http')) {
      return res.status(200).json({ success: true, destinationUrl: jsLocationMatch[1], method: 'JS Redirect Pattern' });
    }

    // 2b. Cari pengalihan Meta Refresh
    const metaRefreshMatch = htmlText.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
    if (metaRefreshMatch && metaRefreshMatch[1]) {
      return res.status(200).json({ success: true, destinationUrl: metaRefreshMatch[1], method: 'Meta Refresh' });
    }

    // 2c. Cek jika HTTP Redirect berhasil pindah ke domain luar
    if (finalFetchUrl && finalFetchUrl !== cleanUrl && !finalFetchUrl.includes('sfl.gl') && !finalFetchUrl.includes('sfl.ink')) {
      return res.status(200).json({ success: true, destinationUrl: finalFetchUrl, method: 'HTTP Redirect' });
    }

    // 3. FALLBACK RESOLVER: Memanggil Unshortener API Publik
    const fallbackRes = await fetch(`https://unshorten.me/json/${encodeURIComponent(cleanUrl)}`);
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      if (fallbackData.resolved_url && fallbackData.resolved_url !== cleanUrl && !fallbackData.resolved_url.includes('sfl.gl')) {
        return res.status(200).json({ success: true, destinationUrl: fallbackData.resolved_url, method: 'Unshortener Engine' });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'Tidak dapat mengekstrak URL. Link ini dilindungi oleh CAPTCHA/Turnstile atau iklan wajib.'
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Gagal memproses link: ' + err.message });
  }
}
