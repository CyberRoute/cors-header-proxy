export default {
  async fetch(request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    // Different API endpoints to demonstrate various CORS policies
    const STRICT_CORS_API = "/strict-cors-api";    // Only allows https://httpbin.org
    const OPEN_CORS_API = "/open-cors-api";        // Allows any origin (*)
    const NO_CORS_API = "/no-cors-api";            // No CORS headers at all
    const PROXY_ENDPOINT = "/corsproxy/";

    function rawHtmlResponse(html) {
      return new Response(html, {
        headers: {
          "content-type": "text/html;charset=UTF-8",
        },
      });
    }

    const DEMO_PAGE = `
      <!DOCTYPE html>
      <html>
      <body>
        <h1>CORS Policy Demonstration</h1>
        
        <h2>1. Strict CORS API (Only allows https://httpbin.org)</h2>
        <button onclick="testStrictCors()">Test Strict CORS Direct</button>
        <button onclick="testStrictCorsProxy()">Test Strict CORS via Proxy</button>
        <div id="strict-result" style="background: #ffe6e6; padding: 10px; margin: 10px 0; border-left: 4px solid #ff4444;">Click buttons to test strict CORS policy</div>
        
        <h2>2. Open CORS API (Allows any origin *)</h2>
        <button onclick="testOpenCors()">Test Open CORS Direct</button>
        <button onclick="testOpenCorsProxy()">Test Open CORS via Proxy</button>
        <div id="open-result" style="background: #e6ffe6; padding: 10px; margin: 10px 0; border-left: 4px solid #44ff44;">Click buttons to test open CORS policy</div>
        
        <h2>3. No CORS API (No CORS headers)</h2>
        <button onclick="testNoCors()">Test No CORS Direct</button>
        <button onclick="testNoCorsProxy()">Test No CORS via Proxy</button>
        <div id="no-cors-result" style="background: #fff0e6; padding: 10px; margin: 10px 0; border-left: 4px solid #ff8800;">Click buttons to test no CORS policy</div>
        
        <h2>3. POST via CORS Proxy</h2>
        <button onclick="testProxyPost()">Test Proxy POST</button>
        <div id="post-result" style="background: #f0f0f0; padding: 10px; margin: 10px 0;"></div>
        
        <script>
        // 1. STRICT CORS TESTS
        async function testStrictCors() {
          const resultDiv = document.getElementById('strict-result');
          try {
            resultDiv.innerHTML = '⏳ Testing strict CORS (only allows httpbin.org)...';
            const response = await fetch('${STRICT_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Unexpected Success: <pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '❌ CORS Error (Expected): <code>' + error.message + '</code><br><small>This API only allows requests from https://httpbin.org</small>';
          }
        }
        
        async function testStrictCorsProxy() {
          const resultDiv = document.getElementById('strict-result');
          try {
            resultDiv.innerHTML = '⏳ Testing strict CORS via proxy...';
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=' + window.location.origin + '${STRICT_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Success via proxy: <pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '❌ Error: ' + error.message;
          }
        }
        
        // 2. OPEN CORS TESTS  
        async function testOpenCors() {
          const resultDiv = document.getElementById('open-result');
          try {
            resultDiv.innerHTML = '⏳ Testing open CORS (allows any origin)...';
            const response = await fetch('${OPEN_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Success (Expected): <pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '❌ Unexpected Error: <code>' + error.message + '</code>';
          }
        }
        
        async function testOpenCorsProxy() {
          const resultDiv = document.getElementById('open-result');
          try {
            resultDiv.innerHTML = '⏳ Testing open CORS via proxy...';
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=' + window.location.origin + '${OPEN_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Success via proxy: <pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '❌ Error: ' + error.message;
          }
        }
        
        // 3. NO CORS TESTS
        async function testNoCors() {
          const resultDiv = document.getElementById('no-cors-result');
          try {
            resultDiv.innerHTML = '⏳ Testing no CORS headers...';
            const response = await fetch('${NO_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Unexpected Success: <pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '❌ CORS Error (Expected): <code>' + error.message + '</code><br><small>This API sends no CORS headers</small>';
          }
        }
        
        async function testNoCorsProxy() {
          const resultDiv = document.getElementById('no-cors-result');
          try {
            resultDiv.innerHTML = '⏳ Testing no CORS via proxy...';
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=' + window.location.origin + '${NO_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Success via proxy: <pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '❌ Error: ' + error.message;
          }
        }
        
        async function testProxyPost() {
          const resultDiv = document.getElementById('post-result');
          try {
            resultDiv.innerHTML = '⏳ Making POST via proxy...';
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: 'Hello from CORS proxy!' })
            });
            
            // Debug: Check what we actually got
            const responseText = await response.text();
            console.log('POST Response status:', response.status);
            console.log('POST Response text:', responseText);
            console.log('POST Response headers:', Object.fromEntries(response.headers));
            
            // Try to parse as JSON
            try {
              const data = JSON.parse(responseText);
              resultDiv.innerHTML = '✅ POST Success: <pre>' + JSON.stringify(data, null, 2) + '</pre>';
            } catch (parseError) {
              resultDiv.innerHTML = '⚠️ Response received but not JSON:<br><strong>Status:</strong> ' + response.status + '<br><strong>Content:</strong><pre>' + responseText + '</pre>';
            }
          } catch (error) {
            resultDiv.innerHTML = '❌ Error: ' + error.message;
          }
        }
        </script>
      </body>
      </html>
    `;

    async function handleRequest(request) {
      const url = new URL(request.url);
      let apiUrl = url.searchParams.get("apiurl");

      if (apiUrl == null) {
        apiUrl = API_URL;
      }

      console.log(`🔄 Proxying request to: ${apiUrl}`);
      console.log(`📨 Method: ${request.method}`);

      // Create new request to the target API
      const proxyRequest = new Request(apiUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      });

      // Set the Origin header to match the target API's domain
      proxyRequest.headers.set("Origin", new URL(apiUrl).origin);

      let response = await fetch(proxyRequest);
      
      console.log(`📥 Response status: ${response.status}`);
      console.log(`📥 Response headers:`, Object.fromEntries(response.headers));

      // Create new response with CORS headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          "Access-Control-Allow-Origin": url.origin,
          "Vary": "Origin"
        }
      });

      return newResponse;
    }

    async function handleOptions(request) {
      if (
        request.headers.get("Origin") !== null &&
        request.headers.get("Access-Control-Request-Method") !== null &&
        request.headers.get("Access-Control-Request-Headers") !== null
      ) {
        console.log("🔀 Handling CORS preflight request");
        return new Response(null, {
          headers: {
            ...corsHeaders,
            "Access-Control-Allow-Headers": request.headers.get(
              "Access-Control-Request-Headers",
            ),
          },
        });
      } else {
        return new Response(null, {
          headers: {
            Allow: "GET, HEAD, POST, OPTIONS",
          },
        });
      }
    }

    const url = new URL(request.url);
    
    // Handle different CORS policy demonstrations
    if (url.pathname === STRICT_CORS_API) {
      const origin = request.headers.get('Origin');
      const allowedOrigin = 'https://httpbin.org';
      
      const responseData = {
        message: "Strict CORS API - only allows https://httpbin.org",
        requestOrigin: origin,
        allowedOrigin: allowedOrigin,
        timestamp: new Date().toISOString()
      };
      
      // Only add CORS headers if origin matches exactly
      if (origin === allowedOrigin) {
        return new Response(JSON.stringify(responseData), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Max-Age": "86400"
          }
        });
      } else {
        // No CORS headers = browser will block
        return new Response(JSON.stringify(responseData), {
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
    }
    
    if (url.pathname === OPEN_CORS_API) {
      return new Response(JSON.stringify({
        message: "Open CORS API - allows any origin (*)",
        timestamp: new Date().toISOString(),
        policy: "Access-Control-Allow-Origin: *"
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    
    if (url.pathname === NO_CORS_API) {
      return new Response(JSON.stringify({
        message: "No CORS API - sends no CORS headers at all",
        timestamp: new Date().toISOString(),
        policy: "No CORS headers"
      }), {
        headers: {
          "Content-Type": "application/json"
          // Intentionally NO CORS headers
        }
      });
    }
    
    if (url.pathname.startsWith(PROXY_ENDPOINT)) {
      if (request.method === "OPTIONS") {
        return handleOptions(request);
      } else if (
        request.method === "GET" ||
        request.method === "HEAD" ||
        request.method === "POST"
      ) {
        return handleRequest(request);
      } else {
        return new Response(null, {
          status: 405,
          statusText: "Method Not Allowed",
        });
      }
    } else {
      return rawHtmlResponse(DEMO_PAGE);
    }
  },
};
