import assert from 'node:assert/strict';
const { NextRequest } = await import('next/server');
const { CN_ANDROID_RELEASE } = await import('@/lib/mobile-release');
process.env.AWD_DL_AUTH_KEY = 'isolated-test-only-download-key';
const { GET } = await import('@/app/api/download/route');
const response = await GET(new NextRequest('https://test.local/api/download?target=android-cn'));
if (process.env.NEXT_PUBLIC_AWD_SITE === 'cn') {
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.origin + location.pathname, CN_ANDROID_RELEASE.url);
    assert.match(location.searchParams.get('auth_key')!, /^\d+-[a-f0-9]+-0-[a-f0-9]{32}$/);
    assert.equal(CN_ANDROID_RELEASE.version, '1.7.1');
    assert.equal(CN_ANDROID_RELEASE.versionCode, 13);
    assert.equal(CN_ANDROID_RELEASE.bytes, 43180526);
    assert.equal(CN_ANDROID_RELEASE.sha256, '97a0fe7916233e96bc04cfc2de6ec59f772ddf657953af9cbb52f84830df45c3');
} else {
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
}
console.log('Mobile APK download: regional gate, immutable artifact and signed CDN redirect passed');
