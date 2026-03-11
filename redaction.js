/**
 * Fetches an archived page from the Wayback Machine, redacts years (19xx, 20xx),
 * and rewrites internal URLs to ensure resources load correctly when used in srcdoc.
 */
async function fetchAndRedact(archivedUrl) {
    const timestampMatch = archivedUrl.match(/\/web\/(\d+)/);
    if (!timestampMatch) return null;
    let timestamp = timestampMatch[1];
    
    const siteUrlMatch = archivedUrl.match(/\/web\/\d+[a-z_]*\/(https?:\/\/.*|.*)/);
    if (!siteUrlMatch) return null;
    let siteUrl = siteUrlMatch[1].replace(/\/$/, ""); 

    // NO API RESOLUTION - Using the timestamp exactly as provided
    const archiveBase = `https://web.archive.org/web/${timestamp}`;
    const idUrl = `${archiveBase}id_/${siteUrl}`;
    const proxyUrl = "https://corsproxy.io/?";
    
    try {
        const response = await fetch(proxyUrl + encodeURIComponent(idUrl));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const contentType = response.headers.get("content-type") || "";
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        const encoding = charsetMatch ? charsetMatch[1].trim() : "utf-8";
        const buffer = await response.arrayBuffer();
        const html = new TextDecoder(encoding).decode(buffer);

        // 2. Parse into DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 3. Simple URL Rewriting via DOM API
        let siteRootOrigin = "";
        try {
            const urlObj = new URL(siteUrl.startsWith('http') ? siteUrl : 'http://' + siteUrl);
            siteRootOrigin = urlObj.origin;
        } catch(e) { siteRootOrigin = siteUrl.split('/')[0]; }

        const resolveUrl = (url) => {
            if (!url || url.includes('archive.org') || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) return url;
            if (url.startsWith('//')) return `${archiveBase}/https:${url}`;
            if (url.startsWith('http')) return `${archiveBase}/${url}`;
            if (url.startsWith('/')) return `${archiveBase}/${siteRootOrigin}${url}`;
            return url;
        };

        doc.querySelectorAll('[src], [href], [action]').forEach(el => {
            ['src', 'href', 'action'].forEach(attr => {
                if (el.hasAttribute(attr)) el.setAttribute(attr, resolveUrl(el.getAttribute(attr)));
            });
        });

        // 4. Neutralize Anti-Clickjack
        const acj = doc.getElementById('antiClickjack');
        if (acj) acj.remove();
        doc.querySelectorAll('style').forEach(s => {
            if (s.textContent.includes('display: none !important') && s.textContent.includes('body')) s.remove();
        });

        // 5. Surgical Redaction (Text Nodes only)
        const yearRegex = /\b(19|20)\d{2}\b/g;
        const walk = (node) => {
            if (node.nodeType === 3) {
                const parent = node.parentElement;
                if (parent && !['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT'].includes(parent.tagName)) {
                    node.nodeValue = node.nodeValue.replace(yearRegex, "XXXX");
                }
            } else {
                node.childNodes.forEach(walk);
            }
        };
        walk(doc.body || doc.documentElement);

        // 6. Inject Base Tag and Serialize
        const base = doc.createElement('base');
        base.href = `${archiveBase}/${siteUrl}/`;
        doc.head.insertBefore(base, doc.head.firstChild);

        return doc.documentElement.outerHTML;
    } catch (error) {
        console.error("Redaction failed:", error);
        return null;
    }
}
