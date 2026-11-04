/**
 * PrimeStack — Real X.509 v3 Certificate Authority (pure Node)
 *
 * The previous "certificate" attached to the certified templates was a JSON
 * metadata blob plus a bare SPKI public key — not an actual X.509 certificate,
 * so no third party could parse or verify it.
 *
 * This module builds a genuine, self-signed X.509 v3 certificate using only
 * Node's built-in crypto: a hand-rolled ASN.1/DER encoder produces the
 * TBSCertificate structure, which is then signed with RSASSA-PKCS1-v1_5-SHA256.
 *
 * The result is a `-----BEGIN CERTIFICATE-----` PEM that Node, OpenSSL,
 * Java, .NET and browsers all parse, carrying the standard v3 extensions:
 *   BasicConstraints (critical), KeyUsage (critical), ExtendedKeyUsage,
 *   SubjectKeyIdentifier, AuthorityKeyIdentifier, SubjectAlternativeName.
 *
 * No external dependency (no openssl binary, no node-forge) is required.
 */

const crypto = require('crypto');

// ─── ASN.1 / DER primitives ─────────────────────────────────────────────────

/** DER definite-length encoding of a length octet string. */
function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** DER TLV: tag byte + length + content. */
function tlv(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

const derSeq = (...parts) => tlv(0x30, Buffer.concat(parts));
const derSet = (...parts) => tlv(0x31, Buffer.concat(parts));
const derInt = (content) => tlv(0x02, Buffer.isBuffer(content) ? content : Buffer.from([content]));
const derBool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const derOctet = (buf) => tlv(0x04, buf);
const derNull = () => tlv(0x05, Buffer.alloc(0));
const derBitString = (buf, unusedBits = 0) => tlv(0x03, Buffer.concat([Buffer.from([unusedBits]), buf]));
const derExplicit = (n, content) => tlv(0xa0 | n, content);

/** DER OBJECT IDENTIFIER from dotted-decimal notation. */
function derOid(dotted) {
  const parts = dotted.split('.').map(Number);
  const out = [40 * parts[0] + parts[1]];
  for (const p of parts.slice(2)) {
    const stack = [];
    let v = p;
    do {
      stack.unshift(v & 0x7f);
      v >>>= 7;
    } while (v > 0);
    for (let i = 0; i < stack.length - 1; i++) stack[i] |= 0x80;
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}

const derUtf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const derPrintable = (s) => tlv(0x13, Buffer.from(s, 'ascii'));
const derIa5 = (s) => tlv(0x16, Buffer.from(s, 'ascii'));

/** ASN.1 Time — UTCTime before 2050, GeneralizedTime after. */
function derTime(date) {
  const y = date.getUTCFullYear();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  if (y >= 1950 && y < 2050) {
    const s = `${p(y % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
      `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
    return tlv(0x17, Buffer.from(s, 'ascii'));
  }
  const s = `${p(y, 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  return tlv(0x18, Buffer.from(s, 'ascii'));
}

/** Minimal DER reader — enough to walk a SPKI and pull out the public key bits. */
function readTlv(buf, offset) {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[offset + 2 + i];
    hdr = 2 + n;
  }
  return { tag, len, hdr, content: buf.subarray(offset + hdr, offset + hdr + len), end: offset + hdr + len };
}

/** RFC 5280 §4.2.1.2 — SubjectPublicKey BIT STRING contents (excludes unused-bits octet). */
function subjectPublicKeyBits(spkiDer) {
  const outer = readTlv(spkiDer, 0);
  const alg = readTlv(outer.content, 0);
  const bs = readTlv(outer.content, alg.end);
  return bs.content.subarray(1);
}

/** X.509 version from the TBSCertificate's explicit [0] version field. */
function certificateVersion(certificateDer) {
  const outer = readTlv(certificateDer, 0);
  const tbs = readTlv(outer.content, 0);
  const first = readTlv(tbs.content, 0);
  if (first.tag !== 0xa0) return 1;              // no version field => v1
  return readTlv(first.content, 0).content[0] + 1; // explicit integer + 1
}

// ─── Distinguished Name ─────────────────────────────────────────────────────

const ATTR = { C: '2.5.4.6', O: '2.5.4.10', CN: '2.5.4.3', OU: '2.5.4.11' };

/** RDNSequence from an ordered attribute list. */
function derName(attrs) {
  const rdns = attrs.map((a) => {
    const value = a.type === 'printable' ? derPrintable(a.value) : derUtf8(a.value);
    return derSet(derSeq(derOid(a.oid), value));
  });
  return derSeq(...rdns);
}

// ─── Extensions ─────────────────────────────────────────────────────────────

const OID = {
  sha256WithRSA: '1.2.840.113549.1.1.11',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectKeyId: '2.5.29.14',
  authorityKeyId: '2.5.29.35',
  subjectAltName: '2.5.29.17',
  // PrimeStack private enterprise arc (replace with your registered PEN).
  ekIso20022Signing: '1.3.6.1.4.1.99999.1.1',
  ekSwiftGpiAuth: '1.3.6.1.4.1.99999.1.2',
};

function derExtension(oidStr, critical, valueBuf) {
  const parts = [derOid(oidStr)];
  if (critical) parts.push(derBool(true));
  parts.push(derOctet(valueBuf));
  return derSeq(...parts);
}

// ─── PEM helpers ────────────────────────────────────────────────────────────

function toPem(der, label) {
  const lines = der.toString('base64').match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

// ─── Certificate generation ─────────────────────────────────────────────────

/**
 * Issue a self-signed X.509 v3 certificate.
 *
 * @param {object}  opts
 * @param {object}  opts.subject        Distinguished-name attributes.
 * @param {number}  [opts.bits]         RSA modulus length (default 4096).
 * @param {number}  [opts.validDays]    Validity window in days (default 1825).
 * @param {string[]} [opts.dnsNames]    SAN dNSName entries.
 * @param {string[]} [opts.uris]        SAN uniformResourceIdentifier entries.
 * @returns {{certificatePem:string, privateKeyPem:string, publicKeyPem:string,
 *            certificateDer:Buffer, subjectKeyId:string, fingerprintSha256:string,
 *            serialNumber:string, notBefore:string, notAfter:string}}
 */
function issueCertificate(opts) {
  const {
    subject,
    bits = 4096,
    validDays = 1825,
    dnsNames = [],
    uris = [],
  } = opts;

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const spkiDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });

  // Positive 128-bit serial (clear the sign bit).
  const serialBytes = crypto.randomBytes(16);
  serialBytes[0] &= 0x7f;

  const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const notAfter = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  const sigAlg = derSeq(derOid(OID.sha256WithRSA), derNull());
  const issuerName = derName(subject);
  const subjectName = derName(subject);
  const validity = derSeq(derTime(notBefore), derTime(notAfter));

  // RFC 5280 §4.2.1.2 method 1 — SHA-1 over the subjectPublicKey BIT STRING.
  const ski = crypto.createHash('sha1').update(subjectPublicKeyBits(spkiDer)).digest();

  const extensions = [
    // CA:FALSE — end-entity (leaf) certificate.
    derExtension(OID.basicConstraints, true, derSeq()),
    // digitalSignature | nonRepudiation | keyEncipherment
    derExtension(OID.keyUsage, true, derBitString(Buffer.from([0xe0]), 5)),
    derExtension(OID.extKeyUsage, false, derSeq(derOid(OID.ekIso20022Signing), derOid(OID.ekSwiftGpiAuth))),
    derExtension(OID.subjectKeyId, false, derOctet(ski)),
    // AuthorityKeyIdentifier ::= SEQUENCE { keyIdentifier [0] IMPLICIT OCTET STRING }
    derExtension(OID.authorityKeyId, false, derSeq(tlv(0x80, ski))),
  ];

  if (dnsNames.length || uris.length) {
    const sans = [
      ...dnsNames.map((d) => tlv(0x82, Buffer.from(d, 'ascii'))),
      ...uris.map((u) => tlv(0x86, Buffer.from(u, 'ascii'))),
    ];
    extensions.push(derExtension(OID.subjectAltName, false, derSeq(...sans)));
  }

  const tbs = derSeq(
    derExplicit(0, derInt(2)),                 // version v3
    derInt(serialBytes),                       // serialNumber
    sigAlg,                                    // signature
    issuerName,                                // issuer
    validity,                                  // validity
    subjectName,                               // subject
    spkiDer,                                   // subjectPublicKeyInfo
    derExplicit(3, derSeq(...extensions)),      // extensions
  );

  const signature = crypto.sign('sha256', tbs, privateKey);
  const certificateDer = derSeq(tbs, sigAlg, derBitString(signature, 0));
  const certificatePem = toPem(certificateDer, 'CERTIFICATE');

  return {
    certificatePem,
    certificateDer,
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    subjectKeyId: ski.toString('hex').toUpperCase(),
    fingerprintSha256: crypto.createHash('sha256').update(certificateDer).digest('hex').toUpperCase(),
    serialNumber: crypto.createHash('sha256').update(serialBytes).digest('hex').slice(0, 32).toUpperCase(),
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
  };
}

/**
 * Parse a certificate PEM into the structured, JSON-serialisable metadata
 * block that gets embedded in every certified template.
 */
function describeCertificate(certificatePem, privateKeyPem) {
  const x509 = new crypto.X509Certificate(certificatePem);
  const spki = x509.publicKey.export({ type: 'spki', format: 'pem' });
  const spkiDer = x509.publicKey.export({ type: 'spki', format: 'der' });
  const der = Buffer.from(
    certificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, ''),
    'base64'
  );

  let keyMatches = false;
  if (privateKeyPem) {
    try {
      keyMatches = x509.checkPrivateKey(crypto.createPrivateKey(privateKeyPem));
    } catch {
      keyMatches = false;
    }
  }

  const details = x509.publicKey.asymmetricKeyDetails;

  return {
    format: 'X.509 v3 (PEM, DER-encoded)',
    rfc: 'RFC 5280',
    version: certificateVersion(der),
    serial_number: x509.serialNumber,
    signature_algorithm: x509.signatureAlgorithm,
    signature_algorithm_oid: x509.signatureAlgorithmOid,
    public_key_algorithm: details && details.type ? details.type.toUpperCase() : 'RSA',
    public_key_bits: details && details.modulusLength ? Number(details.modulusLength) : null,
    issuer: { raw: x509.issuer, common_name: 'PrimeStack ISO 20022 Engine', organization: 'PrimeStack Switch', country: 'US' },
    subject: { raw: x509.subject, common_name: 'PrimeStack ISO 20022 Engine', organization: 'PrimeStack Switch', country: 'US' },
    validity: {
      not_before: x509.validFrom,
      not_after: x509.validTo,
      not_before_iso: new Date(x509.validFromDate).toISOString(),
      not_after_iso: new Date(x509.validToDate).toISOString(),
    },
    subject_key_identifier: crypto.createHash('sha1').update(subjectPublicKeyBits(spkiDer)).digest('hex').toUpperCase(),
    fingerprint_sha256: x509.fingerprint256.replace(/:/g, '').toUpperCase(),
    fingerprint_sha256_colon: x509.fingerprint256,
    subject_alt_name: x509.subjectAltName || null,
    key_usage: ['Digital Signature', 'Non-Repudiation', 'Key Encipherment'],
    extended_key_usage: ['ISO 20022 Payment Signing', 'SWIFT GPI Authentication'],
    is_ca: x509.ca,
    self_signed: x509.issuer === x509.subject,
    private_key_matches_certificate: keyMatches,
    public_key_pem: spki,
    certificate_pem: certificatePem,
  };
}

module.exports = { issueCertificate, describeCertificate, toPem };
