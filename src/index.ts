export default {
  async fetch(request): Promise<Response> {
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
    
    // Helper function to validate origin
    function validateOrigin(origin) {
      if (!origin) return true; // Allow same-origin requests
      return ALLOWED_ORIGINS.includes(origin);
    }

    // Helper function to validate API URL
    function validateApiUrl(apiUrl) {
      if (!apiUrl) return false;
      
      try {
        const url = new URL(apiUrl);
        return ALLOWED_APIS.some(allowedApi => {
          const allowedUrl = new URL(allowedApi);
          return url.hostname === allowedUrl.hostname && 
                 url.protocol === allowedUrl.protocol;
        });
      } catch (e) {
        return false;
      }
    }

    // Helper function to get CORS headers for valid origins
    function getCorsHeaders(origin) {
      if (!origin || !validateOrigin(origin)) {
        return {}; // No CORS headers for invalid origins
      }
      
      return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      };
    }

    // Main request handler with security validations
    async function handleSecureRequest(request) {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      
      // Note: We don't reject requests based on origin here
      // CORS is browser-enforced - we just control header inclusion

      let apiUrl = url.searchParams.get("apiurl");
      
      // SECURITY: Validate target API URL
      if (!validateApiUrl(apiUrl)) {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'Target API not allowed',
          allowedApis: ALLOWED_APIS
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin)
          }
        });
      }

      // SECURITY: Prevent URL manipulation attacks
      try {
        new URL(apiUrl); // Validate URL format
      } catch (e) {
        return new Response(JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid API URL format'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin)
          }
        });
      }

      // SECURITY: Limit request size (prevent DoS)
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit
        return new Response(JSON.stringify({
          error: 'Request Too Large',
          message: 'Request body too large (max 1MB)'
        }), {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin)
          }
        });
      }

      try {
        // Create proxied request with security headers
        const proxyRequest = new Request(apiUrl, {
          method: request.method,
          headers: {
            // SECURITY: Don't forward potentially dangerous headers
            'Content-Type': request.headers.get('Content-Type') || 'application/json',
            'User-Agent': 'SecureCorsProxy/1.0',
            // Don't forward: Authorization, Cookie, Origin, Referer
          },
          body: request.body
        });

        // SECURITY: Set timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(proxyRequest, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        // SECURITY: Validate response size
        const responseSize = response.headers.get('content-length');
        if (responseSize && parseInt(responseSize) > 10 * 1024 * 1024) { // 10MB limit
          return new Response(JSON.stringify({
            error: 'Response Too Large',
            message: 'Response too large (max 10MB)'
          }), {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(origin)
            }
          });
        }

        // Create secure response with proper CORS headers
        const secureResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            // SECURITY: Only forward safe headers
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
            'Content-Length': response.headers.get('Content-Length') || '',
            ...getCorsHeaders(origin)
          }
        });

        return secureResponse;

      } catch (error) {
        if (error.name === 'AbortError') {
          return new Response(JSON.stringify({
            error: 'Gateway Timeout',
            message: 'Request timed out'
          }), {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
              ...getCorsHeaders(origin)
            }
          });
        }

        return new Response(JSON.stringify({
          error: 'Bad Gateway',
          message: 'Failed to fetch from target API'
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin)
          }
        });
      }
    }

    // Handle CORS preflight requests
    async function handleOptions(request) {
      const origin = request.headers.get('Origin');
      
      // SECURITY: Validate origin for preflight - different approach needed
      if (origin && !validateOrigin(origin)) {
        // For preflight requests from unauthorized origins, we should not provide CORS headers
        // The browser will block the actual request
        return new Response(null, {
          status: 200, // Don't return 403 - let CORS handle it
          headers: {
            // Intentionally no CORS headers - browser will block
          }
        });
      }

      const corsHeaders = getCorsHeaders(origin);
      
      if (request.headers.get("Access-Control-Request-Method") !== null) {
        // Handle CORS preflight
        return new Response(null, {
          headers: {
            ...corsHeaders,
            "Access-Control-Allow-Headers": 
              request.headers.get("Access-Control-Request-Headers") || "Content-Type"
          }
        });
      } else {
        // Handle standard OPTIONS
        return new Response(null, {
          headers: {
            Allow: "GET, HEAD, POST, OPTIONS",
            ...corsHeaders
          }
        });
      }
    }

    // Demo page with security information
    function getSecureDemoPage() {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Secure CORS Proxy</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .security-notice { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .allowed-list { background: #d4edda; border: 1px solid #c3e6cb; padding: 10px; border-radius: 3px; }
            .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            button { margin: 5px; padding: 8px 15px; background: #007cba; color: white; border: none; border-radius: 3px; cursor: pointer; }
            .result { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 3px; min-height: 20px; }
            .error { border-left: 4px solid #f44336; }
            .success { border-left: 4px solid #4CAF50; }
          </style>
        </head>
        <body>
          <h1>Secure CORS Proxy</h1>
          
          <div class="security-notice">
            <h3>Security Features:</h3>
            <ul>
              <li>Origin validation (no wildcard CORS)</li>
              <li>Target API whitelist (no open proxy)</li>
              <li>Request/response size limits</li>
              <li>Request timeout protection</li>
              <li>Header sanitization</li>
            </ul>
          </div>

          <div class="allowed-list">
            <h3>Allowed Origins:</h3>
            <ul>
              ${ALLOWED_ORIGINS.map(origin => `<li><code>${origin}</code></li>`).join('')}
            </ul>
            
            <h3>Allowed APIs:</h3>
            <ul>
              ${ALLOWED_APIS.map(api => `<li><code>${api}</code></li>`).join('')}
            </ul>
          </div>

          <div class="test-section">
            <h3>Test Secure Proxy</h3>
            <button onclick="testValidRequest()">Test Valid Request</button>
            <button onclick="testInvalidApi()">Test Invalid API (Should Fail)</button>
            <div id="test-result" class="result">Click buttons to test security</div>
          </div>

          <script>
            async function testValidRequest() {
              try {
                document.getElementById('test-result').innerHTML = 'Testing valid request...';
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
                const data = await response.json();
                document.getElementById('test-result').innerHTML = 
                  '<div class="success">Valid request succeeded: ' + JSON.stringify(data, null, 2) + '</div>';
              } catch (error) {
                document.getElementById('test-result').innerHTML = 
                  '<div class="error">Valid request failed: ' + error.message + '</div>';
              }
            }

            async function testInvalidApi() {
              try {
                document.getElementById('test-result').innerHTML = 'Testing invalid API...';
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://malicious-site.com/api');
                const data = await response.json();
                document.getElementById('test-result').innerHTML = 
                  '<div class="error">Security working - invalid API blocked: ' + JSON.stringify(data, null, 2) + '</div>';
              } catch (error) {
                document.getElementById('test-result').innerHTML = 
                  '<div class="success">Security working - request blocked: ' + error.message + '</div>';
              }
            }
          </script>
        </body>
        </html>
      `;
    }

    // Main routing logic
    const url = new URL(request.url);
    
    if (url.pathname.startsWith(PROXY_ENDPOINT)) {
      if (request.method === "OPTIONS") {
        return handleOptions(request);
      } else if (["GET", "HEAD", "POST", "PUT", "DELETE"].includes(request.method)) {
        return handleSecureRequest(request);
      } else {
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
      }
    } else {
      // Serve demo page
      return new Response(getSecureDemoPage(), {
        headers: {
          "Content-Type": "text/html;charset=UTF-8",
        },
      });
    }
  },
};
