export default {
  async fetch(request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    // The URL for the remote third party API you want to fetch from
    // but does not implement CORS
    const API_URL = "https://httpbin.org/json"; // Changed to working API

    // The endpoint you want the CORS reverse proxy to be on
    const PROXY_ENDPOINT = "/corsproxy/";

    // The rest of this snippet for the demo page
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
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
          .section h2 { margin-top: 0; }
          button { margin: 5px; padding: 8px 15px; background: #007cba; color: white; border: none; border-radius: 3px; cursor: pointer; }
          button:hover { background: #005a87; }
          .result { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 3px; min-height: 20px; }
          .success { border-left: 4px solid #4CAF50; }
          .error { border-left: 4px solid #f44336; }
          .info { border-left: 4px solid #2196F3; }
          pre { white-space: pre-wrap; word-wrap: break-word; }
        </style>
      </head>
      <body>
        <h1>CORS Proxy Demo - Test All Features</h1>
        
        <div class="section">
          <h2>1. Direct API Calls (May fail due to CORS)</h2>
          <button onclick="testDirectGet()">Test Direct GET</button>
          <button onclick="testDirectPost()">Test Direct POST</button>
          <div id="direct-result" class="result">Click buttons to test direct API calls without proxy</div>
        </div>

        <div class="section">
          <h2>2. Proxied API Calls (Should work)</h2>
          <button onclick="testProxyGet()">Test Proxy GET</button>
          <button onclick="testProxyPost()">Test Proxy POST</button>
          <button onclick="testProxyPut()">Test Proxy PUT</button>
          <button onclick="testProxyDelete()">Test Proxy DELETE</button>
          <div id="proxy-result" class="result">Click buttons to test API calls through CORS proxy</div>
        </div>

        <div class="section">
          <h2>3. CORS Preflight Requests</h2>
          <button onclick="testPreflight()">Test Custom Headers (Triggers Preflight)</button>
          <button onclick="testComplexPost()">Test Complex POST (Triggers Preflight)</button>
          <div id="preflight-result" class="result">Click buttons to test requests that require CORS preflight</div>
        </div>

        <div class="section">
          <h2>4. Different Content Types</h2>
          <button onclick="testFormData()">Test Form Data</button>
          <button onclick="testPlainText()">Test Plain Text</button>
          <button onclick="testCustomContentType()">Test Custom Content Type</button>
          <div id="content-result" class="result">Click buttons to test different content types</div>
        </div>

        <div class="section">
          <h2>5. Error Handling</h2>
          <button onclick="testBadUrl()">Test Bad URL</button>
          <button onclick="testTimeout()">Test Non-existent API</button>
          <button onclick="test404()">Test 404 Error</button>
          <div id="error-result" class="result">Click buttons to test error handling</div>
        </div>

        <div class="section">
          <h2>6. Original Cloudflare Tests</h2>
          <button onclick="runOriginalTests()">Run All Original Tests</button>
          <div class="result">
            <strong>GET without CORS Proxy:</strong> <code id="noproxy">Not tested</code><br>
            <strong>GET with CORS Proxy:</strong> <code id="proxy">Not tested</code><br>
            <strong>POST with CORS Proxy + Preflight:</strong> <code id="proxypreflight">Not tested</code>
          </div>
        </div>

        <script>
        function updateResult(elementId, content, type = 'info') {
          const element = document.getElementById(elementId);
          element.innerHTML = content;
          element.className = 'result ' + type;
        }

        // 1. DIRECT API CALLS
        async function testDirectGet() {
          try {
            updateResult('direct-result', '⏳ Testing direct GET call...', 'info');
            const response = await fetch('https://httpbin.org/get');
            const data = await response.json();
            updateResult('direct-result', '✅ Direct GET Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('direct-result', '❌ Direct GET Failed: ' + error.message, 'error');
          }
        }

        async function testDirectPost() {
          try {
            updateResult('direct-result', '⏳ Testing direct POST call...', 'info');
            const response = await fetch('https://httpbin.org/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ test: 'direct post' })
            });
            const data = await response.json();
            updateResult('direct-result', '✅ Direct POST Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('direct-result', '❌ Direct POST Failed: ' + error.message, 'error');
          }
        }

        // 2. PROXIED API CALLS  
        async function testProxyGet() {
          try {
            updateResult('proxy-result', '⏳ Testing proxy GET call...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get');
            const data = await response.json();
            updateResult('proxy-result', '✅ Proxy GET Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('proxy-result', '❌ Proxy GET Failed: ' + error.message, 'error');
          }
        }

        async function testProxyPost() {
          try {
            updateResult('proxy-result', '⏳ Testing proxy POST call...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ test: 'proxy post', timestamp: new Date().toISOString() })
            });
            const data = await response.json();
            updateResult('proxy-result', '✅ Proxy POST Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('proxy-result', '❌ Proxy POST Failed: ' + error.message, 'error');
          }
        }

        async function testProxyPut() {
          try {
            updateResult('proxy-result', '⏳ Testing proxy PUT call...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/put', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ test: 'proxy put', id: 123 })
            });
            const data = await response.json();
            updateResult('proxy-result', '✅ Proxy PUT Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('proxy-result', '❌ Proxy PUT Failed: ' + error.message, 'error');
          }
        }

        async function testProxyDelete() {
          try {
            updateResult('proxy-result', '⏳ Testing proxy DELETE call...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/delete', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            updateResult('proxy-result', '✅ Proxy DELETE Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('proxy-result', '❌ Proxy DELETE Failed: ' + error.message, 'error');
          }
        }

        // 3. CORS PREFLIGHT REQUESTS
        async function testPreflight() {
          try {
            updateResult('preflight-result', '⏳ Testing custom headers (triggers preflight)...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/get', {
              method: 'GET',
              headers: { 
                'X-Custom-Header': 'test-value',
                'Authorization': 'Bearer test-token'
              }
            });
            const data = await response.json();
            updateResult('preflight-result', '✅ Preflight Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('preflight-result', '❌ Preflight Failed: ' + error.message, 'error');
          }
        }

        async function testComplexPost() {
          try {
            updateResult('preflight-result', '⏳ Testing complex POST (triggers preflight)...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': 'test-key-123',
                'X-Request-ID': 'req-' + Date.now()
              },
              body: JSON.stringify({ 
                message: 'Complex POST request',
                timestamp: new Date().toISOString(),
                metadata: { source: 'cors-proxy-test' }
              })
            });
            const data = await response.json();
            updateResult('preflight-result', '✅ Complex POST Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('preflight-result', '❌ Complex POST Failed: ' + error.message, 'error');
          }
        }

        // 4. DIFFERENT CONTENT TYPES
        async function testFormData() {
          try {
            updateResult('content-result', '⏳ Testing form data...', 'info');
            const formData = new FormData();
            formData.append('field1', 'value1');
            formData.append('field2', 'value2');
            
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
              method: 'POST',
              body: formData
            });
            const data = await response.json();
            updateResult('content-result', '✅ Form Data Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('content-result', '❌ Form Data Failed: ' + error.message, 'error');
          }
        }

        async function testPlainText() {
          try {
            updateResult('content-result', '⏳ Testing plain text...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: 'This is plain text content for testing'
            });
            const data = await response.json();
            updateResult('content-result', '✅ Plain Text Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('content-result', '❌ Plain Text Failed: ' + error.message, 'error');
          }
        }

        async function testCustomContentType() {
          try {
            updateResult('content-result', '⏳ Testing custom content type...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/xml' },
              body: '<test><message>Custom content type</message></test>'
            });
            const data = await response.json();
            updateResult('content-result', '✅ Custom Content Type Success:<pre>' + JSON.stringify(data, null, 2) + '</pre>', 'success');
          } catch (error) {
            updateResult('content-result', '❌ Custom Content Type Failed: ' + error.message, 'error');
          }
        }

        // 5. ERROR HANDLING
        async function testBadUrl() {
          try {
            updateResult('error-result', '⏳ Testing bad URL...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=not-a-valid-url');
            const text = await response.text();
            updateResult('error-result', '⚠️ Bad URL Response (Status ' + response.status + '):<pre>' + text + '</pre>', 'error');
          } catch (error) {
            updateResult('error-result', '❌ Bad URL Failed as expected: ' + error.message, 'success');
          }
        }

        async function testTimeout() {
          try {
            updateResult('error-result', '⏳ Testing non-existent API...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://this-domain-does-not-exist-12345.com/api');
            const text = await response.text();
            updateResult('error-result', '⚠️ Non-existent API Response:<pre>' + text + '</pre>', 'error');
          } catch (error) {
            updateResult('error-result', '❌ Non-existent API Failed as expected: ' + error.message, 'success');
          }
        }

        async function test404() {
          try {
            updateResult('error-result', '⏳ Testing 404 error...', 'info');
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=https://httpbin.org/status/404');
            const text = await response.text();
            updateResult('error-result', '✅ 404 Error Handled (Status ' + response.status + '):<pre>' + text + '</pre>', 'success');
          } catch (error) {
            updateResult('error-result', '❌ 404 Test Failed: ' + error.message, 'error');
          }
        }

        // 6. ORIGINAL TESTS
        async function runOriginalTests() {
          const reqs = {};
          
          reqs.noproxy = () => {
            return fetch("${API_URL}").then(r => r.json())
          }
          
          reqs.proxy = async () => {
            let href = "${PROXY_ENDPOINT}?apiurl=${API_URL}"
            return fetch(window.location.origin + href).then(r => r.json())
          }
          
          reqs.proxypreflight = async () => {
            let href = "${PROXY_ENDPOINT}?apiurl=https://httpbin.org/post"
            let response = await fetch(window.location.origin + href, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                msg: "Hello world!"
              })
            })
            return response.json()
          }

          for (const [reqName, req] of Object.entries(reqs)) {
            try {
              let data = await req()
              document.getElementById(reqName).textContent = JSON.stringify(data)
            } catch (e) {
              document.getElementById(reqName).textContent = e
            }
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

      // Rewrite request to point to API URL. This also makes the request mutable
      // so you can add the correct Origin header to make the API server think
      // that this request is not cross-site.
      request = new Request(apiUrl, request);
      request.headers.set("Origin", new URL(apiUrl).origin);
      let response = await fetch(request);
      // Recreate the response so you can modify the headers

      response = new Response(response.body, response);
      // Set CORS headers

      response.headers.set("Access-Control-Allow-Origin", url.origin);

      // Append to/Add Vary header so browser will cache response correctly
      response.headers.append("Vary", "Origin");

      return response;
    }

    async function handleOptions(request) {
      if (
        request.headers.get("Origin") !== null &&
        request.headers.get("Access-Control-Request-Method") !== null &&
        request.headers.get("Access-Control-Request-Headers") !== null
      ) {
        // Handle CORS preflight requests.
        return new Response(null, {
          headers: {
            ...corsHeaders,
            "Access-Control-Allow-Headers": request.headers.get(
              "Access-Control-Request-Headers",
            ),
          },
        });
      } else {
        // Handle standard OPTIONS request.
        return new Response(null, {
          headers: {
            Allow: "GET, HEAD, POST, OPTIONS",
          },
        });
      }
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith(PROXY_ENDPOINT)) {
      if (request.method === "OPTIONS") {
        // Handle CORS preflight requests
        return handleOptions(request);
      } else if (
        request.method === "GET" ||
        request.method === "HEAD" ||
        request.method === "POST"
      ) {
        // Handle requests to the API server
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
