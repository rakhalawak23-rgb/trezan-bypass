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

    // 1. CEK PARAMETER DIRECT / BASE64 ENCODED
    try {
      const parsed = new URL(cleanUrl);
      const possibleParams = ['url', 'dest', 'target', 'link', 'go', 'r', 'out'];
      for (const p of possibleParams) {
        const val = parsed.searchParams.get(p);
        if (val) {
          try {
            const decoded = Buffer.from(val, 'base64').toString('utf-8');
            if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
              return res.status(200).json({ success: true, destinationUrl: decoded, method: 'Base64 Parameter' });
            }
          } catch (e) {}
          if (val.startsWith('http://') || val.startsWith('https://')) {
            return res.status(200).json({ success: true, destinationUrl: val, method: 'Direct Parameter' });
          }
        }
      }
    } catch (e) {}

    // 2. MULTI-PROVIDER BYPASS CLUSTER
    const providers = [
      // Node A: Bypass VIP Solver
      async () => {
        const r = await fetch(`https://api.bypass.vip/bypass?url=${encodeURIComponent(cleanUrl)}`);
        if (!r.ok) return null;
        const data = await r.json();
        if (data.status === 'success' && data.destination && !data.destination.includes('sfl.gl') && !data.destination.includes('sfl.ink')) {
          return data.destination;
        }
        return null;
      },
      // Node B: Bypass City Solver
      async () => {
        const r = await fetch(`https://bypass.city/api/bypass?url=${encodeURIComponent(cleanUrl)}`);
        if (!r.ok) return null;
        const data = await r.json();
        if (data.destination && !data.destination.includes('sfl.gl') && !data.destination.includes('sfl.ink')) {
          return data.destination;
        }
        return null;
      },
      // Node C: AdLinkFly Native CSRF Token Solver
      async () => {
        const getRes = await fetch(cleanUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        const html = await getRes.text();
        
        const formActionMatch = html.match(/<form[^>]*id=["']go-link["'][^>]*action=["']([^"']+)["']/i) ||
                                html.match(/<form[^>]*action=["']([^"']*\/links\/go[^"']*)["']/i);
        const csrfMatch = html.match(/name=["']_csrfToken["'][^>]*value=["']([^"']+)["']/i);
        
        if (formActionMatch) {
          let postUrl = formActionMatch[1];
          if (!postUrl.startsWith('http')) {
            const origin = new URL(cleanUrl).origin;
            postUrl = origin + (postUrl.startsWith('/') ? '' : '/') + postUrl;
          }
          const formData = new URLSearchParams();
          const inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi;
          let m;
          while ((m = inputRegex.exec(html)) !== null) {
            formData.append(m[1], m[2]);
          }
          
          const rawCookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : [getRes.headers.get('set-cookie') || ''];
          const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

          const postRes = await fetch(postUrl, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': cleanUrl,
              'Cookie': cookieHeader,
              ...(csrfMatch ? { 'X-CSRF-Token': csrfMatch[1] } : {})
            },
            body: formData.toString()
          });

          if (postRes.ok) {
            const j = await postRes.json();
            if (j && j.url && !j.url.includes('sfl.gl') && !j.url.includes('sfl.ink')) return j.url;
          }
        }
        return null;
      }
    ];

    // Eksekusi provider berurutan
    for (const provider of providers) {
      try {
        const dest = await provider();
        if (dest && dest.startsWith('http')) {
          return res.status(200).json({
            success: true,
            destinationUrl: dest
          });
        }
      } catch (e) {
        // Lanjut ke resolver berikutnya jika gagal
      }
    }

    return res.status(400).json({
      success: false,
      error: 'Gagal mengekstrak URL asli. Link sfl.gl ini terproteksi CAPTCHA aktif.'
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server Error: ' + err.message });
  }
      }
