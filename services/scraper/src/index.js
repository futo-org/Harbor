'use strict';
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create(
        (typeof Iterator === 'function' ? Iterator : Object).prototype,
      );
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
var _a;
Object.defineProperty(exports, '__esModule', { value: true });
exports.scrape = void 0;
var node_http_1 = require('node:http');
var browserless_1 = require('browserless');
var html_get_1 = require('html-get');
var metascraper_1 = require('metascraper');
var metascraper_description_1 = require('metascraper-description');
var metascraper_image_1 = require('metascraper-image');
var metascraper_title_1 = require('metascraper-title');
var metascraper_url_1 = require('metascraper-url');
// A real desktop Chrome UA. Headless Chromium's default `HeadlessChrome` UA
// gets some sites (e.g. YouTube) to redirect to an "unsupported browser" gate
// instead of serving the page, so we present a normal browser identity.
var USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// Spawn the Chromium process once for the lifetime of the service. The
// `--user-agent` flag sets the UA browser-wide for the prerender path.
//
// Passing `args` replaces browserless's defaultArgs entirely, so we must
// re-add the sandbox flags it would otherwise supply. Without `--no-sandbox` /
// `--disable-setuid-sandbox`, Chromium can't launch as our non-root user in a
// container that lacks CAP_SYS_ADMIN or unprivileged user namespaces.
// `--disable-dev-shm-usage` avoids crashes when `/dev/shm` is small.
var browserlessFactory = await (0, browserless_1.default)({
  launchOpts: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--user-agent='.concat(USER_AGENT),
    ],
  },
});
// Tear the Chromium process down when Node exits.
process.on('exit', function () {
  console.log('closing resources!');
  browserlessFactory.close();
});
// Extract only the fields that map onto a polycentric `Link`.
var scrapeMetadata = (0, metascraper_1.default)([
  (0, metascraper_title_1.default)(),
  (0, metascraper_description_1.default)(),
  (0, metascraper_image_1.default)(),
  (0, metascraper_url_1.default)(),
]);
/**
 * Fetch `targetUrl` and extract its Open Graph / HTML metadata.
 *
 * `html-get` decides whether a plain fetch suffices or the page needs to be
 * prerendered through headless Chromium (e.g. client-side apps that inject
 * their tags via JS), so callers don't have to. Each call runs in its own
 * browser context, which is always torn down afterwards.
 */
var scrape = function (targetUrl) {
  return __awaiter(void 0, void 0, void 0, function () {
    var context, _a, html, url, meta;
    var _b, _c, _d, _e;
    return __generator(this, function (_f) {
      switch (_f.label) {
        case 0:
          context = browserlessFactory.createContext();
          _f.label = 1;
        case 1:
          _f.trys.push([1, , 4, 7]);
          return [
            4 /*yield*/,
            (0, html_get_1.default)(targetUrl, {
              getBrowserless: function () {
                return context;
              },
              // Same UA on the plain-fetch path (html-get may skip the browser).
              headers: { 'user-agent': USER_AGENT },
            }),
          ];
        case 2:
          (_a = _f.sent()), (html = _a.html), (url = _a.url);
          return [4 /*yield*/, scrapeMetadata({ html: html, url: url })];
        case 3:
          meta = _f.sent();
          return [
            2 /*return*/,
            {
              title: (_b = meta.title) !== null && _b !== void 0 ? _b : null,
              description:
                (_c = meta.description) !== null && _c !== void 0 ? _c : null,
              image: (_d = meta.image) !== null && _d !== void 0 ? _d : null,
              url: (_e = meta.url) !== null && _e !== void 0 ? _e : null,
            },
          ];
        case 4:
          return [4 /*yield*/, context];
        case 5:
          return [4 /*yield*/, _f.sent().destroyContext()];
        case 6:
          _f.sent();
          return [7 /*endfinally*/];
        case 7:
          return [2 /*return*/];
      }
    });
  });
};
exports.scrape = scrape;
var PORT = Number(
  (_a = process.env.PORT) !== null && _a !== void 0 ? _a : 8855,
);
/** Largest image we'll proxy. Preview thumbnails are small; this bounds memory. */
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Abort an image fetch that stalls. This bounds the scraper's hop to the
 *  arbitrary third-party host — the Rust caller's timeout only covers the
 *  server→scraper hop and does not cancel this outbound fetch, so without it a
 *  slow host would pin a socket here indefinitely. */
var IMAGE_FETCH_TIMEOUT_MS = 10000;
var sendJson = function (res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
var isValidHttpUrl = function (target) {
  try {
    var protocol = new URL(target).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch (_a) {
    return false;
  }
};
// NOTE: scheme validation only — this service is the one place outbound
// fetching happens, so real SSRF protection is its network egress boundary
// (the browser fetches a page + every subresource, so per-request filtering
// here is impractical). Keep it constrained at the network layer.
var handleScrape = function (target, res) {
  return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, error_1;
    return __generator(this, function (_c) {
      switch (_c.label) {
        case 0:
          if (!isValidHttpUrl(target)) {
            sendJson(res, 400, { error: 'url must be http or https' });
            return [2 /*return*/];
          }
          _c.label = 1;
        case 1:
          _c.trys.push([1, 3, , 4]);
          _a = sendJson;
          _b = [res, 200];
          return [4 /*yield*/, (0, exports.scrape)(target)];
        case 2:
          _a.apply(void 0, _b.concat([_c.sent()]));
          return [3 /*break*/, 4];
        case 3:
          error_1 = _c.sent();
          console.error('scrape failed:', error_1);
          sendJson(res, 502, { error: 'failed to scrape url' });
          return [3 /*break*/, 4];
        case 4:
          return [2 /*return*/];
      }
    });
  });
};
/** Fetch a remote image and stream it back — the image-proxy counterpart to
 *  `/scrape`. No browser needed; a plain fetch suffices. */
var handleImage = function (target, res) {
  return __awaiter(void 0, void 0, void 0, function () {
    var upstream, contentType, chunks, total, reader, _a, done, value, error_2;
    var _b, _c, _d;
    return __generator(this, function (_e) {
      switch (_e.label) {
        case 0:
          if (!isValidHttpUrl(target)) {
            sendJson(res, 400, { error: 'url must be http or https' });
            return [2 /*return*/];
          }
          _e.label = 1;
        case 1:
          _e.trys.push([1, 9, , 10]);
          return [
            4 /*yield*/,
            fetch(target, {
              signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
            }),
          ];
        case 2:
          upstream = _e.sent();
          if (!upstream.ok) {
            sendJson(res, 502, {
              error: 'upstream returned '.concat(upstream.status),
            });
            return [2 /*return*/];
          }
          contentType =
            (_b = upstream.headers.get('content-type')) !== null &&
            _b !== void 0
              ? _b
              : '';
          if (!contentType.startsWith('image/')) {
            sendJson(res, 415, { error: 'not an image' });
            return [2 /*return*/];
          }
          // Reject early on an honest oversized content-length.
          if (
            Number(
              (_c = upstream.headers.get('content-length')) !== null &&
                _c !== void 0
                ? _c
                : 0,
            ) > MAX_IMAGE_BYTES
          ) {
            sendJson(res, 413, { error: 'image too large' });
            return [2 /*return*/];
          }
          chunks = [];
          total = 0;
          reader =
            (_d = upstream.body) === null || _d === void 0
              ? void 0
              : _d.getReader();
          if (!reader) return [3 /*break*/, 8];
          _e.label = 3;
        case 3:
          return [4 /*yield*/, reader.read()];
        case 4:
          (_a = _e.sent()), (done = _a.done), (value = _a.value);
          if (done) return [3 /*break*/, 8];
          total += value.byteLength;
          if (!(total > MAX_IMAGE_BYTES)) return [3 /*break*/, 6];
          return [4 /*yield*/, reader.cancel()];
        case 5:
          _e.sent(); // release the upstream socket promptly
          sendJson(res, 413, { error: 'image too large' });
          return [2 /*return*/];
        case 6:
          chunks.push(Buffer.from(value));
          _e.label = 7;
        case 7:
          return [3 /*break*/, 3];
        case 8:
          res.writeHead(200, {
            'content-type': contentType,
            'cache-control': 'public, max-age=86400',
          });
          res.end(Buffer.concat(chunks));
          return [3 /*break*/, 10];
        case 9:
          error_2 = _e.sent();
          console.error('image fetch failed:', error_2);
          sendJson(res, 502, { error: 'failed to fetch image' });
          return [3 /*break*/, 10];
        case 10:
          return [2 /*return*/];
      }
    });
  });
};
// Internal-only HTTP API the polycentric server calls. Must not be exposed
// publicly (it fetches arbitrary URLs).
var server = (0, node_http_1.createServer)(function (req, res) {
  var _a;
  var _b = new URL(
      (_a = req.url) !== null && _a !== void 0 ? _a : '/',
      'http://localhost',
    ),
    pathname = _b.pathname,
    searchParams = _b.searchParams;
  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (req.method === 'GET' && pathname === '/scrape') {
    var target = searchParams.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'missing url parameter' });
      return;
    }
    void handleScrape(target, res);
    return;
  }
  if (req.method === 'GET' && pathname === '/image') {
    var target = searchParams.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'missing url parameter' });
      return;
    }
    void handleImage(target, res);
    return;
  }
  sendJson(res, 404, { error: 'not found' });
});
server.listen(PORT, function () {
  console.log('scraper listening on :'.concat(PORT));
});
// Graceful shutdown: stop accepting requests, then tear down Chromium.
var shutdown = function () {
  server.close(function () {
    void browserlessFactory.close().finally(function () {
      return process.exit(0);
    });
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
