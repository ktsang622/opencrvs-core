# Certificate Signing Keys

## Important Security Notes

⚠️ **NEVER commit private keys to git!**

The signing keys for certificates are critical:
- If keys change, **ALL previously signed certificates become invalid**
- Keys must be managed externally and mounted as secrets in production
- Keys should be backed up securely and rotated carefully

## Key Generation

Generate ECDSA P-256 key pair:

```bash
# Generate private key
openssl ecparam -name prime256v1 -genkey -noout -out certificate-private-key.pem

# Extract public key
openssl ec -in certificate-private-key.pem -pubout -out certificate-public-key.pem
```

## Production Deployment

### Docker/Kubernetes
Mount keys as secrets:

```yaml
volumes:
  - /secure/path/keys:/app/keys:ro
```

### Environment Variables
Alternatively, provide keys via environment variables:

```bash
CERTIFICATE_PRIVATE_KEY="$(cat certificate-private-key.pem)"
CERTIFICATE_PUBLIC_KEY="$(cat certificate-public-key.pem)"
```

## Key Management Best Practices

1. **Generate once**: Generate keys during initial setup
2. **Backup securely**: Store keys in encrypted backup (e.g., AWS Secrets Manager, Azure Key Vault)
3. **Restrict access**: Only authorized personnel should access private keys
4. **Rotate carefully**: If rotation is needed, maintain old keys for verification
5. **Version control**: Track which key version signed which certificates

## Key Files

- `certificate-private-key.pem` - Private key for signing (NEVER commit to git)
- `certificate-public-key.pem` - Public key for verification (can be public)

## Verification After Key Change

If keys must be changed:
1. Keep old public key for verifying historical certificates
2. Update verifier app with multiple public keys
3. Add key version identifier to signatures
4. Maintain a key rotation log
