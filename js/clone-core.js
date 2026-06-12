/* ============================================================================
 * Page Cloner — clone-core.js
 *
 * Browser-side port of the Lander dashboard's page-cloner logic.
 * Runs entirely client-side on GitHub Pages. Because browsers block
 * cross-origin fetches (CORS), all network fetches to external sites go
 * through a configurable public CORS proxy.
 *
 * Pure functions ported verbatim from lib/url-utils.ts (TS annotations
 * removed, regex/logic identical). cleanAssetName ported from
 * app/api/clone/route.ts. Network layer rewritten to use a CORS proxy.
 *
 * Exposes: window.Cloner = { clonePage, PROXIES, proxiedFetch }
 * ========================================================================== */
(function () {
  'use strict';

  // ── Module-level constants (verbatim from url-utils.ts) ───────────────────

  const TRACKING_PARAMS = new Set([
    // Google / standard UTM
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'dclid', '_ga', '_gac', '_gl',
    'gad_source', 'gad_campaignid',
    // Social platform click IDs
    'fbclid', 'msclkid', 'ttclid', 'twclid', 'yclid', 'igshid', 'li_fat_id', 'epik',
    // Email / CRM
    'mc_cid', 'mc_eid', '_ke', 'ref', 'affiliate_id',
    // Taboola / Outbrain / native ad params
    'tblci', 'ob_click_id', 'obOrigUrl', 'campaign_id', 'campaign_item_id',
    'click_id', 'site', 'site_id', 'title', 'platform', 'thumbnail',
    // Affiliate / ad network params
    'cep', 'mpid', 'affId', 'aff_id', 'guaffid', 'sub1', 'sub2', 'sub3', 'sub4', 'sub5',
    'link_id', 's5', 'max_cid', 'p_uuid', 'lptoken', 'nb_cid', 'nb_platform',
    'lpid', 'source_id', 'sub_id', 'req_id', 'oid', 'uid',
    'tw_source', 'tw_campaign', 'tw_adid', 'taboola_cid',
    'c1', 'c2', 'c3', 'c5', 'cmc_tid', 'cmc_adid',
    'AFID', 'ad_id', 'placement_name', 'ad',
    '_ab', 'key', 'frm', 'dc', 'dcs', 'affid', 'tcid',
    's2', 'subid', 'pg', 'gu_id',
  ]);

  // CDN domains to skip inlining (keep as <link> so browser loads them natively)
  const SKIP_CSS_DOMAINS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'use.fontawesome.com',
    'cdnjs.cloudflare.com',
    'maxcdn.bootstrapcdn.com',
    'stackpath.bootstrapcdn.com',
    'kit.fontawesome.com',
    'pro.fontawesome.com',
  ];

  // ── Script Detection ─────────────────────────────────────────────────────

  const SCRIPT_PATTERNS = [
    // Analytics
    { pattern: /google-analytics\.com|googletagmanager\.com|gtag\/js/i, category: 'analytics', name: 'Google Analytics / GTM' },
    { pattern: /segment\.com\/analytics/i, category: 'analytics', name: 'Segment' },
    { pattern: /cdn\.mxpnl\.com|mixpanel/i, category: 'analytics', name: 'Mixpanel' },
    { pattern: /cdn\.amplitude\.com|amplitude/i, category: 'analytics', name: 'Amplitude' },
    { pattern: /plausible\.io/i, category: 'analytics', name: 'Plausible' },
    { pattern: /matomo|piwik/i, category: 'analytics', name: 'Matomo' },
    { pattern: /heap-analytics|heapanalytics/i, category: 'analytics', name: 'Heap Analytics' },
    // Ad Pixels
    { pattern: /connect\.facebook\.net|fbevents\.js|fbq\(/i, category: 'ad-pixel', name: 'Facebook Pixel' },
    { pattern: /analytics\.tiktok\.com|ttq\./i, category: 'ad-pixel', name: 'TikTok Pixel' },
    { pattern: /googleadservices\.com|google_tag_params|gtag.*conversion/i, category: 'ad-pixel', name: 'Google Ads' },
    { pattern: /snap\.licdn\.com|snaptr\(/i, category: 'ad-pixel', name: 'Snap Pixel' },
    { pattern: /ads\.linkedin\.com|linkedin.*insight/i, category: 'ad-pixel', name: 'LinkedIn Pixel' },
    { pattern: /ct\.pinterest\.com|pintrk\(/i, category: 'ad-pixel', name: 'Pinterest Pixel' },
    { pattern: /bat\.bing\.com|uetq/i, category: 'ad-pixel', name: 'Bing/Microsoft Ads' },
    { pattern: /taboola/i, category: 'ad-pixel', name: 'Taboola' },
    { pattern: /outbrain/i, category: 'ad-pixel', name: 'Outbrain' },
    // Chat Widgets
    { pattern: /intercom/i, category: 'chat-widget', name: 'Intercom' },
    { pattern: /drift\.com|driftt/i, category: 'chat-widget', name: 'Drift' },
    { pattern: /tawk\.to/i, category: 'chat-widget', name: 'Tawk.to' },
    { pattern: /livechat/i, category: 'chat-widget', name: 'LiveChat' },
    { pattern: /crisp\.chat/i, category: 'chat-widget', name: 'Crisp' },
    { pattern: /hubspot.*conversations|hs-scripts/i, category: 'chat-widget', name: 'HubSpot Chat' },
    { pattern: /zendesk/i, category: 'chat-widget', name: 'Zendesk' },
    { pattern: /freshdesk|freshchat/i, category: 'chat-widget', name: 'Freshdesk' },
    // Heatmaps / Session Recording
    { pattern: /hotjar/i, category: 'heatmap', name: 'Hotjar' },
    { pattern: /clarity\.ms/i, category: 'heatmap', name: 'Microsoft Clarity' },
    { pattern: /fullstory/i, category: 'heatmap', name: 'FullStory' },
    { pattern: /luckyorange/i, category: 'heatmap', name: 'Lucky Orange' },
    { pattern: /crazyegg/i, category: 'heatmap', name: 'Crazy Egg' },
    { pattern: /mouseflow/i, category: 'heatmap', name: 'Mouseflow' },
    // A/B Testing
    { pattern: /optimizely/i, category: 'ab-testing', name: 'Optimizely' },
    { pattern: /vwo\.com|visualwebsiteoptimizer/i, category: 'ab-testing', name: 'VWO' },
    { pattern: /optimize\.google/i, category: 'ab-testing', name: 'Google Optimize' },
    // Other Tracking
    { pattern: /hubspot.*tracking|hs-analytics/i, category: 'tracking', name: 'HubSpot Tracking' },
    { pattern: /pardot|pi\.pardot/i, category: 'tracking', name: 'Pardot' },
    { pattern: /marketo|munchkin/i, category: 'tracking', name: 'Marketo' },
    { pattern: /clickfunnels/i, category: 'tracking', name: 'ClickFunnels' },
    { pattern: /leadpages/i, category: 'tracking', name: 'LeadPages' },
    { pattern: /cookiebot|cookie-consent|cookie-law/i, category: 'tracking', name: 'Cookie Consent' },
    { pattern: /onesignal/i, category: 'tracking', name: 'OneSignal' },
    { pattern: /sumo\.com|sumome/i, category: 'tracking', name: 'Sumo' },
  ];

  const ESSENTIAL_SCRIPT_PATTERNS = [
    /jquery/i,
    /bootstrap/i,
    /cdn\.jsdelivr\.net/i,
    /cdnjs\.cloudflare\.com/i,
    /unpkg\.com/i,
    /ajax\.googleapis\.com/i,
    /swiper/i,
    /slick/i,
    /gsap|greensock/i,
    /lodash/i,
    /moment\.js/i,
    /alpine/i,
    /tailwindcss/i,
    // Unbounce runtime scripts are layout-critical in many templates.
    /lp-pom|unbounce|d9hhrg4mnvzow\.cloudfront\.net/i,
  ];

  function detectScripts(html) {
    const results = [];
    const seen = new Set();
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;

    while ((m = scriptRegex.exec(html)) !== null) {
      const attrs = m[1];
      const inline = m[2];
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
      const identifier = srcMatch ? srcMatch[1] : inline.slice(0, 200);
      if (!identifier.trim()) continue;

      // Check if essential first
      const isEssential = ESSENTIAL_SCRIPT_PATTERNS.some(p => p.test((srcMatch && srcMatch[1]) || '') || p.test(inline.slice(0, 500)));
      if (isEssential) {
        const name = (srcMatch && srcMatch[1] && srcMatch[1].split('/').pop().split('?')[0]) || 'Framework Script';
        if (!seen.has(name)) {
          seen.add(name);
          results.push({ category: 'essential', name, source: ((srcMatch && srcMatch[1]) || inline.slice(0, 80)).slice(0, 120) });
        }
        continue;
      }

      // Match against known tracking patterns
      let matched = false;
      for (const { pattern, category, name } of SCRIPT_PATTERNS) {
        if (pattern.test((srcMatch && srcMatch[1]) || '') || pattern.test(inline.slice(0, 1000))) {
          if (!seen.has(name)) {
            seen.add(name);
            results.push({ category, name, source: ((srcMatch && srcMatch[1]) || inline.slice(0, 80)).slice(0, 120) });
          }
          matched = true;
          break;
        }
      }
      if (!matched && srcMatch && srcMatch[1]) {
        const filename = srcMatch[1].split('/').pop().split('?')[0] || srcMatch[1];
        if (!seen.has(filename)) {
          seen.add(filename);
          results.push({ category: 'unknown', name: filename.slice(0, 60), source: srcMatch[1].slice(0, 120) });
        }
      }
    }

    return results;
  }

  // ── Tracking Meta / Link Detection ───────────────────────────────────────

  const TRACKING_META_PATTERNS = [
    /facebook-domain-verification/i,
    /google-site-verification/i,
    /p:domain_verify/i,          // Pinterest
    /msvalidate\.01/i,           // Bing
    /yandex-verification/i,
    /ahrefs-site-verification/i,
  ];

  const TRACKING_LINK_DOMAINS = [
    'facebook.com', 'facebook.net', 'google-analytics.com', 'googletagmanager.com',
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'hotjar.com', 'clarity.ms', 'tiktok.com', 'snap.com',
  ];

  function stripTrackingMeta(html) {
    // Strip tracking <meta> tags
    let result = html.replace(/<meta\b[^>]*>/gi, (tag) => {
      const nameMatch = tag.match(/(?:name|property)=["']([^"']+)["']/i);
      if (!nameMatch) return tag;
      if (TRACKING_META_PATTERNS.some(p => p.test(nameMatch[1]))) return '';
      if (/^fb:/i.test(nameMatch[1])) return '';
      return tag;
    });
    // Strip tracking preconnect/dns-prefetch <link> tags
    result = result.replace(/<link\b[^>]*>/gi, (tag) => {
      const relMatch = tag.match(/rel=["'](preconnect|dns-prefetch)["']/i);
      if (!relMatch) return tag;
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return tag;
      if (TRACKING_LINK_DOMAINS.some(d => hrefMatch[1].includes(d))) return '';
      return tag;
    });
    return result;
  }

  // ── Asset Extraction ─────────────────────────────────────────────────────

  function extractAssetUrls(html, baseUrl) {
    const urls = new Map();

    const resolve = (raw) => {
      if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('javascript:')) return null;
      let cleaned = raw.trim();
      // Handle protocol-relative URLs (//domain.com/path)
      if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned;
      try {
        return new URL(cleaned, baseUrl).toString();
      } catch {
        return null;
      }
    };

    const getType = (url) => {
      const lower = url.toLowerCase();
      if (/\.gif(\?|$|#)/i.test(lower)) return 'gif';
      if (/\.(mp4|webm|mov|avi|m4v|ogg|ogv|flv|wmv|mkv)(\?|$|#)/i.test(lower)) return 'video';
      return 'image';
    };

    const add = (rawUrl, attribute) => {
      const resolved = resolve(rawUrl.trim());
      if (!resolved) return;
      // Skip tiny tracking pixels
      if (/[?&](w|width|h|height)=1\b/.test(resolved)) return;
      // Skip Unbounce transparent placeholder GIF
      if (resolved.includes('transparent.gif')) return;
      if (!urls.has(resolved)) {
        urls.set(resolved, { originalUrl: resolved, type: getType(resolved), attribute });
      }
    };

    let m;

    // <img src="...">
    const imgSrc = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
    while ((m = imgSrc.exec(html)) !== null) add(m[1], 'img.src');

    // <img srcset="..."> and <source srcset="...">
    const srcset = /\bsrcset=["']([^"']+)["']/gi;
    while ((m = srcset.exec(html)) !== null) {
      m[1].split(',').forEach(part => {
        const url = part.trim().split(/\s+/)[0];
        if (url) add(url, 'srcset');
      });
    }

    // Per-tag data-src extraction: for each <img> tag, pick the best resolution data-src variant
    // This avoids downloading 6 resolutions of the same image (desktop-1x, desktop-2x, mobile-1x, etc.)
    const imgTagRegex = /<img\b[^>]*>/gi;
    const dataSrcPriority = [
      /data-src-desktop-3x=["']([^"']+)["']/i,
      /data-src-desktop-2x=["']([^"']+)["']/i,
      /data-src-desktop-1x=["']([^"']+)["']/i,
      /data-src-mobile-3x=["']([^"']+)["']/i,
      /data-src-mobile-2x=["']([^"']+)["']/i,
      /data-src-mobile-1x=["']([^"']+)["']/i,
      /data-src=["']([^"']+)["']/i,
      /data-lazy-src=["']([^"']+)["']/i,
      /data-lazy=["']([^"']+)["']/i,
      /data-original=["']([^"']+)["']/i,
      /data-image=["']([^"']+)["']/i,
    ];
    while ((m = imgTagRegex.exec(html)) !== null) {
      const tag = m[0];
      for (const re of dataSrcPriority) {
        const match = tag.match(re);
        if (match && !match[1].startsWith('data:')) {
          add(match[1], 'data-attr');
          break; // only keep the best resolution
        }
      }
    }

    // data-lazy-src on any element (WP Rocket)
    const wpRocketLazy = /\bdata-lazy-src=["']([^"']+)["']/gi;
    while ((m = wpRocketLazy.exec(html)) !== null) {
      if (!m[1].startsWith('data:')) add(m[1], 'data-lazy-src');
    }

    // data-elementor-lightbox-video (Elementor video lightboxes)
    const elementorVideo = /\bdata-elementor-lightbox-video=["']([^"']+)["']/gi;
    while ((m = elementorVideo.exec(html)) !== null) add(m[1], 'elementor-video');

    // Elements with class="lazyload" that have data-src
    const lazyloadElements = /<[^>]+class=["'][^"']*\blazyload\b[^"']*["'][^>]*\bdata-src=["']([^"']+)["'][^>]*>/gi;
    while ((m = lazyloadElements.exec(html)) !== null) {
      if (!m[1].startsWith('data:')) add(m[1], 'lazyload.data-src');
    }
    // Also match reverse order: data-src before class
    const lazyloadElements2 = /<[^>]+\bdata-src=["']([^"']+)["'][^>]*class=["'][^"']*\blazyload\b[^"']*["'][^>]*>/gi;
    while ((m = lazyloadElements2.exec(html)) !== null) {
      if (!m[1].startsWith('data:')) add(m[1], 'lazyload.data-src');
    }

    // Non-img data attributes on ANY element: data-bg, data-background-image, data-poster, etc.
    // Covers ClickFunnels (data-bg), Elementor (data-bg), WP Rocket (data-lazy-bg), etc.
    const otherDataAttr = /\bdata-(?:bg[a-z0-9-]*|background[a-z0-9-]*|poster|thumb[a-z0-9-]*|hero[a-z0-9-]*|cover[a-z0-9-]*|parallax[a-z0-9-]*|lazy-bg)=["']([^"']+)["']/gi;
    while ((m = otherDataAttr.exec(html)) !== null) {
      const val = m[1];
      if (!val.startsWith('data:') && !val.startsWith('#')) add(val, 'data-attr');
    }

    // <video src="..."> and <video poster="...">
    const videoSrc = /<video\b[^>]*\bsrc=["']([^"']+)["']/gi;
    while ((m = videoSrc.exec(html)) !== null) add(m[1], 'video.src');
    const videoPoster = /<video\b[^>]*\bposter=["']([^"']+)["']/gi;
    while ((m = videoPoster.exec(html)) !== null) add(m[1], 'video.poster');

    // <source src="...">
    const sourceSrc = /<source\b[^>]*\bsrc=["']([^"']+)["']/gi;
    while ((m = sourceSrc.exec(html)) !== null) add(m[1], 'source.src');

    // <picture> → <source srcset="..."> already handled by srcset regex above

    // <link rel="preload" as="image" href="..."> (ClickFunnels, WordPress)
    const preloadImg = /<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["']([^"']+)["']/gi;
    while ((m = preloadImg.exec(html)) !== null) add(m[1], 'preload');
    // Also match reverse attribute order
    const preloadImg2 = /<link[^>]+as=["']image["'][^>]+href=["']([^"']+)["']/gi;
    while ((m = preloadImg2.exec(html)) !== null) add(m[1], 'preload');

    // <meta property="og:image" content="..."> (social share images)
    const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
    while ((m = ogImage.exec(html)) !== null) add(m[1], 'og:image');

    // CSS url(...) references in inline/stylesheets (images, video, fonts)
    const bgUrl = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    while ((m = bgUrl.exec(html)) !== null) {
      const val = m[1].trim();
      if (!val.startsWith('data:') && !val.startsWith('#') &&
        /\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?|ico|heic|heif|jfif|pjpe?g|mp4|webm|mov|avi|m4v|ogg|woff2?|ttf|otf|eot)(\?|$|#)/i.test(val)) {
        add(val, 'css.background');
      }
    }

    // Preloaded fonts
    const preloadFont = /<link[^>]+rel=["']preload["'][^>]+as=["']font["'][^>]+href=["']([^"']+)["']/gi;
    while ((m = preloadFont.exec(html)) !== null) add(m[1], 'preload.font');

    // Inline style background-image without file extension (Cloudfront, imgix, CDN URLs with query params)
    // Catches: style="background-image: url(https://cdn.example.com/images/hero?w=1200)"
    const inlineStyleBg = /style=["'][^"']*background(?:-image)?:\s*url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)["']?\s*\)/gi;
    while ((m = inlineStyleBg.exec(html)) !== null) {
      const val = m[1].trim();
      if (!val.startsWith('data:')) add(val, 'inline-bg');
    }

    return Array.from(urls.values());
  }

  // ── Asset URL Replacement ────────────────────────────────────────────────

  function replaceAssetUrls(html, urlMap) {
    let result = html;
    // Sort by URL length descending to prevent partial replacements
    const entries = Array.from(urlMap.entries()).sort((a, b) => b[0].length - a[0].length);
    for (const [original, replacement] of entries) {
      // Escape regex special chars in URL
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), replacement);

      // Also replace the protocol-relative version (//domain.com/...) if the original was https://
      if (original.startsWith('https://')) {
        const protoRelative = original.slice(6); // "//domain.com/..."
        const escapedProto = protoRelative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedProto, 'g'), replacement);
      }
    }
    return result;
  }

  // ── CSS url() resolution (verbatim from url-utils.ts) ─────────────────────

  /**
   * Resolve all relative url() references inside a CSS string based on the
   * URL of the CSS FILE (not the HTML page). This is the key fix for fonts
   * and background images not loading.
   */
  function resolveCssUrls(css, cssFileUrl) {
    return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote, rawVal) => {
      const val = rawVal.trim();
      // Already absolute or a data URI — leave as-is
      if (val.startsWith('data:') || /^https?:\/\//i.test(val) || val.startsWith('//')) {
        return match;
      }
      try {
        const resolved = new URL(val, cssFileUrl).toString();
        return `url(${quote}${resolved}${quote})`;
      } catch {
        return match;
      }
    });
  }

  // ── prepareHtmlForCloning (verbatim from url-utils.ts) ─────────────────────

  function prepareHtmlForCloning(html, baseUrl) {
    let origin = '';
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      origin = '';
    }
    const isUnbounceLike = /lp-pom-|unbounce|d9hhrg4mnvzow\.cloudfront\.net/i.test(html);

    // ── Preserve JS-loaded fonts as CSS <link>s before stripping scripts ──
    const fontLinkInjections = [];
    const fontPatterns = [
      // Typekit CSS: use.typekit.net/xxx.css
      { re: /use\.typekit\.net\/([a-z0-9]+)\.css/gi, build: (id) => `https://use.typekit.net/${id}.css` },
      // Typekit JS: use.typekit.net/xxx.js → convert to CSS equivalent
      { re: /use\.typekit\.net\/([a-z0-9]+)\.js/gi, build: (id) => `https://use.typekit.net/${id}.css` },
      // fonts.com: fast.fonts.net
      { re: /(https?:\/\/fast\.fonts\.net\/[^"'\s;)]+)/gi, build: (url) => url },
      // Google Fonts loaded via JS
      { re: /(https?:\/\/fonts\.googleapis\.com\/css2?[^"'\s;)]+)/gi, build: (url) => url },
      // Webfont providers loaded via preload-as-style patterns
      { re: /(https?:\/\/[^"'\s)]*fonts\.(?:googleapis|fonts\.net|adobe)\.[^"'\s)]*)/gi, build: (url) => url },
    ];
    const seenFontUrls = new Set();
    for (const { re, build } of fontPatterns) {
      let fm;
      while ((fm = re.exec(html)) !== null) {
        const url = build(fm[1]);
        if (!seenFontUrls.has(url)) {
          seenFontUrls.add(url);
          fontLinkInjections.push(`<link rel="stylesheet" href="${url}">`);
        }
      }
    }

    let result = html;

    // Inject font CSS links into <head> before we strip scripts
    if (fontLinkInjections.length > 0) {
      const fontBlock = fontLinkInjections.join('\n');
      if (/<\/head>/i.test(result)) {
        result = result.replace(/<\/head>/i, `${fontBlock}\n</head>`);
      } else if (/<head[^>]*>/i.test(result)) {
        result = result.replace(/<head[^>]*>/i, `$&\n${fontBlock}`);
      } else {
        result = fontBlock + '\n' + result;
      }
    }

    result = result
      // Remove non-essential script tags (keep runtime-critical scripts).
      .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, inline) => {
        const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
        const checkStr = srcMatch ? srcMatch[1] : inline.slice(0, 500);
        if (isUnbounceLike) {
          // Unbounce layout fidelity depends heavily on its runtime scripts.
          // Keep everything except obvious third-party tracking pixels.
          const tracker = /google-analytics|googletagmanager|connect\.facebook\.net|facebook\.com\/tr|hotjar|clarity|segment|mixpanel|amplitude|analytics\.tiktok|taboola|outbrain/i;
          if (tracker.test(checkStr)) return '';
          return full;
        }
        if (ESSENTIAL_SCRIPT_PATTERNS.some(p => p.test(checkStr))) return full;
        return '';
      })
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Remove audio elements and autoplay attributes (prevent music/sound on preview)
      .replace(/<audio[\s\S]*?<\/audio>/gi, '')
      .replace(/\sautoplay(?:="[^"]*")?/gi, '')
      // Remove noscript tags
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // Remove <template> elements — they hold invisible markup that renders as raw text without JS
      .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
      // NOTE: Popup/modal/overlay/aria-hidden removal is handled at RUNTIME in the
      // injected helper script (injectHelpers) which has proper DOM access.
      // Add inline onerror placeholder to EVERY <img> tag.
      .replace(/<img\s/gi, `<img onerror="this.onerror=null;this.style.cssText+=';min-width:120px;min-height:80px;background:repeating-linear-gradient(-45deg,#e2e2e2 0,#e2e2e2 10px,#f0f0f0 10px,#f0f0f0 20px);border:2px dashed #bbb;display:inline-block;box-sizing:border-box'" `)
      // Fix lazy-loaded images: data-src-desktop-*, data-src-mobile-*, data-src, data-lazy-src, etc.
      .replace(/<img\b[^>]*>/gi, (imgTag) => {
        // If img already has a real (non-data-uri) src, leave it alone
        const existingSrc = imgTag.match(/\bsrc=["']([^"']+)["']/i);
        if (existingSrc && !existingSrc[1].startsWith('data:')) return imgTag;

        // Find the best data-src variant
        const variants = [
          /data-src-desktop-3x=["']([^"']+)["']/i,
          /data-src-desktop-2x=["']([^"']+)["']/i,
          /data-src-desktop-1x=["']([^"']+)["']/i,
          /data-src-mobile-3x=["']([^"']+)["']/i,
          /data-src-mobile-2x=["']([^"']+)["']/i,
          /data-src-mobile-1x=["']([^"']+)["']/i,
          /data-src=["']([^"']+)["']/i,
          /data-lazy-src=["']([^"']+)["']/i,
          /data-lazy=["']([^"']+)["']/i,
          /data-original=["']([^"']+)["']/i,
          /data-image=["']([^"']+)["']/i,
        ];
        let bestUrl = '';
        for (const re of variants) {
          const match = imgTag.match(re);
          if (match) { bestUrl = match[1]; break; }
        }
        if (!bestUrl) return imgTag;

        // Fix protocol-relative URLs
        if (bestUrl.startsWith('//')) bestUrl = 'https:' + bestUrl;

        // Replace or add src attribute
        if (existingSrc) {
          return imgTag.replace(/\bsrc=["'][^"']*["']/i, `src="${bestUrl}"`);
        }
        return imgTag.replace(/<img\b/i, `<img src="${bestUrl}"`);
      })
      // Fix lazy-loaded iframes (YouTube, Vimeo, Wistia embeds with data-src)
      .replace(/(<iframe[^>]*?)\sdata-src=(["'])([^"']+)\2/gi, '$1 src=$2$3$2')
      // Fix data-srcset → srcset (responsive lazy images)
      .replace(/\sdata-srcset=/gi, ' srcset=')
      // Fix root-relative URLs → absolute
      .replace(/(href|src|action|data-src)=(["'])\/(?!\/)/g, `$1=$2${origin}/`)
      // Fix protocol-relative URLs (covers src, href, data-src, data-src-desktop-1x, etc.)
      .replace(/((?:href|src|data-[a-z-]+))=(["'])\/\//g, `$1=$2https://`)
      // Fix CSS url() with root-relative paths
      .replace(/url\((["']?)\/(?!\/)/g, `url($1${origin}/`)
      // Relax clipping only for explicit Unbounce text nodes with fixed height.
      .replace(/<([a-z0-9-]+)\b([^>]*(?:id=["'][^"']*lp-pom-text[^"']*["']|class=["'][^"']*lp-pom-text[^"']*["'])[^>]*)>/gi, (_full, tag, attrs) => {
        const styleMatch = attrs.match(/\bstyle=(["'])([\s\S]*?)\1/i);
        if (!styleMatch) return `<${tag}${attrs}>`;
        const styleValue = styleMatch[2];
        const hasFixedHeight = /\bheight\s*:\s*\d+(?:\.\d+)?px/i.test(styleValue);
        const hasOverflowHidden = /\boverflow\s*:\s*hidden/i.test(styleValue);
        if (!hasFixedHeight || !hasOverflowHidden) return `<${tag}${attrs}>`;
        const nextStyle = styleValue
          .replace(/\boverflow\s*:\s*hidden\s*;?/gi, 'overflow: visible;')
          .replace(/\s{2,}/g, ' ');
        return `<${tag}${attrs.replace(styleMatch[0], `style="${nextStyle.trim()}"`)}>`;
      })
      // Force eager loading on all images (cloned pages shouldn't lazy-load)
      .replace(/<img\b[^>]*>/gi, (imgTag) => imgTag.replace(/\bloading=["']lazy["']/gi, 'loading="eager"'))
      // Collapse excess whitespace
      .replace(/\s{3,}/g, '  ')
      .trim();

    // Strip tracking <meta> and preconnect <link> tags
    result = stripTrackingMeta(result);

    // Fix relative URLs in srcset attributes (can't chain because we need baseUrl)
    if (baseUrl) {
      result = result.replace(/\bsrcset=(["'])([^"']+)\1/gi, (_match, quote, srcset) => {
        const fixed = srcset.split(',').map((part) => {
          const trimmed = part.trim();
          const urlEnd = trimmed.search(/\s/);
          const urlPart = urlEnd === -1 ? trimmed : trimmed.slice(0, urlEnd);
          const rest = urlEnd === -1 ? '' : trimmed.slice(urlEnd);
          if (!urlPart || /^(https?:|data:|\/\/)/.test(urlPart)) return part;
          try {
            return new URL(urlPart, baseUrl).toString() + rest;
          } catch {
            return part;
          }
        }).join(', ');
        return `srcset=${quote}${fixed}${quote}`;
      });
    }

    return result;
  }

  // ── injectHelpers (verbatim from url-utils.ts) ─────────────────────────────

  function injectHelpers(html) {
    const helperCss = `<style id="__clone-helpers">
/* Broken or missing images → striped placeholder so you can see where they go */
img[src=""], img:not([src]) {
  min-width: 120px !important;
  min-height: 80px !important;
  background: repeating-linear-gradient(
    -45deg, #e8e8e8 0px, #e8e8e8 10px, #f4f4f4 10px, #f4f4f4 20px
  ) !important;
  border: 1px dashed #bbb !important;
  display: inline-block !important;
}
video:not([src]):not(:has(source[src])) {
  min-width: 200px !important;
  min-height: 120px !important;
  background: #1a1a2e !important;
  display: inline-block !important;
}
</style>`;

    const helperScript = `<script id="__clone-script">
(function() {
  var lazyAttrs = ['data-src','data-lazy-src','data-lazy','data-original','data-image'];

  // Fix lazy-loaded <img> and <source> (picture elements)
  document.querySelectorAll('img, source').forEach(function(el) {
    for (var i = 0; i < lazyAttrs.length; i++) {
      var val = el.getAttribute(lazyAttrs[i]);
      if (val && val.length > 4) {
        if (el.tagName === 'IMG') el.src = val;
        else el.srcset = val;
        break;
      }
    }
  });

  // Fix lazy-loaded <iframe> (Vimeo, Wistia, etc.)
  document.querySelectorAll('iframe[data-src]').forEach(function(f) {
    f.src = f.getAttribute('data-src');
  });

  // Fix lazy-loaded <video>
  document.querySelectorAll('video').forEach(function(v) {
    var ds = v.getAttribute('data-src');
    if (ds) { v.src = ds; }
    v.querySelectorAll('source[data-src]').forEach(function(s) {
      s.src = s.getAttribute('data-src');
    });
    try { v.load(); } catch(e) {}
  });

  // Hide popup/modal overlays, cookie banners, chat widgets, etc.
  // Using DOM instead of regex so we properly handle nested elements.
  var popupWords = ['popup','popin','modal','overlay','lightbox','optin','flyout','off-canvas','offcanvas','email-signup','newsletter','subscribe','exit-intent','promo-bar','promo-popup','cookie','consent','gdpr','chat-widget','intercom','drift-frame','helpscout','crisp','tawk','livechat','side-panel'];
  document.querySelectorAll('[id],[class]').forEach(function(el) {
    var combined = ((el.getAttribute('class') || '') + ' ' + (el.getAttribute('id') || '')).toLowerCase();
    if (!popupWords.some(function(w) { return combined.indexOf(w) !== -1; })) return;
    var cs = window.getComputedStyle(el);
    // Only hide elements that are positioned (popup behavior) — don't touch flow elements
    if (cs.position === 'fixed' || cs.position === 'absolute') {
      el.style.display = 'none';
    }
  });
  // Hide ARIA dialog elements (popups/modals)
  document.querySelectorAll('[role="dialog"]').forEach(function(el) {
    el.style.display = 'none';
  });
  // Hide visually-hidden / screen-reader-only elements that render as visible text without CSS
  document.querySelectorAll('.visually-hidden,.sr-only,.screen-reader-text,[class*="hidden-text"],[class*="seo-content"],[class*="seo-text"]').forEach(function(el) {
    el.style.display = 'none';
  });
  // Also hide any fixed-position element with very high z-index that isn't a nav/header/footer
  document.querySelectorAll('body > *').forEach(function(el) {
    var cs = window.getComputedStyle(el);
    var zIndex = parseInt(cs.zIndex) || 0;
    var tag = el.tagName.toLowerCase();
    if (cs.position === 'fixed' && zIndex > 999 && tag !== 'nav' && tag !== 'header' && tag !== 'footer') {
      el.style.display = 'none';
    }
  });

  // Mark broken images as striped placeholders so you can see the layout
  function styleAsBroken(img) {
    img.style.minWidth = '120px';
    img.style.minHeight = '80px';
    img.style.background = 'repeating-linear-gradient(-45deg,#e8e8e8 0,#e8e8e8 10px,#f4f4f4 10px,#f4f4f4 20px)';
    img.style.border = '1px dashed #bbb';
    img.style.display = img.style.display || 'inline-block';
  }
  document.querySelectorAll('img').forEach(function(img) {
    img.addEventListener('error', function() { styleAsBroken(img); });
    if (img.complete && img.naturalWidth === 0 && img.src) styleAsBroken(img);
  });
})();
<\/script>`;

    let result = html;

    if (/<\/head>/i.test(result)) {
      result = result.replace(/<\/head>/i, helperCss + '\n</head>');
    } else {
      result = helperCss + result;
    }

    if (/<\/body>/i.test(result)) {
      result = result.replace(/<\/body>/i, helperScript + '\n</body>');
    } else {
      result = result + helperScript;
    }

    return result;
  }

  // ── extractPageTitle (verbatim from url-utils.ts) ──────────────────────────

  function extractPageTitle(html) {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!match) return 'Cloned Lander';
    const raw = match[1].trim();
    // Decode common HTML entities so titles like "Page &ndash; Site" become "Page – Site"
    const decoded = raw
      .replace(/&ndash;/gi, '–')
      .replace(/&mdash;/gi, '—')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return decoded.slice(0, 80);
  }

  // ── formatPageName (verbatim from url-utils.ts) ────────────────────────────

  /** Format date as MM.DD.YY */
  function formatDate() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}.${dd}.${yy}`;
  }

  /**
   * Build structured page name:
   * Vertical - Offer Name - Lander Type - Sub Angle - MM.DD.YY
   * Missing segments are omitted cleanly.
   */
  function formatPageName(name, opts) {
    const parts = [];
    if (opts && opts.vertical) parts.push(opts.vertical);
    if (name) parts.push(name);
    if (opts && opts.pageType) {
      // Capitalize: "top-5" → "Top 5", "advertorial" → "Advertorial"
      parts.push(opts.pageType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    }
    if (opts && opts.angle) {
      // Use first 4 words of angle as "sub angle"
      const subAngle = opts.angle.split(/\s+/).slice(0, 4).join(' ');
      if (subAngle.length > 2) parts.push(subAngle);
    }
    parts.push(formatDate());
    return parts.join(' - ');
  }

  // ── cleanAssetName (verbatim from app/api/clone/route.ts) ──────────────────

  /**
   * Extract a clean, human-readable filename from a CDN/builder URL.
   * Handles Unbounce, ClickFunnels, Leadpages, and generic CDN URLs with ugly hashes.
   */
  function cleanAssetName(rawUrl, contentType, counter) {
    let filename = (rawUrl.split('/').pop() || 'asset').split('?')[0].split('#')[0] || 'asset';
    try { filename = decodeURIComponent(filename); } catch (err) { /* leave as-is */ }

    // Unbounce pattern: "8a7910be-untitled-7_101j01k000000000000028.png"
    const unbounceMatch = filename.match(/^[0-9a-f]{8}-(.+?)_[0-9a-z]{20,}\.?(\w*)$/i);
    if (unbounceMatch) {
      const name = unbounceMatch[1].replace(/[_-]+/g, '-');
      const ext = unbounceMatch[2] || '';
      filename = ext ? `${name}.${ext}` : name;
    }
    // Also handle: "37cc8484-54_10000000..." where "54" is the only descriptive part
    if (!unbounceMatch) {
      const shortUnbounce = filename.match(/^([0-9a-f]{8})-([^_]{1,3})_[0-9a-z]{20,}\.?(\w*)$/i);
      if (shortUnbounce) {
        const ext = shortUnbounce[3] || '';
        filename = ext ? `img-${shortUnbounce[1].slice(0, 4)}-${shortUnbounce[2]}.${ext}` : `img-${shortUnbounce[1].slice(0, 4)}-${shortUnbounce[2]}`;
      }
    }

    // Generic hash prefix: "a1b2c3d4_filename.jpg" → "filename.jpg"
    filename = filename.replace(/^[0-9a-f]{6,12}[-_]/i, '');

    // Strip long numeric/hash suffixes before extension: "hero-banner-abc123def456.jpg" → "hero-banner.jpg"
    filename = filename.replace(/[-_][0-9a-f]{12,}(\.\w+)$/i, '$1');

    // Clean up
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

    // If we're left with just a hash or gibberish (< 3 chars before ext), use a generic name
    const nameOnly = filename.replace(/\.\w+$/, '');
    if (nameOnly.length < 3 || /^[0-9a-f]{6,}$/i.test(nameOnly)) {
      const idx = ++counter.value;
      const extMatch = filename.match(/\.\w+$/);
      filename = `asset-${idx}${extMatch ? extMatch[0] : ''}`;
    }

    // Ensure has extension from content-type
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
      const extMap = {
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
        'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg',
        'image/bmp': '.bmp', 'image/tiff': '.tiff', 'image/x-icon': '.ico',
        'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
      };
      filename += extMap[contentType.split(';')[0].trim()] || '.bin';
    }

    return filename.slice(0, 80);
  }

  /* ==========================================================================
   * NETWORK LAYER — all external fetches go through a CORS proxy.
   * ======================================================================== */

  // Ordered list of proxy URL builders. Each takes a target URL and returns a
  // fetchable proxy URL. Tried in order until one returns res.ok.
  // Ordered most-reliable-first. The first is a dedicated Cloudflare Worker
  // (locked to this app's origin) that reliably proxies both pages AND binary
  // images — the public proxies below are fallbacks only and frequently fail on
  // image downloads, so they should rarely be reached.
  const PROXIES = [
    (u) => 'https://page-cloner-proxy.ferchonaso.workers.dev/?url=' + encodeURIComponent(u),
    (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + u,
  ];

  const DEFAULT_TIMEOUT_MS = 20000;

  // Build a proxy URL from a user-supplied override. The override is either a
  // prefix-style proxy (append the encoded URL) or a template containing {url}.
  function buildOverrideUrl(override, targetUrl) {
    if (override.includes('{url}')) {
      return override.replace('{url}', encodeURIComponent(targetUrl));
    }
    return override + encodeURIComponent(targetUrl);
  }

  // Fetch a target URL through a CORS proxy.
  // Options: { asBlob, proxyOverride, timeoutMs }
  // Returns { text } or { blob, contentType }. Throws if all proxies fail.
  async function proxiedFetch(url, opts) {
    opts = opts || {};
    const asBlob = !!opts.asBlob;
    const proxyOverride = opts.proxyOverride;
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

    // Build the ordered list of proxy URLs to try.
    const builders = [];
    if (proxyOverride) {
      builders.push((u) => buildOverrideUrl(proxyOverride, u));
    }
    for (const p of PROXIES) builders.push(p);

    let lastError = null;

    for (const build of builders) {
      let proxyUrl;
      try {
        proxyUrl = build(url);
      } catch (err) {
        lastError = err;
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) {
          lastError = new Error(`Proxy returned ${res.status} for ${url}`);
          continue;
        }
        if (asBlob) {
          const blob = await res.blob();
          const contentType = res.headers.get('content-type') || blob.type || 'application/octet-stream';
          return { blob, contentType };
        }
        const text = await res.text();
        return { text };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        // Try the next proxy
      }
    }

    throw new Error(
      'All CORS proxies failed — the site may block proxies. ' +
      'Try a different proxy in Advanced settings.' +
      (lastError ? ` (last error: ${lastError.message})` : '')
    );
  }

  /**
   * Finds all external <link rel="stylesheet"> tags (skipping CDNs),
   * fetches them through the proxy, resolves their internal relative URLs
   * (based on the CSS file's own URL), resolves any @import chains one level
   * deep, then inlines them as <style> blocks. Mirrors :root var-hoisting.
   */
  async function fetchAndInlineCss(html, baseUrl, proxyOverride) {
    const linkRegex = /<link[^>]+>/gi;
    const relStylesheet = /rel=["']stylesheet["']/i;
    const hrefExtract = /href=["']([^"']+)["']/i;

    const linksToFetch = [];

    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const tag = match[0];
      if (!relStylesheet.test(tag)) continue;

      const hrefMatch = hrefExtract.exec(tag);
      if (!hrefMatch) continue;

      const rawHref = hrefMatch[1];

      // Skip CDN domains — keep them as <link> so browser loads them natively
      if (SKIP_CSS_DOMAINS.some((d) => rawHref.includes(d))) continue;
      if (rawHref.startsWith('data:')) continue;

      let resolvedUrl;
      try {
        resolvedUrl = new URL(rawHref, baseUrl).toString();
      } catch {
        continue;
      }

      linksToFetch.push({ tag, resolvedUrl });
    }

    const toProcess = linksToFetch.slice(0, 20);
    if (toProcess.length === 0) return html;

    // Resolve @import statements in a CSS file (one level deep) via the proxy.
    const resolveImports = async (css, cssFileUrl, depth) => {
      depth = depth || 0;
      if (depth >= 3) return css;

      // Matches: @import url('x'), @import url("x"), @import 'x', @import "x"
      const importRe = /@import\s+(?:url\(["']?|["'])([^"');\s]+)["']?\)?[^;]*;/gi;
      const found = [];
      let im;
      while ((im = importRe.exec(css)) !== null) {
        found.push({ full: im[0], rawUrl: im[1] });
      }
      if (found.length === 0) return css;

      const results = await Promise.allSettled(
        found.slice(0, 6).map(async ({ full, rawUrl }) => {
          // Keep CDN imports (Google Fonts etc.) as-is — browser loads them fine
          if (SKIP_CSS_DOMAINS.some((d) => rawUrl.includes(d))) return { full, content: null };
          let importedUrl;
          try {
            importedUrl = new URL(rawUrl, cssFileUrl).toString();
          } catch {
            return { full, content: null };
          }
          try {
            const { text } = await proxiedFetch(importedUrl, { proxyOverride, timeoutMs: 8000 });
            let importedCss = resolveCssUrls(text, importedUrl);
            importedCss = await resolveImports(importedCss, importedUrl, depth + 1);
            return { full, content: importedCss.slice(0, 150000) };
          } catch {
            return { full, content: null };
          }
        })
      );

      let out = css;
      for (const settled of results) {
        if (settled.status !== 'fulfilled') continue;
        const { full, content } = settled.value;
        if (content) out = out.replace(full, content);
      }
      return out;
    };

    const fetched = await Promise.allSettled(
      toProcess.map(async ({ tag, resolvedUrl }) => {
        try {
          const { text } = await proxiedFetch(resolvedUrl, { proxyOverride, timeoutMs: 12000 });
          let css = text.slice(0, 512000);

          // KEY FIX: resolve url() references relative to THIS CSS file's URL,
          // not the HTML page URL. Fixes fonts, background images, etc.
          css = resolveCssUrls(css, resolvedUrl);

          // Resolve @import chains one level deep
          css = await resolveImports(css, resolvedUrl);

          return { tag, css };
        } catch {
          return { tag, css: null };
        }
      })
    );

    // Collect all :root { ... } blocks from every fetched stylesheet so that
    // var(--...) references resolve. Inject them BEFORE all other styles.
    const rootBlocks = [];
    const extractRootBlocks = (css) => {
      const rootRe = /:root\s*\{/gi;
      let rm;
      const collected = [];
      while ((rm = rootRe.exec(css)) !== null) {
        let depth = 1;
        let i = rm.index + rm[0].length;
        while (i < css.length && depth > 0) {
          if (css[i] === '{') depth++;
          else if (css[i] === '}') depth--;
          i++;
        }
        collected.push(`:root {${css.slice(rm.index + rm[0].length, i)}`);
      }
      return collected.join('\n');
    };

    let result = html;
    for (const settled of fetched) {
      if (settled.status !== 'fulfilled') continue;
      const { tag, css } = settled.value;
      if (!css) continue;
      const rootBlock = extractRootBlocks(css);
      if (rootBlock) rootBlocks.push(rootBlock);
      result = result.replace(tag, `<style>\n${css}\n</style>`);
    }

    // Inject all collected :root blocks as a single <style> at the very top of
    // <head> so custom properties are defined before any stylesheet references them.
    if (rootBlocks.length > 0) {
      const rootStyleTag = `<style id="__root-vars">\n${rootBlocks.join('\n')}\n</style>`;
      if (/<head[^>]*>/i.test(result)) {
        result = result.replace(/<head[^>]*>/i, `$&\n${rootStyleTag}`);
      } else {
        result = rootStyleTag + '\n' + result;
      }
    }

    return result;
  }

  /* ==========================================================================
   * MAIN PIPELINE — mirrors app/api/clone/route.ts.
   * ======================================================================== */

  const ASSET_CONCURRENCY = 6;
  const MAX_ASSET_BYTES = 15_000_000; // skip assets > 15MB
  const MIN_ASSET_BYTES = 100;        // skip assets < 100 bytes

  function normalizeUrl(raw) {
    let url = (raw || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  // Download assets through the proxy with bounded concurrency. One failure
  // never aborts the whole clone — failed assets keep their original URL.
  async function downloadAssets(assets, opts) {
    const proxyOverride = opts.proxyOverride;
    const onProgress = opts.onProgress || (() => {});
    const counter = { value: 0 };
    const usedNames = new Set();
    const assetFiles = new Map();  // filename → blob
    const urlMap = new Map();      // originalUrl → assets/<filename>

    const total = assets.length;
    let processed = 0;
    let embedded = 0;
    let failed = 0;

    const queue = assets.slice();

    const worker = async () => {
      while (queue.length > 0) {
        const asset = queue.shift();
        if (!asset) break;
        try {
          const { blob, contentType } = await proxiedFetch(asset.originalUrl, {
            asBlob: true,
            proxyOverride,
            timeoutMs: 15000,
          });
          if (blob.size < MIN_ASSET_BYTES || blob.size > MAX_ASSET_BYTES) {
            failed++;
          } else {
            let filename = cleanAssetName(asset.originalUrl, contentType, counter);
            // Ensure unique filename within the zip
            let unique = filename;
            let n = 1;
            while (usedNames.has(unique)) {
              const dot = filename.lastIndexOf('.');
              if (dot > 0) {
                unique = filename.slice(0, dot) + '-' + n + filename.slice(dot);
              } else {
                unique = filename + '-' + n;
              }
              n++;
            }
            usedNames.add(unique);
            assetFiles.set(unique, blob);
            urlMap.set(asset.originalUrl, 'assets/' + unique);
            embedded++;
          }
        } catch (err) {
          // Swallow per-asset failures — leave original URL untouched.
          failed++;
        } finally {
          processed++;
          onProgress(`Downloading images… ${processed}/${total}`);
        }
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(ASSET_CONCURRENCY, Math.max(1, assets.length)); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    return { assetFiles, urlMap, embedded, failed };
  }

  /**
   * Clone a page entirely client-side.
   * opts = { downloadImages, proxyOverride, onProgress }
   * Returns { htmlLive, title, zipBlob | null, stats: { assetsTotal, assetsEmbedded, assetsFailed } }
   */
  async function clonePage(url, opts) {
    opts = opts || {};
    const onProgress = opts.onProgress || (() => {});
    const proxyOverride = opts.proxyOverride;

    // 1. Normalize + fetch the raw page HTML through the proxy.
    const finalUrl = normalizeUrl(url);
    onProgress('Fetching page…');
    let rawHtml;
    try {
      const res = await proxiedFetch(finalUrl, { proxyOverride });
      rawHtml = res.text;
    } catch (err) {
      throw new Error(
        'All CORS proxies failed — the site may block proxies. ' +
        'Try a different proxy in Advanced settings.'
      );
    }

    // 2. Strip trackers, fix relative URLs → absolute.
    onProgress('Stripping trackers & fixing URLs…');
    const cleaned = prepareHtmlForCloning(rawHtml, finalUrl);

    // 3. Fetch external CSS and inline it.
    onProgress('Inlining stylesheets…');
    const withCss = await fetchAndInlineCss(cleaned, finalUrl, proxyOverride);

    // 4. Inject lazy-load fix + broken-image placeholders, then <base> + viewport.
    let htmlLive = injectHelpers(withCss);
    {
      let baseOrigin = '';
      try { baseOrigin = new URL(finalUrl).origin; } catch { /* ignore */ }
      if (baseOrigin) {
        const hasBase = /<base\b/i.test(htmlLive);
        const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(htmlLive);
        const injectTags = (
          (!hasBase ? `<base href="${baseOrigin}/">\n` : '') +
          (!hasViewport ? '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' : '')
        );
        if (injectTags) {
          if (/<head[^>]*>/i.test(htmlLive)) {
            htmlLive = htmlLive.replace(/<head[^>]*>/i, `$&\n${injectTags}`);
          } else {
            htmlLive = injectTags + htmlLive;
          }
        }
      }
    }

    const title = extractPageTitle(rawHtml);

    // 5. Optionally download images and build a zip.
    let zipBlob = null;
    let assetsTotal = 0;
    let assetsEmbedded = 0;
    let assetsFailed = 0;

    if (opts.downloadImages) {
      onProgress('Downloading images…');

      // Extract from BOTH rawHtml (catches data-src-*, protocol-relative URLs)
      // AND htmlLive (catches CSS background-image URLs from inlined stylesheets).
      // Merge: raw assets take priority, then add new ones from processed HTML.
      const rawAssets = extractAssetUrls(rawHtml, finalUrl);
      const processedAssets = extractAssetUrls(htmlLive, finalUrl);
      const seenUrls = new Set(rawAssets.map(a => a.originalUrl));
      const assets = rawAssets.concat(processedAssets.filter(a => !seenUrls.has(a.originalUrl)));
      assetsTotal = assets.length;

      if (assets.length > 0) {
        const { assetFiles, urlMap, embedded, failed } = await downloadAssets(assets, {
          proxyOverride,
          onProgress,
        });
        assetsEmbedded = embedded;
        assetsFailed = failed;

        // Rewrite a COPY of htmlLive: original asset URL → assets/<filename>.
        const rewritten = replaceAssetUrls(htmlLive, urlMap);

        if (typeof JSZip === 'undefined') {
          throw new Error('JSZip is not loaded — include vendor/jszip.min.js before clone-core.js.');
        }
        onProgress('Building zip…');
        const zip = new JSZip();
        zip.file('page.html', rewritten);
        const assetsFolder = zip.folder('assets');
        for (const [filename, blob] of assetFiles.entries()) {
          assetsFolder.file(filename, blob);
        }
        zipBlob = await zip.generateAsync({ type: 'blob' });
      }
    }

    return {
      htmlLive,
      title,
      zipBlob,
      stats: { assetsTotal, assetsEmbedded, assetsFailed },
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.Cloner = { clonePage, PROXIES, proxiedFetch };
})();
