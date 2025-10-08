using CertificateService.Core.Template;
using CertificateService.Core.Rendering;
using CertificateService.Core.Services;
using CertificateService.Api.Configuration;
using CertificateService.Api.Swagger;
using Swashbuckle.AspNetCore.Filters;

var builder = WebApplication.CreateBuilder(args);

// Configure strongly-typed settings
builder.Services.Configure<CertificateServiceOptions>(
    builder.Configuration.GetSection(CertificateServiceOptions.SectionName));

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
        Title = "OpenCRVS Certificate Generation Service",
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

app.UseCors("AllowVerifierApp");
app.UseAuthorization();
app.MapControllers();

app.Run();
