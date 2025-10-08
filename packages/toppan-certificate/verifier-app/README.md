# OpenCRVS Certificate Verifier

A standalone web application for verifying the authenticity of OpenCRVS birth certificates by scanning QR codes using your device camera.

## Features

- 📷 **Camera Scanning** - Uses device camera to scan QR codes from certificates
- 🔐 **Client-Side Verification** - Verifies ECDSA signatures entirely in the browser (no backend required)
- 📱 **Mobile-Friendly** - Works on smartphones and tablets
- 🌐 **Standalone** - Can be hosted on any static web server
- 🔗 **Record Linking** - Direct links to view full records in OpenCRVS system

## How It Works

### Tamper Detection

1. **QR Code Generation** (Certificate Service)
   - Certificate data (number, type, date, URL) is signed with ECDSA private key
   - Signature is embedded in QR code along with the data

2. **QR Code Verification** (Verifier App)
   - User scans QR code with device camera
   - App extracts certificate data and signature from QR code
   - App verifies signature using embedded ECDSA public key
   - **Valid signature** = Certificate is authentic and hasn't been tampered
   - **Invalid signature** = Certificate has been modified or is fake

3. **Security**
   - Uses ECDSA P-256 (256-bit elliptic curve cryptography)
   - Signature verification happens entirely in the browser using Web Crypto API
   - Public key is embedded in the app (safe to be public)
   - Any modification to certificate data invalidates the signature

## Deployment

### Option 1: Local Development

Simply open `index.html` in a web browser:

```bash
# Navigate to verifier-app directory
cd /home/ktsang/certificate-service/verifier-app

# Open in browser (Linux)
xdg-open index.html

# Or use a local web server for HTTPS (required for camera access)
python3 -m http.server 8080
# Then visit: http://localhost:8080
```

**Note:** Camera access requires HTTPS in production. For local testing, browsers allow camera access on `localhost`.

### Option 2: Static Web Hosting

Deploy to any static hosting service:

```bash
# Upload all files to:
# - GitHub Pages
# - Netlify
# - Vercel
# - AWS S3 + CloudFront
# - Any web server

# Files to deploy:
index.html
app.js
```

### Option 3: Docker/Nginx

```dockerfile
FROM nginx:alpine
COPY verifier-app/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Usage

1. **Open the app** in a web browser on your device
2. **Click "Start Camera Scan"** button
3. **Point camera** at the QR code on the certificate
4. **Wait for scan** - App will automatically detect and verify the QR code
5. **View results**:
   - ✅ Green = Certificate is valid and authentic
   - ⚠️ Yellow = Signature verification failed (tampered or fake)
   - ❌ Red = Invalid QR code or camera error

## Technical Details

### Dependencies

- **jsQR** (v1.4.0) - QR code detection and decoding
- **Web Crypto API** - ECDSA signature verification (built into modern browsers)

### Browser Compatibility

Requires modern browsers with:
- Web Crypto API support (ECDSA P-256)
- MediaDevices API (camera access)
- ES6+ JavaScript support

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### QR Code Data Structure

```json
{
  "certificateNumber": "2024/B/001234",
  "certificateType": "birth",
  "issuedAt": 1704067200,
  "recordUrl": "https://crvs.gov.ag/view/2024-B-001234",
  "signature": "MEUCIQDxxxxx..." // Base64-encoded ECDSA signature
}
```

### Public Key

The ECDSA P-256 public key is embedded in `app.js`:

```javascript
const CONFIG = {
    publicKeyPEM: `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEw5BlICzzIUVox2gl1TMAB7TZBn79
YJAGNslFMnKRZAfaHlGU6TGc0//iM4I+CcolXzG7/GQU9LhV81wZK6Te3Q==
-----END PUBLIC KEY-----`
};
```

**Important:** If you regenerate the ECDSA key pair in the certificate service, you must update this public key in the verifier app.

## Security Considerations

### What is Protected

✅ Certificate data integrity - Any modification to the certificate data will be detected
✅ Signature authenticity - Only certificates signed by the legitimate private key will verify
✅ Tamper detection - Modified certificates will fail verification

### What is NOT Protected

❌ QR code substitution - Someone could print a valid certificate's QR code on a fake document (physical security required)
❌ Key compromise - If the private key is stolen, attackers can create valid certificates
❌ Replay attacks - Valid QR codes can be scanned multiple times (use recordUrl to check status)

### Best Practices

1. **Always check the recordUrl** - Click "View Full Record" to verify certificate status in the official system
2. **Compare physical details** - Match the printed certificate details with QR data
3. **Check certificate status** - Some certificates may be revoked even if signature is valid
4. **Protect private keys** - Keep certificate service private keys secure and rotate regularly

## Maintenance

### Updating the Public Key

If you regenerate the ECDSA key pair:

1. Generate new keys in certificate service:
   ```bash
   cd /home/ktsang/certificate-service
   ./scripts/generate-ecdsa-keys.sh
   ```

2. Copy new public key to verifier app:
   ```bash
   # Copy content of keys/certificate-public-key.pem
   # Update CONFIG.publicKeyPEM in app.js
   ```

3. Redeploy the verifier app

## Support

For issues or questions:
- Certificate Service: Internal development team
- Verifier App: See repository documentation

## License

MPL-2.0 (Mozilla Public License 2.0)

---

**Built for OpenCRVS** - Open Source Civil Registration and Vital Statistics
