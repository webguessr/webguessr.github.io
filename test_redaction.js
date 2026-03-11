/**
 * Unified Test suite for redaction.js
 * Works in both Browser and Node.js environments.
 * Includes a robust DOM mock for Node.js to allow automated testing.
 */

const TEST_CASES = [
    {
        name: "Year Redaction",
        input: "<div>Established in 1998</div>",
        expected: /Established in XXXX/
    },
    {
        name: "Root-relative URL Rewriting",
        input: '<img src="/logo.png">',
        expected: /src="https:\/\/web\.archive\.org\/web\/\d+\/http:\/\/example\.com\/logo\.png"/
    },
    {
        name: "Absolute External URL Rewriting",
        input: '<link href="http://cdn.com/style.css">',
        expected: /href="https:\/\/web\.archive\.org\/web\/\d+\/http:\/\/cdn\.com\/style\.css"/
    },
    {
        name: "Anti-Clickjack Removal",
        input: '<html><head><style id="antiClickjack">body { display: none !important; }</style></head><body></body></html>',
        expected: (html) => !html.includes('antiClickjack')
    },
    {
        name: "Script Protection",
        input: '<script>var year = 2014;</script>',
        expected: /var year = 2014;/
    },
    {
        name: "Cyrillic Encoding (windows-1251)",
        input: "<div>Новости</div>", 
        expected: /Новости/,
        encoding: "windows-1251",
        inputBytes: Buffer.from([0xcd, 0xee, 0xe2, 0xee, 0xf1, 0xf2, 0xe8]) 
    }
];

// --- Robust DOM Mock for Node.js ---
if (typeof process !== 'undefined' && process.release && process.release.name === 'node') {
    class MockNode {
        constructor(type, name = '', value = '') {
            this.nodeType = type;
            this.tagName = name.toUpperCase();
            this.nodeValue = value;
            this.childNodes = [];
            this.attributes = {};
            this.parentElement = null;
        }
        appendChild(node) {
            node.parentElement = this;
            this.childNodes.push(node);
            return node;
        }
        remove() {
            if (this.parentElement) {
                const idx = this.parentElement.childNodes.indexOf(this);
                if (idx > -1) this.parentElement.childNodes.splice(idx, 1);
            }
        }
        hasAttribute(name) { return name in this.attributes; }
        getAttribute(name) { return this.attributes[name] || null; }
        setAttribute(name, val) { this.attributes[name] = val; }
        get textContent() {
            if (this.nodeType === 3) return this.nodeValue;
            return this.childNodes.map(c => c.textContent).join('');
        }
        get outerHTML() {
            if (this.nodeType === 3) return this.nodeValue;
            const attrs = Object.entries(this.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
            if (['LINK', 'IMG', 'BASE', 'META', 'BR', 'HR'].includes(this.tagName)) return `<${this.tagName.toLowerCase()}${attrs}>`;
            const content = this.tagName === 'SCRIPT' || this.tagName === 'STYLE' 
                ? this.childNodes.filter(c => c.nodeType === 3).map(c => c.nodeValue).join('')
                : this.childNodes.map(c => c.outerHTML).join('');
            return `<${this.tagName.toLowerCase()}${attrs}>${content}</${this.tagName.toLowerCase()}>`;
        }
    }

    global.DOMParser = class {
        parseFromString(html, type) {
            const doc = {
                body: new MockNode(1, 'body'),
                head: new MockNode(1, 'head'),
                documentElement: new MockNode(1, 'html'),
                getElementById: (id) => {
                    const find = (n) => {
                        if (n.attributes?.id === id) return n;
                        for (let c of n.childNodes) {
                            const r = find(c);
                            if (r) return r;
                        }
                        return null;
                    };
                    return find(doc.documentElement);
                },
                querySelectorAll: (selector) => {
                    const results = [];
                    const matches = (n) => {
                        if (n.nodeType !== 1) return;
                        if (selector === 'style' && n.tagName === 'STYLE') results.push(n);
                        else if (selector.includes('[src]') && n.hasAttribute('src')) results.push(n);
                        else if (selector.includes('[href]') && n.hasAttribute('href')) results.push(n);
                        else if (selector.includes('[action]') && n.hasAttribute('action')) results.push(n);
                        n.childNodes.forEach(matches);
                    };
                    matches(doc.documentElement);
                    return results;
                },
                createElement: (name) => new MockNode(1, name),
            };
            doc.documentElement.appendChild(doc.head);
            doc.documentElement.appendChild(doc.body);

            if (html.includes('<script')) {
                const script = new MockNode(1, 'script');
                const content = html.match(/<script[^>]*>([\s\S]*)<\/script>/i)?.[1] || '';
                script.appendChild(new MockNode(3, '', content));
                doc.body.appendChild(script);
            } else if (html.includes('<style')) {
                const style = new MockNode(1, 'style');
                const content = html.match(/<style[^>]*>([\s\S]*)<\/style>/i)?.[1] || '';
                style.appendChild(new MockNode(3, '', content));
                if (html.includes('id="antiClickjack"')) style.attributes.id = 'antiClickjack';
                doc.head.appendChild(style);
            } else if (html.includes('<img')) {
                const img = new MockNode(1, 'img');
                img.attributes.src = html.match(/src="([^"]*)"/)?.[1] || '';
                doc.body.appendChild(img);
            } else if (html.includes('<link')) {
                const link = new MockNode(1, 'link');
                link.attributes.href = html.match(/href="([^"]*)"/)?.[1] || '';
                doc.body.appendChild(link);
            } else {
                const div = new MockNode(1, 'div');
                div.appendChild(new MockNode(3, '', html.replace(/<[^>]*>/g, '')));
                doc.body.appendChild(div);
            }

            doc.head.insertBefore = (n, ref) => doc.head.childNodes.unshift(n);
            return doc;
        }
    };
    global.TextDecoder = require('util').TextDecoder;
    global.TextEncoder = require('util').TextEncoder;
}

async function runRedactionTests() {
    const isNode = typeof process !== 'undefined' && process.release && process.release.name === 'node';
    const timestamp = "20230101000000";
    const archivedUrl = `https://web.archive.org/web/${timestamp}/http://example.com/`;
    
    let passedCount = 0;
    const originalFetch = isNode ? global.fetch : window.fetch;

    const results = [];

    for (const tc of TEST_CASES) {
        const fetchMock = async () => ({
            ok: true,
            headers: new Map([["content-type", `text/html; charset=${tc.encoding || 'utf-8'}`]]),
            arrayBuffer: async () => {
                if (isNode && tc.inputBytes) return tc.inputBytes;
                const encoder = new TextEncoder();
                return encoder.encode(tc.input).buffer;
            }
        });

        if (isNode) global.fetch = fetchMock;
        else window.fetch = fetchMock;

        const result = await fetchAndRedact(archivedUrl);
        let passed = false;
        if (!result) passed = false;
        else if (typeof tc.expected === 'function') passed = tc.expected(result);
        else passed = tc.expected.test(result);
        
        if (passed) passedCount++;
        results.push({ name: tc.name, passed, result, expected: tc.expected });

        if (isNode) {
            console.log(`${passed ? '✅' : '❌'} ${tc.name}`);
            if (!passed) {
                console.error(`   Expected: ${tc.expected}`);
                console.error(`   Received: ${result}`);
            }
        }
    }

    if (isNode) {
        global.fetch = originalFetch;
        console.log(`\nFinal Result: ${passedCount}/${TEST_CASES.length} Passed`);
        process.exit(passedCount === TEST_CASES.length ? 0 : 1);
    } else {
        window.fetch = originalFetch;
        const container = document.getElementById('test-results');
        container.innerHTML = `<h3>Final Result: ${passedCount}/${TEST_CASES.length} Passed</h3>`;
        results.forEach(res => {
            const div = document.createElement('div');
            div.style.padding = "5px";
            div.style.margin = "5px 0";
            div.style.borderLeft = "5px solid " + (res.passed ? "green" : "red");
            div.style.backgroundColor = res.passed ? "#eaffea" : "#ffeaea";
            div.innerHTML = `<strong>${res.name}</strong>: ${res.passed ? "PASSED" : "FAILED"}`;
            container.appendChild(div);
        });
    }
}

if (typeof process !== 'undefined' && process.release && process.release.name === 'node') {
    const fs = require('fs');
    const path = require('path');
    const code = fs.readFileSync(path.join(__dirname, 'redaction.js'), 'utf8');
    eval(code);
    runRedactionTests();
}
