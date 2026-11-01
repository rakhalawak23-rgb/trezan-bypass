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
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    // -------------------------------------------------------------
    // LOKAL ENGINE KHUSUS SFL.GL / ADLINKFLY
    // -------------------------------------------------------------
    if (targetUrl.includes('sfl.gl') || targetUrl.includes('sfl.ink')) {
      // Step 1: Ambil halaman awal + simpan Cookie sesi
      const getRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const html = await getRes.text();
      const rawCookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : [getRes.headers.get('set-cookie') || ''];
      const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

      // Step 2: Ekstrak Form Action dan Token tersembunyi dari AdLinkFly HTML
      const formActionMatch = html.match(/<form[^>]*id=["']go-link["'][^>]*action=["']([^"']+)["']/i) ||
                              html.match(/<form[^>]*action=["']([^"']*\/links\/go[^"']*)["']/i);
      
      // Cek apakah ada token CSRF
      const csrfTokenMatch = html.match(/name=["']_csrfToken["'][^>]*value=["']([^"']+)["']/i) ||
                             html.match(/"_csrfToken"\s*:\s*"([^"]+)"/i);
      
      // Ekstrak semua input tersembunyi
      const formData = new URLSearchParams();
      const inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi;
      let match;
      while ((match = inputRegex.exec(html)) !== null) {
        formData.append(match[1], match[2]);
      }

      if (formActionMatch) {
        let postUrl = formActionMatch[1];
        if (!postUrl.startsWith('http')) {
          const origin = new URL(targetUrl).origin;
          postUrl = origin + (postUrl.startsWith('/') ? '' : '/') + postUrl;
        }

        // Step 3: Kirim POST Request AJAX layaknya klik tombol "Get Link"
        const postHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': targetUrl,
          'Cookie': cookieHeader
        };

        if (csrfTokenMatch) {
          postHeaders['X-CSRF-Token'] = csrfTokenMatch[1];
        }

        const postRes = await fetch(postUrl, {
          method: 'POST',
          headers: postHeaders,
          body: formData.toString()
        });

        if (postRes.ok) {
          const jsonResult = await postRes.json();
          // Sfl.gl akan mengembalikan JSON berisi key "url"
          if (jsonResult && jsonResult.url) {
            return res.status(200).json({
              success: true,
              destinationUrl: jsonResult.url,
              method: 'Sfl.gl Engine (AdLinkFly Token Bypass)'
            });
          }
        }
      }
    }

    // -------------------------------------------------------------
    // FALLBACK ENGINE (Jika Sfl.gl butuh Bypass API Eksternal)
    // -------------------------------------------------------------
    const bypassApiUrl = `https://api.bypass.vip/bypass?url=${encodeURIComponent(targetUrl)}`;
    const apiRes = await fetch(bypassApiUrl);
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      if (apiData.status === 'success' && apiData.destination) {
        return res.status(200).json({
          success: true,
          destinationUrl: apiData.destination,
          method: 'Bypass API Resolver'
        });
      }
    }

    // Jika gagal
    return res.status(400).json({
      success: false,
      error: 'Gagal mengekstrak link sfl.gl. Token kadaluarsa atau terhalang proteksi CAPTCHA.'
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal Error: ' + err.message });
  }
}
