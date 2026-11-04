//! A shared headless Chrome for the platforms whose bot protection rejects
//! plain HTTP clients (Kick, Rumble).
//!
//! The TypeScript bot used puppeteer-extra's stealth plugin. This replicates
//! the evasions that matter for a single page load: new headless mode,
//! `AutomationControlled` off (`navigator.webdriver`), a user agent without
//! `HeadlessChrome`, and a script run before page scripts that fills in
//! what headless Chrome lacks (`window.chrome`, plugins, languages,
//! notification permission, WebGL vendor, outer window size).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::SetUserAgentOverrideParams;
use chromiumoxide::page::Page;
use futures::StreamExt;
use tokio::sync::Mutex;

/// How long one page may take to load.
const NAVIGATION_TIMEOUT: Duration = Duration::from_secs(45);

/// Runs before any page script (puppeteer-extra-plugin-stealth's evasions,
/// condensed).
const STEALTH_SCRIPT: &str = r#"
(() => {
  const define = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch (_) {}
  };
  define(Navigator.prototype, 'webdriver', false);
  define(Navigator.prototype, 'languages', ['en-US', 'en']);
  if (!window.chrome) {
    window.chrome = {
      app: { isInstalled: false, InstallState: {}, RunningState: {} },
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
    };
  }
  const plugins = [
    { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  ];
  if (navigator.plugins.length === 0) {
    const list = plugins.map((p) => Object.assign(Object.create(Plugin.prototype), p, { length: 0 }));
    Object.assign(list, { item: (i) => list[i], namedItem: (n) => list.find((p) => p.name === n), refresh: () => {} });
    Object.setPrototypeOf(list, PluginArray.prototype);
    define(Navigator.prototype, 'plugins', list);
  }
  const query = window.navigator.permissions && window.navigator.permissions.query;
  if (query) {
    window.navigator.permissions.query = (parameters) =>
      parameters && parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : query.call(window.navigator.permissions, parameters);
  }
  for (const proto of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!proto) continue;
    const getParameter = proto.prototype.getParameter;
    proto.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
  }
  if (window.outerWidth === 0 && window.outerHeight === 0) {
    define(window, 'outerWidth', window.innerWidth);
    define(window, 'outerHeight', window.innerHeight + 85);
  }
})();
"#;

struct Running {
    browser: Browser,
    user_agent: String,
    handler: tokio::task::JoinHandle<()>,
}

/// A lazily launched Chrome, relaunched if it dies.
pub struct SharedBrowser {
    executable: Option<PathBuf>,
    running: Mutex<Option<Running>>,
}

/// A loaded page: its HTML and the HTTP status of the document.
pub struct Loaded {
    pub status: Option<u16>,
    pub html: String,
}

impl SharedBrowser {
    pub fn new(executable: Option<String>) -> Arc<Self> {
        Arc::new(Self {
            executable: executable.map(PathBuf::from),
            running: Mutex::new(None),
        })
    }

    async fn launch(&self) -> Result<Running, String> {
        let mut config = BrowserConfig::builder()
            .new_headless_mode()
            .no_sandbox()
            .hide()
            .arg("--disable-setuid-sandbox")
            .arg("--disable-blink-features=AutomationControlled")
            .launch_timeout(Duration::from_secs(30))
            .request_timeout(NAVIGATION_TIMEOUT);
        if let Some(path) = &self.executable {
            config = config.chrome_executable(path);
        }
        // A profile of its own per launch: Chrome refuses a profile another
        // process (a crashed predecessor, a second bot) still holds.
        static LAUNCHES: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let profile = std::env::temp_dir().join(format!(
            "verifier-bot-chrome-{}-{}",
            std::process::id(),
            LAUNCHES.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&profile);
        config = config.user_data_dir(&profile);
        let config = config.build()?;
        let (browser, mut handler) = Browser::launch(config)
            .await
            .map_err(|e| format!("failed to launch Chrome: {e}"))?;
        let handler = tokio::spawn(async move {
            while let Some(event) = handler.next().await {
                if let Err(e) = event {
                    tracing::debug!("chrome handler: {e}");
                }
            }
        });
        let user_agent = browser
            .user_agent()
            .await
            .map_err(|e| format!("failed to read Chrome's user agent: {e}"))?
            .replace("HeadlessChrome/", "Chrome/");
        tracing::info!("Launched headless Chrome ({user_agent})");
        Ok(Running {
            browser,
            user_agent,
            handler,
        })
    }

    /// Launch Chrome now so the first verification doesn't wait for it.
    pub async fn warm_up(&self) {
        match self.page().await {
            Ok((page, _)) => {
                let _ = page.close().await;
            }
            Err(e) => tracing::error!("Headless browser unavailable: {e}"),
        }
    }

    /// A fresh page with the stealth evasions applied.
    async fn page(&self) -> Result<(Page, String), String> {
        let mut running = self.running.lock().await;
        if let Some(r) = running.as_ref()
            && r.handler.is_finished()
        {
            tracing::warn!("Chrome exited; relaunching");
            *running = None;
        }
        if running.is_none() {
            *running = Some(self.launch().await?);
        }
        let r = running.as_ref().expect("launched above");
        match r.browser.new_page("about:blank").await {
            Ok(page) => Ok((page, r.user_agent.clone())),
            Err(e) => {
                // The connection is likely dead; relaunch next time.
                *running = None;
                Err(format!("failed to open a page: {e}"))
            }
        }
    }

    /// Load `url` in a fresh page and return its HTML.
    pub async fn load(&self, url: &str) -> Result<Loaded, String> {
        let (page, user_agent) = self.page().await?;
        let result = tokio::time::timeout(NAVIGATION_TIMEOUT, async {
            page.set_user_agent(
                SetUserAgentOverrideParams::builder()
                    .user_agent(user_agent)
                    .accept_language("en-US,en")
                    .build()
                    .map_err(|e| e.to_string())?,
            )
            .await
            .map_err(|e| e.to_string())?;
            page.evaluate_on_new_document(STEALTH_SCRIPT)
                .await
                .map_err(|e| e.to_string())?;
            page.goto(url).await.map_err(|e| e.to_string())?;
            let status = page
                .evaluate("performance.getEntriesByType('navigation')[0]?.responseStatus ?? null")
                .await
                .ok()
                .and_then(|v| v.into_value::<Option<u16>>().ok())
                .flatten();
            let html = page.content().await.map_err(|e| e.to_string())?;
            Ok::<_, String>(Loaded { status, html })
        })
        .await
        .unwrap_or_else(|_| Err(format!("timed out loading {url}")));
        if let Err(e) = page.close().await {
            tracing::debug!("failed to close page: {e}");
        }
        result
    }
}
