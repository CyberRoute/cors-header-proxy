export default {
  async fetch(request): Promise<Response> {
    // SECURITY: Define allowed origins (no wildcards!)
    const ALLOWED_ORIGINS = [
      'https://yourdomain.com',
      'https://app.yourdomain.com',
      'https://staging.yourdomain.com',
      // Add your legitimate domains here
    ];

    // SECURITY: Define allowed target APIs (no open proxy!)
    const ALLOWED_APIS = [
      'https://httpbin.org',
      'https://api.example.com',
      'https://trusted-api.com',
      // Only add APIs you trust and need to proxy
    ];

    // SECURITY: Define rate limiting (optional but recommended)
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

    // Demo page with simple CORS demonstrations
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

          <script>
            async function testValid() {
              try {
                document.getElementById('valid-result').innerHTML = 'Testing...';
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
                const data = await response.json();
                document.getElementById('valid-result').innerHTML = 
                  'SUCCESS: Request worked\\n' + JSON.stringify(data, null, 2);
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
                  document.getElementById('invalid-result').innerHTML = 
                    'SUCCESS: API correctly blocked\\n' + JSON.stringify(data, null, 2);
                  document.getElementById('invalid-result').className = 'result success';
                } else {
                  document.getElementById('invalid-result').innerHTML = 
                    'WARNING: API was not blocked!\\n' + JSON.stringify(data, null, 2);
                  document.getElementById('invalid-result').className = 'result error';
                }
              } catch (error) {
                document.getElementById('invalid-result').innerHTML = 'ERROR: ' + error.message;
                document.getElementById('invalid-result').className = 'result error';
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
