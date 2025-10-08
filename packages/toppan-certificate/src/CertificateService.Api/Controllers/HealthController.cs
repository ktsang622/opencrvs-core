using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using CertificateService.Api.Configuration;
using System.Diagnostics;

namespace CertificateService.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class HealthController : ControllerBase
    {
        private readonly CertificateServiceOptions _options;
        private readonly ILogger<HealthController> _logger;
        private static readonly DateTime _startTime = DateTime.UtcNow;

        public HealthController(
            IOptions<CertificateServiceOptions> options,
            ILogger<HealthController> logger)
        {
            _options = options.Value;
            _logger = logger;
        }

        /// <summary>
        /// Health check endpoint - validates configuration and templates
        /// </summary>
        /// <returns>Health status with template validation results</returns>
        [HttpGet]
        [ProducesResponseType(typeof(HealthResponse), 200)]
        [ProducesResponseType(typeof(HealthResponse), 503)]
        public IActionResult Get()
        {
            var response = new HealthResponse
            {
                Status = "healthy",
                Version = "1.0.0",
                Uptime = (int)(DateTime.UtcNow - _startTime).TotalSeconds,
                Timestamp = DateTime.UtcNow
            };

            var errors = new List<string>();

            try
            {
                // Check templates path exists
                if (!Directory.Exists(_options.TemplatesPath))
                {
                    errors.Add($"Templates path not found: {_options.TemplatesPath}");
                }

                // Validate required templates if configured
                if (_options.HealthCheck.ValidateTemplatesOnStartup)
                {
                    var templateErrors = ValidateTemplates();
                    errors.AddRange(templateErrors);
                }

                // Count loaded templates
                response.TemplatesLoaded = _options.Templates.Count;
                response.TemplatesList = _options.Templates.Keys.ToList();

                // Check if any templates are configured
                if (response.TemplatesLoaded == 0)
                {
                    errors.Add("No templates configured");
                }

                // Set overall status
                if (errors.Any())
                {
                    response.Status = "unhealthy";
                    response.Error = string.Join("; ", errors);
                    _logger.LogWarning("Health check failed: {Errors}", string.Join(", ", errors));
                    return StatusCode(503, response);
                }

                _logger.LogInformation("Health check passed: {TemplateCount} templates loaded", response.TemplatesLoaded);
                return Ok(response);
            }
            catch (Exception ex)
            {
                response.Status = "unhealthy";
                response.Error = $"Health check exception: {ex.Message}";
                _logger.LogError(ex, "Health check failed with exception");
                return StatusCode(503, response);
            }
        }

        private List<string> ValidateTemplates()
        {
            var errors = new List<string>();

            foreach (var templateName in _options.HealthCheck.RequiredTemplates)
            {
                if (!_options.Templates.ContainsKey(templateName))
                {
                    errors.Add($"Required template '{templateName}' not configured");
                    continue;
                }

                var template = _options.Templates[templateName];
                var (isValid, errorMessage) = template.Validate(_options.TemplatesPath);

                if (!isValid)
                {
                    errors.Add($"Template '{templateName}': {errorMessage}");
                }
            }

            return errors;
        }
    }

    /// <summary>
    /// Health check response model
    /// </summary>
    public class HealthResponse
    {
        public string Status { get; set; } = "healthy";
        public string Version { get; set; } = "1.0.0";
        public int Uptime { get; set; }
        public DateTime Timestamp { get; set; }
        public int TemplatesLoaded { get; set; }
        public List<string>? TemplatesList { get; set; }
        public string? LastRenderTime { get; set; }
        public string? Error { get; set; }
    }
}
