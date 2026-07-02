/**
 * Smoke test for web tools.
 * Run: npx tsx scripts/test-web-tools.ts
 */

import { web_search, web_fetch, web_download, isUrlSafe } from '../electron/ai/web-tools';

async function main() {
  console.log('=== Test 1: isUrlSafe ===');
  const tests = [
    { url: 'https://example.com', expect: true },
    { url: 'http://localhost:3000', expect: false },
    { url: 'http://127.0.0.1/api', expect: false },
    { url: 'http://192.168.1.1/admin', expect: false },
    { url: 'http://10.0.0.1/internal', expect: false },
    { url: 'file:///etc/passwd', expect: false },
    { url: 'ftp://example.com/file', expect: false },
    { url: 'https://api.github.com/repos', expect: true },
  ];
  let pass = 0, fail = 0;
  for (const t of tests) {
    const r = isUrlSafe(t.url);
    const ok = r.safe === t.expect;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${t.url} -> safe=${r.safe} (expected ${t.expect})${!ok ? ' ' + (r.reason ?? '') : ''}`);
    if (ok) pass++; else fail++;
  }
  console.log(`  Result: ${pass}/${tests.length} passed\n`);

  console.log('=== Test 2: web_search ===');
  const searchResult = await web_search({ query: 'Electron desktop app TypeScript', num: 3 });
  if (searchResult.success) {
    const data = searchResult.data as { count: number; results: Array<{ title: string; url: string; snippet: string }> };
    console.log(`  PASS: Got ${data.count} results`);
    for (const r of data.results.slice(0, 3)) {
      console.log(`    - ${r.title.slice(0, 60)}`);
      console.log(`      ${r.url}`);
    }
  } else {
    console.log(`  FAIL: ${searchResult.error}`);
  }
  console.log('');

  console.log('=== Test 3: web_fetch ===');
  const fetchResult = await web_fetch({
    url: 'https://httpbin.org/html',
    max_bytes: 8192,
    timeout_ms: 15000,
  });
  if (fetchResult.success) {
    const data = fetchResult.data as { status: number; size_bytes: number; text: string; content_type: string };
    console.log(`  PASS: HTTP ${data.status}, ${data.size_bytes} bytes, content-type: ${data.content_type}`);
    console.log(`    Text preview: ${data.text.slice(0, 100).replace(/\n/g, ' ')}...`);
  } else {
    console.log(`  FAIL: ${fetchResult.error}`);
  }
  console.log('');

  console.log('=== Test 4: web_download ===');
  const downloadResult = await web_download({
    url: 'https://httpbin.org/json',
    dest_dir: './test-downloads',
    filename: 'test.json',
    timeout_ms: 15000,
  });
  if (downloadResult.success) {
    const data = downloadResult.data as { saved_to: string; size_bytes: number; content_type: string };
    console.log(`  PASS: Saved to ${data.saved_to} (${data.size_bytes} bytes, ${data.content_type})`);
  } else {
    console.log(`  FAIL: ${downloadResult.error}`);
  }
  console.log('');

  console.log('=== Test 5: Error handling - blocked URL ===');
  const blockedResult = await web_fetch({ url: 'http://localhost:3000/secret' });
  if (!blockedResult.success && blockedResult.error?.includes('SSRF')) {
    console.log(`  PASS: Correctly blocked: ${blockedResult.error}`);
  } else {
    console.log(`  FAIL: Should have been blocked`);
  }
  console.log('');

  console.log('=== Test 6: Error handling - invalid URL ===');
  const invalidResult = await web_fetch({ url: 'not-a-url' });
  if (!invalidResult.success) {
    console.log(`  PASS: Correctly rejected: ${invalidResult.error}`);
  } else {
    console.log(`  FAIL: Should have been rejected`);
  }

  console.log('\n=== All tests done ===');
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
