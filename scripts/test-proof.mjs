/**
 * XRPM Login — End-to-End Test Script
 *
 * Generates a valid XRPM_LOGIN_V1 proof using a real XRPL keypair,
 * then runs it through verifyLogin() to confirm the full pipeline works.
 *
 * Does NOT make real XRPL balance checks (uses checkXRPM: false).
 * For balance testing point at a wallet you control on mainnet.
 *
 * Run:
 *   node scripts/test-proof.mjs
 *
 * Requires packages to be built first:
 *   pnpm build
 */

import * as keypairs from 'ripple-keypairs';
import crypto from 'crypto';

// ─── 1. Generate a fresh test keypair ────────────────────────────────────────

const seed    = keypairs.generateSeed();
const pair    = keypairs.deriveKeypair(seed);
const address = keypairs.deriveAddress(pair.publicKey);

console.log('\n─── Test keypair ───────────────────────────────');
console.log('Address :', address);
console.log('PubKey  :', pair.publicKey);
console.log('Seed    :', seed, '(never share a real seed)');

// ─── 2. Build a challenge ────────────────────────────────────────────────────

const AUD          = 'https://test.xrpmemes.net';
const REDIRECT_URI = 'https://test.xrpmemes.net/auth/callback';
const CLIENT_ID    = 'test.xrpmemes.net';
const now          = Math.floor(Date.now() / 1000);

const challenge = {
  v:            1,
  aud:          AUD,
  nonce:        crypto.randomBytes(32).toString('base64url'),
  iat:          now,
  exp:          now + 300,
  client_id:    CLIENT_ID,
  redirect_uri: REDIRECT_URI,
};

console.log('\n─── Challenge ──────────────────────────────────');
console.log(JSON.stringify(challenge, null, 2));

// ─── 3. Build canonical message and sign ─────────────────────────────────────

const canonical = [
  'XRPM_LOGIN_V1',
  `aud=${challenge.aud}`,
  `nonce=${challenge.nonce}`,
  `iat=${challenge.iat}`,
  `exp=${challenge.exp}`,
  `client_id=${challenge.client_id}`,
].join('\n');

console.log('\n─── Canonical message ──────────────────────────');
console.log(canonical);

// SHA256 raw digest (as Buffer)
const digestBuffer = crypto.createHash('sha256').update(canonical, 'utf8').digest();
const digestHex    = digestBuffer.toString('hex').toUpperCase();

console.log('\n─── SHA256 digest (hex) ────────────────────────');
console.log(digestHex);

// Sign the digest with ripple-keypairs
// ripple-keypairs.sign() takes hex string, returns hex string
const sigHex = keypairs.sign(digestHex, pair.privateKey);

// Spec: proof.sig = base64url of raw signature bytes
const sigBase64Url = Buffer.from(sigHex, 'hex').toString('base64url');

const proof = {
  v:         1,
  aud:       challenge.aud,
  nonce:     challenge.nonce,
  iat:       challenge.iat,
  exp:       challenge.exp,
  client_id: challenge.client_id,
  account:   address,
  pubkey:    pair.publicKey,
  alg:       pair.publicKey.startsWith('ED') ? 'ed25519' : 'secp256k1',
  sig:       sigBase64Url,
};

console.log('\n─── Proof object ───────────────────────────────');
console.log(JSON.stringify(proof, null, 2));

const proofBase64Url = Buffer.from(JSON.stringify(proof))
  .toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

console.log('\n─── Proof (base64url) ──────────────────────────');
console.log(proofBase64Url);

// ─── 4. Verify through the SDK ───────────────────────────────────────────────

console.log('\n─── Running verifyLogin() ──────────────────────');

// Import from built dist, or run with ts-node for source
let verifyLogin, MemoryNonceStore, XrpmVerifyError;
try {
  ({ verifyLogin, MemoryNonceStore, XrpmVerifyError } =
    await import('../packages/sdk-web/dist/index.js'));
} catch {
  console.error('⚠️  Build packages first: pnpm build');
  console.log('\nAlternative: copy the proofBase64Url above and test manually.');
  process.exit(0);
}

const nonceStore = new MemoryNonceStore();

try {
  const result = await verifyLogin(proofBase64Url, {
    expectedAud:         AUD,
    expectedRedirectUri: REDIRECT_URI,
    nonceStore,
    checkXRPM:           false, // skip on-chain check for local test
  });

  console.log('\n✅ PASS — verifyLogin() returned:');
  console.log('  address:', result.address);
  console.log('  balance:', result.balance, '(skipped — checkXRPM: false)');
  console.log('\n  Address match:', result.address === address ? '✅' : '❌');

} catch (err) {
  const code = err instanceof XrpmVerifyError ? err.code : 'UNKNOWN';
  console.error('\n❌ FAIL — verifyLogin() threw:', code);
  console.error('  Detail:', err.message);
  process.exit(1);
}

// ─── 5. Replay attack test ───────────────────────────────────────────────────

console.log('\n─── Replay attack test ─────────────────────────');
try {
  await verifyLogin(proofBase64Url, {
    expectedAud:         AUD,
    expectedRedirectUri: REDIRECT_URI,
    nonceStore,           // same store — nonce already consumed
    checkXRPM:           false,
  });
  console.error('❌ FAIL — replay was not blocked!');
  process.exit(1);
} catch (err) {
  const code = err instanceof XrpmVerifyError ? err.code : 'UNKNOWN';
  if (code === 'NONCE_ALREADY_USED') {
    console.log('✅ PASS — replay correctly blocked with NONCE_ALREADY_USED');
  } else {
    console.error('❌ FAIL — wrong error code:', code);
    process.exit(1);
  }
}

// ─── 6. Tampered signature test ──────────────────────────────────────────────

console.log('\n─── Tampered signature test ────────────────────');
const tamperedProof = { ...proof, nonce: crypto.randomBytes(32).toString('base64url') };
// sig no longer matches the new nonce
const tamperedBase64 = Buffer.from(JSON.stringify(tamperedProof))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

try {
  await verifyLogin(tamperedBase64, {
    expectedAud:         AUD,
    expectedRedirectUri: REDIRECT_URI,
    nonceStore:          new MemoryNonceStore(),
    checkXRPM:           false,
  });
  console.error('❌ FAIL — tampered proof was accepted!');
  process.exit(1);
} catch (err) {
  const code = err instanceof XrpmVerifyError ? err.code : 'UNKNOWN';
  if (code === 'INVALID_SIGNATURE') {
    console.log('✅ PASS — tampered proof correctly rejected with INVALID_SIGNATURE');
  } else {
    console.error('❌ Unexpected error code:', code);
    process.exit(1);
  }
}

console.log('\n═══════════════════════════════════════════════');
console.log('  All tests passed ✅');
console.log('═══════════════════════════════════════════════\n');
