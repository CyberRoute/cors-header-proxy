export default {
  async fetch(request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    // Using APIs that DON'T support CORS for testing
    const API_URL = "https://httpbin.org/json";
    const NO_CORS_API = "https://api.github.com/users/octocat"; // GitHub API doesn't allow * CORS
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
        <h1>CORS Proxy Test</h1>
        
        <h2>1. Direct API Call (Will Fail - CORS Error)</h2>
        <button onclick="testDirectCall()">Test Direct Call</button>
        <div id="direct-result" style="background: #f0f0f0; padding: 10px; margin: 10px 0;"></div>
        
        <h2>2. Via CORS Proxy (Should Work)</h2>
        <button onclick="testProxyCall()">Test Proxy Call</button>
        <div id="proxy-result" style="background: #f0f0f0; padding: 10px; margin: 10px 0;"></div>
        
        <h2>3. POST via CORS Proxy</h2>
        <button onclick="testProxyPost()">Test Proxy POST</button>
        <div id="post-result" style="background: #f0f0f0; padding: 10px; margin: 10px 0;"></div>
        
        <script>
        async function testDirectCall() {
          const resultDiv = document.getElementById('direct-result');
          try {
            resultDiv.innerHTML = '⏳ Making direct call...';
            const response = await fetch('${NO_CORS_API}');
            const data = await response.json();
            resultDiv.innerHTML = '✅ Success: ' + JSON.stringify(data, null, 2);
          } catch (error) {
            resultDiv.innerHTML = '❌ CORS Error (Expected): ' + error.message;
          }
        }
        
        async function testProxyCall() {
          const resultDiv = document.getElementById('proxy-result');
          try {
            resultDiv.innerHTML = '⏳ Making proxy call...';
            const response = await fetch('${PROXY_ENDPOINT}?apiurl=${NO_CORS_API}');
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
