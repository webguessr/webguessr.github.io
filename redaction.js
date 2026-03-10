/**
 * Fetches an archived page from the Wayback Machine, redacts years (19xx, 20xx),
 * and rewrites internal URLs to ensure resources load correctly when used in srcdoc.
 */
async function fetchAndRedact(archivedUrl) {
    const timestampMatch = archivedUrl.match(/\/web\/(\d+)/);
    if (!timestampMatch) return null;
    const timestamp = timestampMatch[1];
    const archiveBase = `https://web.archive.org/web/${timestamp}`;
    
    const idUrl = archivedUrl.replace(/\/web\/(\d+)[a-z_]*\//, "/web/$1id_/");
    
    const siteUrlMatch = archivedUrl.match(/\/web\/\d+[a-z_]*\/(https?:\/\/.*|.*)/);
    if (!siteUrlMatch) return null;
    let siteUrl = siteUrlMatch[1].replace(/\/$/, ""); 
    
    let siteRoot = "";
    try {
        const urlToParse = siteUrl.startsWith('http') ? siteUrl : 'http://' + siteUrl;
        const urlObj = new URL(urlToParse);
        siteRoot = `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
        const match = siteUrl.match(/^(https?:\/\/)?([^\/]+)/);
        siteRoot = match ? `${match[1] || "http://"}${match[2]}` : siteUrl.split('/')[0];
    }
    const baseForRootRelative = `${archiveBase}/${siteRoot}`;

    let siteUrlDir = "";
    if (siteUrl.includes('/') && siteUrl.split('/').length > (siteUrl.startsWith('http') ? 3 : 1)) {
        siteUrlDir = siteUrl.substring(0, siteUrl.lastIndexOf('/') + 1);
    } else {
        siteUrlDir = siteUrl + '/';
    }
    const baseForRelative = `${archiveBase}/${siteUrlDir.startsWith('http') ? '' : 'http://'}${siteUrlDir}`;

    const proxyUrl = "https://corsproxy.io/?";
    
    try {
        const response = await fetch(proxyUrl + encodeURIComponent(idUrl));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const contentType = response.headers.get("content-type") || "";
        const charsetMatch = contentType.match(/charset=([^;]+)/i);
        const encoding = charsetMatch ? charsetMatch[1].trim() : "utf-8";
        
        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder(encoding);
        let html = decoder.decode(buffer);

        // 1. Redact Years (19xx or 20xx)
        const yearRegex = /\b(19|20)\d{2}\b/g;
        html = html.replace(yearRegex, "XXXX");
        
        // 2. Handle existing <base> tags
        const baseMatch = html.match(/<base\b[^>]*href=["']([^"']*)["'][^>]*>/i);
        if (baseMatch) {
            const originalBase = baseMatch[1];
            let newBase = originalBase;
            if (!originalBase.startsWith('http') && !originalBase.startsWith('//')) {
                newBase = new URL(originalBase, siteUrl.startsWith('http') ? siteUrl : 'http://' + siteUrl).href;
            }
            const waybackBase = `${archiveBase}/${newBase.replace(/^https?:\/\//, 'http://')}`;
            html = html.replace(baseMatch[0], `<base href="${waybackBase}">`);
        } else {
            const finalBaseUrl = `${archiveBase}/${siteUrl.startsWith('http') ? '' : 'http://'}${siteUrl}/`;
            const baseTag = `<base href="${finalBaseUrl}">`;
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${baseTag}`);
            } else {
                html = baseTag + html;
            }
        }
        
        // 3. Rewrite URLs
        const rewrite = (url) => {
            if (url.startsWith('http') || url.startsWith('/') || url.startsWith('.') || url.startsWith('archive.org')) {
                return null;
            }
            return `${baseForRelative}${url}`;
        };

        html = html.replace(/(src|href|action)=["'](https?:\/\/(?!(web\.)?archive\.org)[^"']*)["']/g, `$1="${archiveBase}/$2"`);
        html = html.replace(/(src|href|action)=["']\/\/([^"']*)["']/g, `$1="${archiveBase}/https://$2"`);
        html = html.replace(/(src|href|action)=["']\/([^/][^"']*)["']/g, `$1="${baseForRootRelative}/$2"`);
        html = html.replace(/(src|href|action)=["']([^"']+)["']/g, (match, attr, path) => {
            const res = rewrite(path);
            return res ? `${attr}="${res}"` : match;
        });

        html = html.replace(/url\(["']?\/([^/][^"')]*)["']?\)/g, `url("${baseForRootRelative}/$1")`);
        html = html.replace(/url\(["']?(https?:\/\/(?!(web\.)?archive\.org)[^"')]*)["']?\)/g, `url("${archiveBase}/$1")`);
        
        return html;
    } catch (error) {
        console.error("Redaction failed:", error);
        return null;
    }
}
