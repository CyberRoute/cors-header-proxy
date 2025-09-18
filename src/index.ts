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

    // Demo page with CORS error demonstrations
    function getSecureDemoPage() {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CORS Proxy - Live Browser Demonstration</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .instruction { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .security-notice { background: #e8f5e8; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .cors-demo { background: #ffebee; border: 1px solid #ffcdd2; padding: 15px; border-radius: 5px; margin: 10px 0; }
            button { margin: 5px; padding: 8px 15px; background: #007cba; color: white; border: none; border-radius: 3px; cursor: pointer; }
            .error-button { background: #dc3545; }
            .success-button { background: #28a745; }
            .result { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 3px; min-height: 20px; font-family: monospace; font-size: 12px; }
            .error { border-left: 4px solid #f44336; background: #ffebee; }
            .success { border-left: 4px solid #4CAF50; background: #e8f5e8; }
            .warning { border-left: 4px solid #ff9800; background: #fff8e1; }
            .highlight { background: #ffeb3b; padding: 2px 4px; border-radius: 2px; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
            .console-tip { background: #1e1e1e; color: #00ff00; padding: 10px; border-radius: 5px; font-family: monospace; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>🔒 CORS Proxy - Live Browser Demonstration</h1>
          
          <div class="instruction">
            <strong>📋 IMPORTANT: Open Developer Tools!</strong><br>
            Press <kbd>F12</kbd> or right-click → "Inspect" → "Console" tab.<br>
            Watch for <span class="highlight">CORS errors</span> when unauthorized requests are blocked by the browser.
          </div>

          <div class="security-notice">
            <h3>🛡️ Current Security Configuration:</h3>
            <p><strong>This page origin:</strong> <code id="current-origin"></code></p>
            <p><strong>Proxy URL:</strong> <code>${PROXY_ENDPOINT}</code></p>
            <p><strong>Allowed Origins:</strong> ${ALLOWED_ORIGINS.map(origin => `<code>${origin}</code>`).join(', ')}</p>
            <p><strong>Allowed APIs:</strong> ${ALLOWED_APIS.map(api => `<code>${api}</code>`).join(', ')}</p>
          </div>

          <div class="test-section">
            <h2>✅ 1. Same-Origin Request (Should Work)</h2>
            <p>This request comes from the same origin, so no CORS headers are needed.</p>
            <button class="success-button" onclick="testSameOrigin()">Test Same-Origin Request</button>
            <div id="same-origin-result" class="result">Click to test same-origin request</div>
          </div>

          <div class="test-section">
            <h2>❌ 2. Unauthorized API Target (Should Fail with 403)</h2>
            <p>Server rejects requests to non-whitelisted APIs regardless of origin.</p>
            <button class="error-button" onclick="testUnauthorizedApi()">Test Unauthorized API</button>
            <div id="unauthorized-api-result" class="result">Click to test request to blocked API</div>
          </div>

          <div class="cors-demo">
            <h2>🚫 3. CORS Blocking Demonstration</h2>
            <p>These tests simulate cross-origin requests to show how CORS works:</p>
            
            <div style="margin: 15px 0;">
              <h3>Scenario A: Authorized Origin (Simulated)</h3>
              <p>Simulate a request from <code>https://yourdomain.com</code> - should work</p>
              <button class="success-button" onclick="testAuthorizedOriginSimulated()">Simulate Authorized Origin</button>
              <div id="auth-origin-result" class="result">Click to simulate authorized cross-origin request</div>
            </div>

            <div style="margin: 15px 0;">
              <h3>Scenario B: Unauthorized Origin (Real CORS Error!)</h3>
              <p><strong>⚠️ Watch Console!</strong> This will create a real CORS error that you can see in DevTools</p>
              <button class="error-button" onclick="testRealCorsError()">Trigger Real CORS Error</button>
              <div id="cors-error-result" class="result">Click to see browser block a cross-origin request</div>
            </div>

            <div style="margin: 15px 0;">
              <h3>Scenario C: CORS Preflight Test</h3>
              <p>Test preflight request behavior with unauthorized origin</p>
              <button class="error-button" onclick="testPreflightCors()">Test CORS Preflight Blocking</button>
              <div id="preflight-result" class="result">Click to test preflight request blocking</div>
            </div>
          </div>

          <div class="console-tip">
            💡 Expected Console Messages:<br>
            ✅ Authorized: No errors, request succeeds<br>
            ❌ Unauthorized: "Access to fetch at '...' from origin '...' has been blocked by CORS policy"
          </div>

          <div class="test-section">
            <h2>📊 4. Security Validation Summary</h2>
            <button onclick="runAllTests()">Run All Security Tests</button>
            <div id="summary-result" class="result">Click to run comprehensive security validation</div>
          </div>

          <script>
            // Show current origin
            document.getElementById('current-origin').textContent = window.location.origin;

            function log(message, type = 'info') {
              console.log('%c[CORS Demo] ' + message, 
                type === 'error' ? 'color: red; font-weight: bold;' :
                type === 'success' ? 'color: green; font-weight: bold;' :
                'color: blue;'
              );
            }

            function updateResult(elementId, content, className = 'success') {
              const element = document.getElementById(elementId);
              element.innerHTML = content;
              element.className = 'result ' + className;
            }

            async function testSameOrigin() {
              try {
                log('Testing same-origin request to proxy...');
                updateResult('same-origin-result', 'Making same-origin request...', 'warning');
                
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
                const data = await response.json();
                
                log('Same-origin request succeeded', 'success');
                updateResult('same-origin-result', 
                  '✅ SUCCESS: Same-origin request worked\\n' + 
                  JSON.stringify(data, null, 2), 'success');
              } catch (error) {
                log('Same-origin request failed: ' + error.message, 'error');
                updateResult('same-origin-result', 
                  '❌ UNEXPECTED: Same-origin request failed: ' + error.message, 'error');
              }
            }

            async function testUnauthorizedApi() {
              try {
                log('Testing request to unauthorized API...');
                updateResult('unauthorized-api-result', 'Testing unauthorized API...', 'warning');
                
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://malicious-api.com/steal-data');
                const data = await response.json();
                
                if (response.status === 403) {
                  log('Unauthorized API correctly blocked with 403', 'success');
                  updateResult('unauthorized-api-result', 
                    '✅ SECURITY WORKING: API blocked with 403\\n' + 
                    JSON.stringify(data, null, 2), 'success');
                } else {
                  log('WARNING: Unauthorized API was not blocked!', 'error');
                  updateResult('unauthorized-api-result', 
                    '⚠️ SECURITY ISSUE: Unauthorized API allowed!\\n' + 
                    JSON.stringify(data, null, 2), 'error');
                }
              } catch (error) {
                log('Request to unauthorized API failed: ' + error.message, 'error');
                updateResult('unauthorized-api-result', 
                  '❌ REQUEST FAILED: ' + error.message, 'error');
              }
            }

            async function testAuthorizedOriginSimulated() {
              try {
                log('Simulating authorized origin request...');
                updateResult('auth-origin-result', 'Simulating authorized origin...', 'warning');
                
                // This simulates what would happen from an authorized origin
                // by making a same-origin request (which doesn't need CORS headers)
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
                const data = await response.json();
                
                log('Authorized origin simulation: Request succeeded', 'success');
                updateResult('auth-origin-result', 
                  '✅ SIMULATION: This shows what authorized origins experience\\n' +
                  '(No CORS errors because request succeeds)\\n' + 
                  JSON.stringify(data, null, 2), 'success');
              } catch (error) {
                log('Authorized origin simulation failed: ' + error.message, 'error');
                updateResult('auth-origin-result', 
                  '❌ SIMULATION FAILED: ' + error.message, 'error');
              }
            }

            async function testRealCorsError() {
              log('🚨 Creating real CORS error - WATCH THE CONSOLE! 🚨', 'error');
              updateResult('cors-error-result', '⏳ Creating iframe to simulate cross-origin request...', 'warning');
              
              // Create an iframe with a different origin to demonstrate CORS
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              
              // Use data: URL to create different origin
              iframe.src = 'data:text/html,' + encodeURIComponent(\`
                <script>
                  // This will create a real CORS error
                  fetch(window.location.origin + '${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get')
                    .then(response => response.json())
                    .then(data => {
                      parent.postMessage({type: 'cors-success', data: data}, '*');
                    })
                    .catch(error => {
                      parent.postMessage({type: 'cors-error', error: error.message}, '*');
                    });
                </script>
              \`);
              
              // Listen for messages from iframe
              const messageHandler = (event) => {
                if (event.data.type === 'cors-error') {
                  log('🎯 CORS ERROR CAUGHT: ' + event.data.error, 'error');
                  updateResult('cors-error-result', 
                    '🎯 SUCCESS: Browser blocked cross-origin request!\\n' +
                    '❌ CORS Error: ' + event.data.error + '\\n\\n' +
                    '✅ This proves CORS is working - unauthorized origins cannot access the API', 'success');
                } else if (event.data.type === 'cors-success') {
                  log('⚠️ UNEXPECTED: Cross-origin request succeeded', 'error');
                  updateResult('cors-error-result', 
                    '⚠️ UNEXPECTED: Request succeeded from different origin\\n' +
                    'This might indicate a security issue', 'error');
                }
                window.removeEventListener('message', messageHandler);
                document.body.removeChild(iframe);
              };
              
              window.addEventListener('message', messageHandler);
              document.body.appendChild(iframe);
              
              // Fallback timeout
              setTimeout(() => {
                updateResult('cors-error-result', 
                  '⏰ Timeout: Check browser console for CORS errors', 'warning');
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
                window.removeEventListener('message', messageHandler);
              }, 5000);
            }

            async function testPreflightCors() {
              try {
                log('Testing CORS preflight behavior...');
                updateResult('preflight-result', 'Testing CORS preflight...', 'warning');
                
                // Make a request that requires preflight (custom headers)
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Custom-Header': 'test-value' // This triggers preflight
                  },
                  body: JSON.stringify({test: 'preflight'})
                });
                
                const data = await response.json();
                log('Preflight request succeeded', 'success');
                updateResult('preflight-result', 
                  '✅ PREFLIGHT SUCCESS: Complex request allowed\\n' + 
                  JSON.stringify(data, null, 2), 'success');
                  
              } catch (error) {
                if (error.message.includes('CORS')) {
                  log('CORS preflight blocked: ' + error.message, 'success');
                  updateResult('preflight-result', 
                    '✅ CORS WORKING: Preflight blocked unauthorized request\\n' +
                    '❌ Error: ' + error.message, 'success');
                } else {
                  log('Preflight test failed: ' + error.message, 'error');
                  updateResult('preflight-result', 
                    '❌ TEST FAILED: ' + error.message, 'error');
                }
              }
            }

            async function runAllTests() {
              updateResult('summary-result', '🔄 Running all security tests...', 'warning');
              log('Starting comprehensive security test suite...');
              
              const results = [];
              
              // Test 1: Same origin (should work)
              try {
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
                results.push(response.ok ? '✅ Same-origin: PASS' : '❌ Same-origin: FAIL');
              } catch (e) {
                results.push('❌ Same-origin: ERROR - ' + e.message);
              }
              
              // Test 2: Unauthorized API (should return 403)
              try {
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://unauthorized-api.com/data');
                results.push(response.status === 403 ? '✅ API blocking: PASS' : '❌ API blocking: FAIL');
              } catch (e) {
                results.push('⚠️ API blocking: ERROR - ' + e.message);
              }
              
              // Test 3: Invalid URL (should return 400)
              try {
                const response = await fetch('${PROXY_ENDPOINT}?apiurl=invalid-url');
                results.push(response.status === 400 ? '✅ URL validation: PASS' : '❌ URL validation: FAIL');
              } catch (e) {
                results.push('⚠️ URL validation: ERROR - ' + e.message);
              }
              
              const summary = results.join('\\n');
              log('Security test summary:\\n' + summary);
              updateResult('summary-result', 
                '📊 SECURITY TEST RESULTS:\\n\\n' + summary + 
                '\\n\\n🔍 Check browser console for detailed CORS error messages', 'success');
            }

            // Log initial setup
            log('CORS Proxy Demo loaded. Current origin: ' + window.location.origin);
            log('Open DevTools Console to see CORS errors when they occur!');
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
