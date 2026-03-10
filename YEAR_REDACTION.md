## Year Redaction in Iframe

To hide the target year from the archived page, we must fetch the HTML and modify it before display.

### Working Approach
1.  **Fetch via Proxy:** Use a CORS proxy to fetch the "naked" Wayback URL (`...id_/http...`).
2.  **Regex Replace:** Apply `/\b(19|20)\d{2}\b/g` to the HTML string to replace years with `XXXX`.
3.  **Manual URL Rewriting:** Rewrite root-relative URLs (`href="/..."`, `src="/..."`, `url(/...)`) to absolute Wayback URLs (e.g., `https://web.archive.org/web/[timestamp]/[original_url]/[path]`) to prevent 404s and CORB blocks.
4.  **Inject via `srcdoc`:** Set the modified HTML to the iframe's `srcdoc` attribute. This allows the iframe to inherit the parent origin, facilitating smoother resource loading.
5.  **Base Tag:** Inject a `<base>` tag as a fallback for truly relative URLs.

### What Didn't Work
-   **Direct `src`:** Content cannot be modified due to CORS.
-   **Blob URLs:** Often triggered `CORB` (Cross-Origin Read Blocking) because the browser treated the `blob:` origin as a security boundary, blocking CSS/images that lacked CORS headers.
-   **Solely `<base>` tag:** Root-relative links (starting with `/`) ignore the base path and resolve to the current domain's root, causing 404s (which are then blocked by CORB as HTML-loaded-as-CSS).

## Debugging & Common Console Errors (Red Herrings)

When debugging broken sites in the iframe, you will often see many console errors. Most of these are expected due to our security configuration and can be ignored.

### Expected Errors (Safe to ignore)
-   **`Uncaught SecurityError: Failed to read the 'cookie' property`**: This happens because the iframe is sandboxed without `allow-same-origin`. Archived scripts trying to access cookies or localStorage will fail. This is intended for security.
-   **`Blocked opening '...' in a new window`**: Our iframe sandbox lacks `allow-popups`. Any archived links or scripts trying to open new tabs will be blocked.
-   **`net::ERR_BLOCKED_BY_CLIENT`**: Usually caused by your browser's ad-blocker catching old tracking scripts (like `top.list.ru` or `analytics.js`) that were archived along with the page.
-   **`429 (Too Many Requests)`**: Indicates the public CORS proxy (`corsproxy.io`) is rate-limiting you. Wait a few minutes or try a different proxy.
-   **`[Violation] Avoid using document.write()`**: Older sites often use this; modern browsers log it as a warning, but it usually still works for historical content.

### Actual Problems (Require investigation)
-   **`404 (Not Found)` for CSS/Images**: Indicates our URL rewriting logic missed a relative path or the Wayback Machine doesn't have that specific asset archived.
-   **`CORB blocked a cross-origin response`**: Usually means a URL was resolved to a 404 HTML page instead of the actual asset (like a `.css` file), and the browser blocked it to prevent sensitive data leaks.
