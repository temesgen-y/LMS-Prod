import { NextRequest, NextResponse } from 'next/server';

// SCORM 1.2 + SCORM 2004 bridge script injected into proxied HTML.
// Defines window.API (SCORM 1.2) and window.API_1484_11 (SCORM 2004).
// Communicates with the parent LMS player page via postMessage.
const SCORM_BRIDGE_SCRIPT = `
<script id="__scorm_bridge__">
(function(){
  var cmiData = {};
  var lastError = '0';

  function post(type, payload){
    try{ window.parent.postMessage({ __scorm: true, type: type, payload: payload }, '*'); }
    catch(e){}
  }

  // ── SCORM 1.2 API ───────────────────────────────────────────────────────────
  window.API = {
    LMSInitialize: function(s){
      post('initialize', {});
      return 'true';
    },
    LMSFinish: function(s){
      post('finish', { cmi: cmiData });
      return 'true';
    },
    LMSGetValue: function(element){
      var val = cmiData[element];
      if(val === undefined) val = '';
      lastError = '0';
      return String(val);
    },
    LMSSetValue: function(element, value){
      cmiData[element] = value;
      post('setvalue', { element: element, value: value });
      lastError = '0';
      return 'true';
    },
    LMSCommit: function(s){
      post('commit', { cmi: cmiData });
      return 'true';
    },
    LMSGetLastError: function(){ return lastError; },
    LMSGetErrorString: function(c){ return c === '0' ? 'No error' : 'General error'; },
    LMSGetDiagnostic: function(c){ return ''; },
  };

  // ── SCORM 2004 API ──────────────────────────────────────────────────────────
  window.API_1484_11 = {
    Initialize:     function(s){ post('initialize', {}); return 'true'; },
    Terminate:      function(s){ post('finish', { cmi: cmiData }); return 'true'; },
    GetValue:       function(e){ var v = cmiData[e]; if(v===undefined)v=''; return String(v); },
    SetValue:       function(e,v){ cmiData[e]=v; post('setvalue',{element:e,value:v}); return 'true'; },
    Commit:         function(s){ post('commit', { cmi: cmiData }); return 'true'; },
    GetLastError:   function(){ return '0'; },
    GetErrorString: function(c){ return 'No error'; },
    GetDiagnostic:  function(c){ return ''; },
  };

  // Seed initial CMI values sent from the player page
  window.addEventListener('message', function(e){
    if(e.data && e.data.__scorm_init){
      var seed = e.data.seed || {};
      for(var k in seed){ cmiData[k] = seed[k]; }
    }
  });

  post('ready', {});
})();
</script>
`;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Only proxy HTTPS URLs to prevent SSRF to internal services
  if (!url.startsWith('https://')) {
    return new NextResponse('Only HTTPS URLs are supported', { status: 400 });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(url, {
      headers: { 'User-Agent': 'MuleLMS-SCORM-Proxy/1.0' },
      // 15 second timeout
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return new NextResponse('Failed to fetch SCORM content', { status: 502 });
  }

  if (!upstreamRes.ok) {
    return new NextResponse(`Upstream error: ${upstreamRes.status}`, { status: upstreamRes.status });
  }

  const contentType = upstreamRes.headers.get('content-type') ?? 'application/octet-stream';

  // For HTML files: inject SCORM API bridge script
  if (contentType.includes('text/html')) {
    let html = await upstreamRes.text();

    // Inject bridge before </head> or at start of <body> or at top
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${SCORM_BRIDGE_SCRIPT}\n</head>`);
    } else if (html.includes('<body')) {
      html = html.replace(/<body[^>]*>/, (match) => `${match}\n${SCORM_BRIDGE_SCRIPT}`);
    } else {
      html = SCORM_BRIDGE_SCRIPT + html;
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'no-store',
      },
    });
  }

  // For non-HTML assets (JS, CSS, images): pass through as-is
  const body = await upstreamRes.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
