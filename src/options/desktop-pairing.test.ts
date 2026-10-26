import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const options = readFileSync(new URL('./Options.tsx', import.meta.url), 'utf8')

test('native launch uses a direct user-click anchor, not an awaited popup or automatic launch', () => {
  assert.match(options, /<a\s[^>]*href=\{pairingLink\.url\}[^>]*onClick=\{startPairing\}/)
  assert.doesNotMatch(options, /window\.open|location\.(?:href|assign|replace)|chrome\.tabs\.create/)
  assert.match(options, /["']djs321-desktop:\/\/open["']/)
})

test('advanced URL is collapsed while privacy and site permission controls remain available', () => {
  assert.match(options, /<details[^>]*>[\s\S]*?<summary>高级连接设置<\/summary>[\s\S]*?value=\{apiDraft\}/)
  assert.match(options, /requestCaptureAccess\(\[normalized\]\)/)
  assert.match(options, /revokeOptionalSiteAccess/)
  assert.match(options, /settings\.enableRemoteQuotes/)
})

test('pairing UI exposes code, cancellation and disconnect, aborting work on unmount', () => {
  assert.match(options, /pairingLink\.code/)
  assert.match(options, /取消配对/)
  assert.match(options, /disconnectDesktop/)
  assert.match(options, /AbortController/)
  assert.match(options, /return \(\) => \{[\s\S]*?\.abort\(\)/)
  assert.doesNotMatch(options, /sendToJustDoIt/)
  for (const status of ['not-running', 'unpaired', 'connected', 'revoked', 'pairing', 'error']) assert.ok(options.includes(`'${status}'`), status)
})

test('native approval ends the cancellable pairing phase before saving the selected endpoint', () => {
  assert.match(options, /pollDesktopPairing[\s\S]*?\.then\(async \(\) => \{\s*if \(!isCurrent\(controller\)\) return[\s\S]*?setDesktopState\('connected'\)\s*await update/)
})

test('reconnect uses a nonce-bound connect link, while pairing retains plain wake without replacing its nonce', () => {
  assert.match(options, /href=\{reconnectLink\.url\}[^>]*onClick=\{openDesktopApp\}/)
  assert.match(options, /href="djs321-desktop:\/\/open"/)
  assert.match(options, /waitForDesktopConnection\(\{ discovery: reconnectLink, signal: controller\.signal \}\)/)
  assert.match(options, /desktopState === 'connected'/)
  assert.match(options, /hasCredential/)
  assert.match(options, /opt-connection-primary/)
  assert.match(options, /opt-connection-secondary/)
})

test('identity failures retain independently loaded reconnect and disconnect recovery flags', () => {
  assert.match(options, /loadDesktopConnectionSnapshot\(controller.signal\)\.then\(snapshot/)
  assert.match(options, /setHasCredential\(snapshot.hasCredential\)/)
  assert.match(options, /setPendingRevocation\(snapshot.pendingRevocation\)/)
  assert.doesNotMatch(options, /Promise\.all\(\[probeDesktopConnection/)
})

test('native links stay disabled until discovery registration has completed locally', () => {
  assert.match(options, /prepareDesktopConnection/)
  assert.match(options, /setLaunchReady\(false\)/)
  assert.match(options, /setLaunchReady\(true\)/)
  assert.match(options, /if \(!ready \|\| busy \|\| savingConnection \|\| !launchReady\)/)
  assert.match(options, /clearDesktopDiscovery/)
  assert.match(options, /默认浏览器/)
  assert.doesNotMatch(options, /本机配对固定|placeholder="http:\/\/localhost:37373"/)
  assert.match(options, /const mode = primaryOpen \? 'connect' : 'pair'/)
})
