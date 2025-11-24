using CertificateService.Core.Template;
using CertificateService.Core.Rendering;
using CertificateService.Core.Services;
using CertificateService.Api.Configuration;
using CertificateService.Api.Services;
using CertificateService.Api.Swagger;
using Swashbuckle.AspNetCore.Filters;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Configure strongly-typed settings
builder.Services.Configure<CertificateServiceOptions>(
    builder.Configuration.GetSection(CertificateServiceOptions.SectionName));

// Register HTTP client for template loading
builder.Services.AddHttpClient<TemplateLoader>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

// Register template loader service
builder.Services.AddSingleton<TemplateLoader>();

// Register core services
builder.Services.AddSingleton<AmendmentProcessor>();
builder.Services.AddSingleton<PdfGeneratorSkiaSharp>();

// Register QR code and signature services
builder.Services.AddSingleton(sp =>
{
    var logger = sp.GetRequiredService<ILogger<DigitalSignatureService>>();
    var privateKeyPem = builder.Configuration["CertificateService:RsaPrivateKey"];
    return new DigitalSignatureService(logger, privateKeyPem);
});
builder.Services.AddSingleton<QrCodeService>();

// Register PDF signing service (uses same ECDSA key as QR signatures)
builder.Services.AddSingleton(sp =>
{
    var logger = sp.GetRequiredService<ILogger<PdfSigningService>>();
    var privateKeyPath = builder.Configuration["CertificateService:PdfSigningKeyPath"];
    var publicKeyPath = builder.Configuration["CertificateService:PdfVerificationKeyPath"];

    logger.LogInformation("Initializing PdfSigningService with key paths - private: {PrivatePath}, public: {PublicPath}",
        privateKeyPath ?? "(null)", publicKeyPath ?? "(null)");

    // Load private key from file if path is configured
    string? privateKeyPem = null;
    if (!string.IsNullOrEmpty(privateKeyPath))
    {
        logger.LogInformation("Checking if private key file exists at {Path}", privateKeyPath);
        if (File.Exists(privateKeyPath))
        {
            privateKeyPem = File.ReadAllText(privateKeyPath);
            logger.LogInformation("Loaded private key for PDF signing from {Path} ({Size} bytes)", privateKeyPath, privateKeyPem.Length);
        }
        else
        {
            logger.LogWarning("PDF signing key not found at {Path}", privateKeyPath);
        }
    }
    else
    {
        logger.LogWarning("PdfSigningKeyPath configuration is null or empty");
    }

    // Load public key from file if path is configured
    string? publicKeyPem = null;
    if (!string.IsNullOrEmpty(publicKeyPath))
    {
        logger.LogInformation("Checking if public key file exists at {Path}", publicKeyPath);
        if (File.Exists(publicKeyPath))
        {
            publicKeyPem = File.ReadAllText(publicKeyPath);
            logger.LogInformation("Loaded public key for PDF verification from {Path} ({Size} bytes)", publicKeyPath, publicKeyPem.Length);
        }
        else
        {
            logger.LogWarning("PDF verification key not found at {Path}", publicKeyPath);
        }
    }
    else
    {
        logger.LogWarning("PdfVerificationKeyPath configuration is null or empty");
    }

    return new PdfSigningService(logger, privateKeyPem, publicKeyPem);
});

// Add CORS policy for verifier app
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowVerifierApp", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Add controllers and API services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Toppan CRVS Certificate Generation Service",
        Version = "v1.0.0",
        Description = @"REST API for generating multi-page PDF certificates with amendment history support.

## Key Features
- Multi-page PDF generation (front + back with amendments)
- Amendment history with superscript notation
- Flexible template-based rendering
- Support for birth, death, and marriage certificates

## Integration
Designed to be called from OpenCRVS Gateway service after fetching FHIR data from MongoDB.",
        Contact = new Microsoft.OpenApi.Models.OpenApiContact
        {
            Name = "OpenCRVS Team",
            Url = new Uri("https://github.com/opencrvs")
        },
        License = new Microsoft.OpenApi.Models.OpenApiLicense
        {
            Name = "MPL 2.0",
            Url = new Uri("https://www.mozilla.org/en-US/MPL/2.0/")
        }
    });

    // Enable XML comments for documentation
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
    {
        options.IncludeXmlComments(xmlPath, includeControllerXmlComments: true);
    }

    // Add examples for common request/response types
    options.EnableAnnotations();
    options.ExampleFilters();

    // Add custom filter for multiple examples dropdown
    options.OperationFilter<MultipleExamplesFilter>();
});

// Register Swagger examples
builder.Services.AddSwaggerExamplesFromAssemblyOf<Program>();

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseDefaultFiles(); // Enable default file mapping (e.g., index.html)
app.UseStaticFiles(); // Enable serving static files from wwwroot

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Certificate Service API v1");
    options.RoutePrefix = "swagger"; // Swagger UI at /swagger (http://localhost:5000/swagger)
    options.DocumentTitle = "Toppan CRVS Certificate Service";
    options.DefaultModelsExpandDepth(2);
    options.DefaultModelRendering(Swashbuckle.AspNetCore.SwaggerUI.ModelRendering.Example);
    options.DisplayRequestDuration();
    options.EnableTryItOutByDefault();
});

if (app.Environment.IsDevelopment())
{
    // Test ElmLayout parser on startup
    Console.WriteLine("\n=== Testing ElmLayout Parser ===");
    ElmLayoutTest.TestParse();
    Console.WriteLine("=================================\n");

    // Test certificate rendering
    RenderTest.TestRender();
}

// Preload templates at startup (mirrors OpenCRVS client pattern)
var templateLoader = app.Services.GetRequiredService<TemplateLoader>();
var certificateOptions = app.Services.GetRequiredService<IOptions<CertificateServiceOptions>>().Value;

Console.WriteLine("\n=== Preloading Certificate Templates ===");
var templatesToLoad = certificateOptions.Templates.Keys.Select(k => k.ToLower()).ToArray();
var preloadResult = await templateLoader.PreloadTemplatesAsync(templatesToLoad);

// Check if required templates loaded successfully
var requiredTemplates = certificateOptions.HealthCheck.RequiredTemplates;
var missingRequired = preloadResult.FailedTemplates
    .Where(t => requiredTemplates.Contains(char.ToUpper(t[0]) + t.Substring(1)))
    .ToList();

if (missingRequired.Any())
{
    // Required templates missing - FAIL FAST
    var errorMsg = $"FATAL: Required templates failed to load: {string.Join(", ", missingRequired)}. " +
                   $"Check TemplatesUrl ({certificateOptions.TemplatesUrl ?? "not set"}) or " +
                   $"TemplatesPath ({certificateOptions.TemplatesPath})";
    Console.WriteLine($"❌ {errorMsg}");
    throw new InvalidOperationException(errorMsg);
}
else if (!preloadResult.IsSuccess)
{
    // Optional templates missing - WARN but continue
    Console.WriteLine($"⚠️  Optional templates failed to load: {string.Join(", ", preloadResult.FailedTemplates)}");
}
else
{
    // All templates loaded successfully
    Console.WriteLine($"✅ All templates loaded successfully ({preloadResult.LoadedTemplates.Count}/{templatesToLoad.Length})");
}

Console.WriteLine($"   Cache: {preloadResult.CacheStats.Count} items, {preloadResult.CacheStats.TotalSizeBytes:N0} bytes");
Console.WriteLine($"   Duration: {preloadResult.Duration.TotalMilliseconds:F0}ms");
Console.WriteLine("========================================\n");

app.UseCors("AllowVerifierApp");
app.UseAuthorization();
app.MapControllers();

app.Run();
