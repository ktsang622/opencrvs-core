# Template Loading with HTTP Fallback

## Architecture

Certificate-service supports **two methods** for loading templates with automatic fallback:

1. **HTTP (Primary)** - Fetch from country-config endpoint (production/deployed)
2. **File System (Fallback)** - Load from local disk (development/testing)

This makes the service **truly generic** while still working locally.

## How It Works

```
Certificate generation requested
  ↓
TemplateLoader.LoadTemplateFileAsync("birth", "ElmLayout.txt")
  ↓
┌─────────────────────────┐
│ Try HTTP first          │
│ (if TemplatesUrl set)   │
└──────────┬──────────────┘
           │
    Success? ──YES──→ Return template
           │
          NO
           ↓
┌─────────────────────────┐
│ Fallback to File System │
│ (TemplatesPath)         │
└──────────┬──────────────┘
           │
    Success? ──YES──→ Return template
           │
          NO
           ↓
        Error
```

## Configuration

### Development (Local File System)
```json
{
  "CertificateService": {
    "TemplatesPath": "/app/templates",
    "TemplatesUrl": null  // Not set = use file system only
  }
}
```

**Docker:**
```yaml
toppan-certificate:
  volumes:
    - ./certificate-service/templates:/app/templates:ro
```

### Production (HTTP from Country-Config)
```json
{
  "CertificateService": {
    "TemplatesPath": "/app/templates",  // Fallback if HTTP fails
    "TemplatesUrl": "http://countryconfig:3040/api/countryconfig/certificates/toppan"
  }
}
```

**No volume mount needed!** Templates fetched via HTTP.

## Country-Config Endpoints

Country-config serves templates via HTTP (implemented in country-config-atg):

```
GET /api/countryconfig/certificates/toppan/birth/ElmLayout.txt
GET /api/countryconfig/certificates/toppan/birth/BirthCertificateBackground.jpg
GET /api/countryconfig/certificates/toppan/birth/SampleBirthCertificate.png
GET /api/countryconfig/certificates/toppan/birth/SampleBirthCertificateBack.png
GET /api/countryconfig/certificates/toppan/birth/signature.png
```

**Authentication:** None required (public endpoint)

## Template Caching

Templates are cached in memory to avoid repeated HTTP calls:

- **Cache Duration:** Controlled by `CacheDurationMinutes` config
- **Cache Enabled:** `EnableCaching: true` (default)
- **Clear Cache:** `TemplateLoader.ClearCache()` method

## Usage in Code

The `TemplateLoader` service is injected into controllers:

```csharp
public class CertificatesController : ControllerBase
{
    private readonly TemplateLoader _templateLoader;

    public CertificatesController(TemplateLoader templateLoader)
    {
        _templateLoader = templateLoader;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] CertificateRequest request)
    {
        // Load template (tries HTTP, falls back to file system)
        var layoutContent = await _templateLoader.LoadTemplateFileAsync("birth", "ElmLayout.txt");

        // Load images
        var backgroundBytes = await _templateLoader.LoadBinaryFileAsync("birth", "BirthCertificateBackground.jpg");

        // ... generate certificate
    }
}
```

## Benefits

### ✅ Generic Service
- Certificate-service has no country-specific templates
- Works with any country-config
- Easy to reuse across deployments

### ✅ Country Control
- Country owns templates in their config repo
- Can update templates without touching certificate-service
- Version controlled with country configuration

### ✅ Development Friendly
- Local development uses file system (fast)
- No HTTP server needed for testing
- Production uses HTTP (generic)

### ✅ Resilient
- HTTP fails → Automatic fallback to file system
- Cache reduces HTTP calls
- Logs show which method was used

## Deployment Scenarios

### Scenario 1: Local Development
```bash
# Developer working on certificate-service
cd certificate-service
dotnet run

# Uses local templates from /app/templates
# No HTTP, no country-config needed
```

### Scenario 2: Integrated Development
```bash
# Full stack running locally
docker-compose up

# Certificate-service config:
TemplatesUrl: http://countryconfig:3040/api/countryconfig/certificates/toppan

# Fetches templates from country-config via HTTP
# Falls back to /app/templates if country-config is down
```

### Scenario 3: Production
```bash
# Deployed to cloud
# Certificate-service config:
TemplatesUrl: http://countryconfig-atg:3040/api/countryconfig/certificates/toppan

# Fetches templates from country-config-atg service
# Each country has its own country-config with custom templates
# No file mounts needed
```

## Monitoring

Logs show which method was used:

```
[INFO] Fetching template from HTTP: http://countryconfig:3040/api/countryconfig/certificates/toppan/birth/ElmLayout.txt
[INFO] Loaded template from HTTP: ... (10693 bytes)
```

Or:

```
[WARN] HTTP template fetch failed: 404 from ...
[INFO] Loaded template from file system: /app/templates/birth/ElmLayout.txt (10693 bytes)
```

## Cache Management

Check cache stats:
```csharp
var (count, size) = _templateLoader.GetCacheStats();
Console.WriteLine($"Cache: {count} templates, {size} bytes");
```

Clear cache (e.g., when templates updated):
```csharp
_templateLoader.ClearCache();
```

## Next Steps

1. ✅ TemplateLoader service created
2. ✅ Registered in Program.cs
3. ✅ Configuration added to appsettings.json
4. 📋 Update CertificatesController to use TemplateLoader
5. 📋 Test HTTP loading
6. 📋 Test fallback to file system
7. 📋 Update docker-compose with TemplatesUrl

## Testing

### Test HTTP Loading:
```bash
# Start country-config-atg
cd /home/ktsang/opencrvs-countryconfig-atg
yarn start

# Start certificate-service with HTTP config
export CertificateService__TemplatesUrl="http://localhost:3040/api/countryconfig/certificates/toppan"
dotnet run

# Generate certificate - should fetch from HTTP
curl -X POST http://localhost:5000/api/certificates/generate ...
```

### Test Fallback:
```bash
# Start certificate-service WITHOUT HTTP config
unset CertificateService__TemplatesUrl
dotnet run

# Generate certificate - should use file system
# Check logs: "Loaded template from file system: ..."
```
