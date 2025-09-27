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
      const apiUrl = url.searchParams.get("apiurl");

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
      return `<!DOCTYPE html>
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
<div class="instruction">
<strong>Open Developer Tools (F12) and watch the Console tab to see CORS errors!</strong>
</div>

<p><strong>Allowed Origins:</strong> ${ALLOWED_ORIGINS.join(', ')}</p>
<p><strong>Allowed APIs:</strong> ${ALLOWED_APIS.join(', ')}</p>

<div class="test-section">
<h3>Test 1: Valid Request (Should Work)</h3>
<button onclick="testValid()">Test Valid API Request</button>
<div id="valid-result" class="result">Click to test allowed API</div>
</div>

<div class="test-section">
<h3>Test 2: Invalid API (Should Return 403)</h3>
<button class="error-button" onclick="testInvalid()">Test Blocked API Request</button>
<div id="invalid-result" class="result">Click to test blocked API</div>
</div>

<div class="test-section">
<h3>Test 3: Real CORS Error (Browser Console)</h3>
<p><strong>To see actual CORS blocking:</strong></p>
<ol>
<li>Go to any other website (google.com, github.com, etc.)</li>
<li>Open Developer Tools (F12) → Console tab</li>
<li>Paste this code:</li>
</ol>
<div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; margin: 10px 0; font-family: monospace; font-size: 12px; overflow-x: auto;">
fetch('" + location.origin + "/corsproxy/?apiurl=https://httpbin.org/get').catch(console.error)
</div>
<p>You'll see: <em>"Access to fetch... has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present"</em></p>
<button onclick="copyConsoleCode()">📋 Copy Console Code</button>
<div id="cors-result" class="result">Click to copy the console test code</div>
</div>

<script>
async function testValid() {
  try {
    document.getElementById('valid-result').innerHTML = 'Testing...';
    const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
    const data = await response.json();
    document.getElementById('valid-result').innerHTML = 'SUCCESS: Request worked' + String.fromCharCode(10) + JSON.stringify(data, null, 2);
    document.getElementById('valid-result').className = 'result success';
  } catch (error) {
    document.getElementById('valid-result').innerHTML = 'ERROR: ' + error.message;
    document.getElementById('valid-result').className = 'result error';
  }
}

async function testInvalid() {
  try {
    document.getElementById('invalid-result').innerHTML = 'Testing...';
    const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://blocked-api.com/data');
    const data = await response.json();
    if (response.status === 403) {
      document.getElementById('invalid-result').innerHTML = 'SUCCESS: API correctly blocked' + String.fromCharCode(10) + JSON.stringify(data, null, 2);
      document.getElementById('invalid-result').className = 'result success';
    } else {
      document.getElementById('invalid-result').innerHTML = 'WARNING: API was not blocked!' + String.fromCharCode(10) + JSON.stringify(data, null, 2);
      document.getElementById('invalid-result').className = 'result error';
    }
  } catch (error) {
    document.getElementById('invalid-result').innerHTML = 'ERROR: ' + error.message;
    document.getElementById('invalid-result').className = 'result error';
  }
}

function copyConsoleCode() {
  const code = "fetch('" + location.origin + "/corsproxy/?apiurl=https://httpbin.org/get').catch(console.error)";

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(code).then(() => {
      document.getElementById('cors-result').innerHTML = '✅ Code copied to clipboard!\\n\\nNow:\\n1. Go to any other website\\n2. Open DevTools (F12)\\n3. Paste in Console tab\\n4. See the CORS error!';
      document.getElementById('cors-result').className = 'result success';
    }).catch(() => {
      showCodeManually(code);
    });
  } else {
    showCodeManually(code);
  }
}

function showCodeManually(code) {
  document.getElementById('cors-result').innerHTML = 'Copy this code manually:\\n\\n' + code + '\\n\\nThen:\\n1. Go to any other website\\n2. Open DevTools (F12)\\n3. Paste in Console tab\\n4. See the CORS error!';
  document.getElementById('cors-result').className = 'result success';
}
</script>
</body>
</html>`;
    }

    const url = new URL(request.url);
    
    // Add test endpoint to simulate curl behavior
    if (url.pathname === '/test-cors') {
      const simulatedOrigin = url.searchParams.get('origin') || 'https://evil-site.com';
      
      // Make internal request to our own proxy with simulated origin
      const testRequest = new Request(url.origin + '/corsproxy/?apiurl=https://httpbin.org/get', {
        headers: {
          'Origin': simulatedOrigin
        }
      });
      
      const response = await handleSecureRequest(testRequest);
      const responseText = await response.text();
      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      
      return new Response(JSON.stringify({
        simulatedOrigin: simulatedOrigin,
        corsHeaderPresent: !!corsHeader,
        corsHeaderValue: corsHeader || 'None',
        responseStatus: response.status,
        demonstration: corsHeader ? 
          'This origin would be allowed by browsers' : 
          'This origin would be blocked by browsers (no CORS headers)'
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
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
