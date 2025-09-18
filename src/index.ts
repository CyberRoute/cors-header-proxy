export default {
  async fetch(request) {
    const ALLOWED_ORIGINS = [
      'https://yourdomain.com',
      'https://app.yourdomain.com',
      'https://staging.yourdomain.com',
    ];

    const ALLOWED_APIS = [
      'https://httpbin.org',
      'https://api.example.com',
      'https://trusted-api.com',
    ];

    const RATE_LIMIT_PER_MINUTE = 60;
    const PROXY_ENDPOINT = "/corsproxy/";

    function validateOrigin(origin) {
      if (!origin) return true;
      return ALLOWED_ORIGINS.includes(origin);
    }

    function validateApiUrl(apiUrl) {
      if (!apiUrl) return false;
      try {
        const url = new URL(apiUrl);
        return ALLOWED_APIS.some(allowedApi => {
          const allowedUrl = new URL(allowedApi);
          return url.hostname === allowedUrl.hostname &&
                 url.protocol === allowedUrl.protocol;
        });
      } catch {
        return false;
      }
    }

    function getCorsHeaders(origin) {
      if (!origin || !validateOrigin(origin)) return {};
      return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      };
    }

    async function handleSecureRequest(request) {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      let apiUrl = url.searchParams.get("apiurl");

      if (!validateApiUrl(apiUrl)) {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'Target API not allowed',
          allowedApis: ALLOWED_APIS
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
        });
      }

      try { new URL(apiUrl); } catch {
        return new Response(JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid API URL format'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
        });
      }

      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 1024 * 1024) {
        return new Response(JSON.stringify({
          error: 'Request Too Large',
          message: 'Request body too large (max 1MB)'
        }), {
          status: 413,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
        });
      }

      try {
        const proxyRequest = new Request(apiUrl, {
          method: request.method,
          headers: {
            'Content-Type': request.headers.get('Content-Type') || 'application/json',
            'User-Agent': 'SecureCorsProxy/1.0',
          },
          body: request.body
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(proxyRequest, { signal: controller.signal });
        clearTimeout(timeoutId);

        const responseSize = response.headers.get('content-length');
        if (responseSize && parseInt(responseSize) > 10 * 1024 * 1024) {
          return new Response(JSON.stringify({
            error: 'Response Too Large',
            message: 'Response too large (max 10MB)'
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
          });
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
            'Content-Length': response.headers.get('Content-Length') || '',
            ...getCorsHeaders(origin)
          }
        });

      } catch (error) {
        if (error.name === 'AbortError') {
          return new Response(JSON.stringify({
            error: 'Gateway Timeout',
            message: 'Request timed out'
          }), {
            status: 504,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
          });
        }
        return new Response(JSON.stringify({
          error: 'Bad Gateway',
          message: 'Failed to fetch from target API'
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
        });
      }
    }

    async function handleOptions(request) {
      const origin = request.headers.get('Origin');
      if (origin && !validateOrigin(origin)) {
        return new Response(null, { status: 200 });
      }
      const corsHeaders = getCorsHeaders(origin);
      if (request.headers.get("Access-Control-Request-Method") !== null) {
        return new Response(null, {
          headers: {
            ...corsHeaders,
            "Access-Control-Allow-Headers": 
              request.headers.get("Access-Control-Request-Headers") || "Content-Type"
          }
        });
      } else {
        return new Response(null, {
          headers: {
            Allow: "GET, HEAD, POST, OPTIONS",
            ...corsHeaders
          }
        });
      }
    }

    function getSecureDemoPage() {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CORS Proxy Demo</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .instruction { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            button { margin: 5px; padding: 10px 20px; background: #007cba; color: white; border: none; border-radius: 3px; cursor: pointer; }
            .error-button { background: #dc3545; }
            .result { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 3px; min-height: 20px; font-family: monospace; font-size: 12px; }
            .success { border-left: 4px solid #4CAF50; background: #e8f5e8; }
            .error { border-left: 4px solid #f44336; background: #ffebee; }
          </style>
        </head>
        <body>
          <h1>CORS Proxy Demo</h1>
          <div class="instruction"><strong>Open DevTools (F12) and watch the Console tab!</strong></div>
          <p><strong>Allowed Origins:</strong> ${ALLOWED_ORIGINS.join(', ')}</p>
          <p><strong>Allowed APIs:</strong> ${ALLOWED_APIS.join(', ')}</p>
          <!-- your full test buttons and JS go here (unchanged) -->
        </body>
        </html>
      `;
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith(PROXY_ENDPOINT)) {
      if (request.method === "OPTIONS") return handleOptions(request);
      if (["GET", "HEAD", "POST", "PUT", "DELETE"].includes(request.method)) {
        return handleSecureRequest(request);
      }
      return new Response(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only GET, HEAD, POST, PUT, DELETE methods allowed'
      }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'GET, HEAD, POST, PUT, DELETE, OPTIONS'
        }
      });
    } else {
      return new Response(getSecureDemoPage(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
  }
};
