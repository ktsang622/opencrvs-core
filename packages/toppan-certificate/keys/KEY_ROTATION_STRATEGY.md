# Certificate Signing Key Rotation Strategy

## Problem Statement

Certificate signatures must remain verifiable indefinitely, but keys need rotation for security. If we simply replace keys, all previously signed certificates become unverifiable.

## Solution: Multi-Version Key Management

### 1. Key Versioning System

Each signing key has a version identifier:
- `v1` - Initial production key (2024-01-01 to 2025-01-01)
- `v2` - Second generation key (2025-01-01 to 2026-01-01)
- `v3` - Current active key (2026-01-01 onwards)

### 2. Signature Metadata

Every PDF signature includes:
```
% Toppan CRVS Digital Signature
% KeyVersion: v1
% SignedAt: 20240315120000Z
% Algorithm: ECDSA-P256
```

QR Code data includes:
```json
{
  "certificateNumber": "BRN123456",
  "keyVersion": "v1",
  "signedAt": "2024-03-15T12:00:00Z",
  "signature": "base64_signature..."
}
```

### 3. Public Key Registry

Store all public keys in a registry (database or configuration):

```json
{
  "publicKeys": [
    {
      "version": "v1",
      "algorithm": "ECDSA-P256",
      "publicKeyPEM": "-----BEGIN PUBLIC KEY-----\n...",
      "validFrom": "2024-01-01T00:00:00Z",
      "validUntil": "2025-01-01T00:00:00Z",
      "status": "retired"
    },
    {
      "version": "v2",
      "algorithm": "ECDSA-P256",
      "publicKeyPEM": "-----BEGIN PUBLIC KEY-----\n...",
      "validFrom": "2025-01-01T00:00:00Z",
      "validUntil": null,
      "status": "active"
    }
  ]
}
```

### 4. Verification Process

```
1. Extract signature metadata from PDF/QR code
2. Read keyVersion from signature
3. Look up corresponding public key from registry
4. Verify signature using that specific public key
5. Check if signing date was within key's validity period
```

### 5. HSM Integration

#### For AWS CloudHSM / KMS:
```bash
# Store key version in HSM metadata
aws kms create-key \
  --description "OpenCRVS Certificate Signing Key v2" \
  --tags TagKey=version,TagValue=v2 \
        TagKey=purpose,TagValue=certificate-signing

# Sign with HSM
aws kms sign \
  --key-id alias/opencrvs-cert-v2 \
  --message-type RAW \
  --signing-algorithm ECDSA_SHA_256 \
  --message fileb://document.hash
```

#### For Azure Key Vault:
```bash
# Create versioned key
az keyvault key create \
  --vault-name opencrvs-vault \
  --name cert-signing-v2 \
  --kty EC \
  --curve P-256 \
  --tags version=v2 purpose=certificate-signing
```

### 6. Key Rotation Procedure

#### Step 1: Generate New Key Pair (v2)
```bash
# Generate new ECDSA P-256 key pair
openssl ecparam -name prime256v1 -genkey -noout -out certificate-private-key-v2.pem
openssl ec -in certificate-private-key-v2.pem -pubout -out certificate-public-key-v2.pem
```

#### Step 2: Add Public Key to Registry
```sql
INSERT INTO public_keys (version, algorithm, public_key_pem, valid_from, status)
VALUES ('v2', 'ECDSA-P256', '<public_key_content>', '2025-01-01', 'pending');
```

#### Step 3: Update Configuration
```json
{
  "signing": {
    "activeKeyVersion": "v2",
    "privateKeyPath": "/app/keys/certificate-private-key-v2.pem"
  }
}
```

#### Step 4: Deploy New Version
- New certificates signed with v2
- Old certificates still verified with v1 public key

#### Step 5: Retire Old Key
- After grace period (e.g., 30 days), mark v1 as "retired"
- Keep v1 public key forever for historical verification
- Destroy v1 private key from HSM

### 7. Database Schema

```sql
CREATE TABLE certificate_public_keys (
    id UUID PRIMARY KEY,
    version VARCHAR(10) NOT NULL UNIQUE,
    algorithm VARCHAR(50) NOT NULL,
    public_key_pem TEXT NOT NULL,
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP,
    status VARCHAR(20) NOT NULL, -- 'active', 'retired', 'revoked'
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100)
);

CREATE INDEX idx_key_version ON certificate_public_keys(version);
CREATE INDEX idx_key_status ON certificate_public_keys(status);
```

### 8. API Endpoints

#### Get Public Key by Version
```
GET /api/certificates/public-keys/{version}

Response:
{
  "version": "v1",
  "algorithm": "ECDSA-P256",
  "publicKeyPEM": "-----BEGIN PUBLIC KEY-----\n...",
  "validFrom": "2024-01-01T00:00:00Z",
  "validUntil": "2025-01-01T00:00:00Z",
  "status": "retired"
}
```

#### List All Public Keys
```
GET /api/certificates/public-keys

Response:
{
  "keys": [
    { "version": "v1", "status": "retired", ... },
    { "version": "v2", "status": "active", ... }
  ]
}
```

### 9. Verifier App Updates

Update `verifier-app/app.js` to support multiple keys:

```javascript
const CONFIG = {
  // Fetch public keys from API instead of hardcoding
  publicKeysEndpoint: '/api/certificates/public-keys',
  publicKeys: {} // Populated at runtime
};

// Load all public keys on startup
async function loadPublicKeys() {
  const response = await fetch(CONFIG.publicKeysEndpoint);
  const data = await response.json();

  for (const keyData of data.keys) {
    CONFIG.publicKeys[keyData.version] = await importPublicKey(keyData.publicKeyPEM);
  }
}

// Verify with correct key version
async function verifySignature(qrData) {
  const { signature, keyVersion, ...dataToVerify } = qrData;

  if (!keyVersion) {
    console.warn('No key version in signature, using default (v1)');
    keyVersion = 'v1';
  }

  const publicKey = CONFIG.publicKeys[keyVersion];
  if (!publicKey) {
    console.error(`Public key version ${keyVersion} not found`);
    return false;
  }

  // Verify signature using versioned key
  return await crypto.subtle.verify(..., publicKey, ...);
}
```

### 10. Monitoring & Alerts

Track key usage and set up alerts:

```javascript
// Log key version usage
logger.info('Certificate signed', {
  keyVersion: 'v2',
  certificateId: '...',
  timestamp: new Date()
});

// Alert if old key still being used after rotation
if (keyVersion === 'v1' && new Date() > new Date('2025-01-31')) {
  alertService.send('Old signing key v1 still in use!');
}
```

### 11. Compliance & Audit

Maintain audit log:
```sql
CREATE TABLE key_rotation_audit (
    id UUID PRIMARY KEY,
    action VARCHAR(50), -- 'created', 'activated', 'retired', 'revoked'
    key_version VARCHAR(10),
    performed_by VARCHAR(100),
    timestamp TIMESTAMP DEFAULT NOW(),
    reason TEXT,
    notes TEXT
);
```

### 12. Emergency Key Revocation

If a private key is compromised:

```bash
# Mark key as revoked
UPDATE certificate_public_keys
SET status = 'revoked',
    valid_until = NOW()
WHERE version = 'v2';

# Generate emergency replacement key (v3)
# Deploy immediately
# Notify all authorities

# Add revocation check in verifier
if (keyStatus === 'revoked') {
  return {
    valid: false,
    error: 'This certificate was signed with a revoked key'
  };
}
```

## Best Practices

1. ✅ **Plan Rotation Schedule**: Rotate keys annually or bi-annually
2. ✅ **Overlap Period**: Run old and new keys concurrently for 30-90 days
3. ✅ **Never Delete Public Keys**: Keep forever for historical verification
4. ✅ **Secure Private Key Destruction**: Use HSM secure delete
5. ✅ **Test Rotation**: Practice in staging environment first
6. ✅ **Document Everything**: Maintain key lifecycle documentation
7. ✅ **Automate Verification**: Monitor that rotations complete successfully

## HSM-Specific Considerations

### AWS KMS
- Keys cannot be exported, only used for signing
- Automatic key rotation available (new key version each year)
- Old key versions remain available for verification
- Key ARN includes version: `arn:aws:kms:region:account:key/id/version`

### Azure Key Vault
- Supports automatic key rotation
- Previous versions accessible via version URL
- Keys can be backed up and restored
- Soft-delete protection available

### Hardware HSM (Thales, Gemalto)
- Manual key generation and rotation
- Export public key, keep private key in HSM
- Use key labels/aliases for versioning
- Backup HSM with all key versions

## Migration Path

### Phase 1: Add Version Support (No Breaking Changes)
- Update signature code to include version="v1"
- Update verifier to accept version field (default to v1 if missing)
- Deploy to production

### Phase 2: Multi-Key Registry
- Create public_keys table
- Add API endpoints for key retrieval
- Update verifier app to fetch keys from API

### Phase 3: First Rotation
- Generate v2 keys
- Add v2 to registry
- Switch signing to v2
- Monitor for 30 days
- Retire v1 (but keep public key)

## Summary

**Key rotation does NOT invalidate old certificates** if you:
1. Store key version in signature metadata
2. Maintain registry of all public keys (past and present)
3. Verify using the specific key version that signed the certificate
4. Never delete old public keys

This is similar to how TLS certificates work - old certificates remain valid because the CA's public key is still available for verification.
