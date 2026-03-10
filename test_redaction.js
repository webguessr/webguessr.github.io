/**
 * Unified Test suite for redaction.js
 * Works in both Browser and Node.js environments.
 */

const TEST_CASES = [
    {
        name: "Year Redaction (19xx)",
        input: "<div>Established in 1998</div>",
        expected: /Established in XXXX/
    },
    {
        name: "Year Redaction (20xx)",
        input: "<span>Copyright 2023 Mi</span>",
        expected: /Copyright XXXX Mi/
    },
    {
        name: "Root-relative URL Rewriting",
        input: '<img src="/logo.png">',
        expected: /src="https:\/\/web\.archive\.org\/web\/\d+\/http:\/\/example\.com\/logo\.png"/
    },
    {
        name: "Relative Path (no slash) Rewriting",
        input: '<img src="images/photo.jpg">',
        expected: /src="https:\/\/web\.archive\.org\/web\/\d+\/http:\/\/example\.com\/images\/photo\.jpg"/
    },
    {
        name: "Protocol-relative URL Rewriting",
        input: '<script src="//cdn.com/lib.js"></script>',
        expected: /src="https:\/\/web\.archive\.org\/web\/\d+\/https:\/\/cdn\.com\/lib\.js"/
    },
    {
        name: "External Absolute URL Rewriting",
        input: '<link href="https://fonts.googleapis.com/css">',
        expected: /href="https:\/\/web\.archive\.org\/web\/\d+\/https:\/\/fonts\.googleapis\.com\/css"/
    },
    {
        name: "Existing Base Tag Rewriting",
        input: '<head><base href="http://cdn.site.com/"></head>',
        expected: /<base href="https:\/\/web\.archive\.org\/web\/\d+\/http:\/\/cdn\.site\.com\/"/
    },
    {
        name: "CSS url() Rewriting",
        input: '<div style="background: url(/bg.jpg)"></div>',
        expected: /url\("https:\/\/web\.archive\.org\/web\/\d+\/http:\/\/example\.com\/bg\.jpg"\)/
    }
];

/**
 * Main test runner
 */
async function runRedactionTests() {
    const isNode = typeof process !== 'undefined' && process.release && process.release.name === 'node';
    const timestamp = "20230101000000";
    const archivedUrl = `https://web.archive.org/web/${timestamp}/http://example.com/`;
    
    let passedCount = 0;
    const originalFetch = isNode ? global.fetch : window.fetch;

    if (!isNode) {
        const resultsContainer = document.getElementById('test-results');
        resultsContainer.innerHTML = "Running tests...";
    } else {
        console.log("Running Redaction Tests in Node.js...");
    }

    const fetchMock = async (tc) => ({
        ok: true,
        headers: new Map([["content-type", "text/html; charset=utf-8"]]),
        arrayBuffer: async () => {
            const encoder = new TextEncoder();
            return encoder.encode(tc.input).buffer;
        }
    });

    const results = [];

    for (const tc of TEST_CASES) {
        if (isNode) global.fetch = () => fetchMock(tc);
        else window.fetch = () => fetchMock(tc);

        const result = await fetchAndRedact(archivedUrl);
        const passed = tc.expected.test(result);
        
        if (passed) passedCount++;
        results.push({ name: tc.name, passed, result });

        if (isNode) {
            console.log(`${passed ? '✅' : '❌'} ${tc.name}`);
            if (!passed) console.error(`   Expected: ${tc.expected}\n   Received: ${result}`);
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
            div.className = 'test-case';
            div.style.padding = "5px";
            div.style.margin = "5px 0";
            div.style.borderLeft = "5px solid " + (res.passed ? "green" : "red");
            div.style.backgroundColor = res.passed ? "#eaffea" : "#ffeaea";
            div.innerHTML = `<strong>${res.name}</strong>: ${res.passed ? "PASSED" : "FAILED"}`;
            container.appendChild(div);
        });
    }
}

// Auto-run if Node.js
if (typeof process !== 'undefined' && process.release && process.release.name === 'node') {
    // In node, we need to load redaction.js
    const fs = require('fs');
    const path = require('path');
    const code = fs.readFileSync(path.join(__dirname, 'redaction.js'), 'utf8');
    eval(code);
    runRedactionTests();
}
