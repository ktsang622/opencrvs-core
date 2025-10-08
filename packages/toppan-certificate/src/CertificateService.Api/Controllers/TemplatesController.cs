using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using CertificateService.Api.Configuration;
using CertificateService.Core.Template;

namespace CertificateService.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TemplatesController : ControllerBase
    {
        private readonly CertificateServiceOptions _options;
        private readonly ILogger<TemplatesController> _logger;

        public TemplatesController(
            IOptions<CertificateServiceOptions> options,
            ILogger<TemplatesController> logger)
        {
            _options = options.Value;
            _logger = logger;
        }

        /// <summary>
        /// Validate a template file without generating a certificate
        /// </summary>
        [HttpPost("validate")]
        [ProducesResponseType(typeof(TemplateValidationResponse), 200)]
        [ProducesResponseType(typeof(TemplateValidationResponse), 400)]
        public IActionResult Validate([FromBody] TemplateValidationRequest request)
        {
            try
            {
                _logger.LogInformation("Validating template content ({Length} bytes)", request.TemplateContent?.Length ?? 0);

                if (string.IsNullOrEmpty(request.TemplateContent))
                {
                    return BadRequest(new TemplateValidationResponse
                    {
                        Valid = false,
                        Message = "Template content is required",
                        Errors = new List<string> { "templateContent cannot be empty" }
                    });
                }

                // Write to temp file (ElmLayout only supports LoadFromFile)
                var tempFile = Path.GetTempFileName();
                try
                {
                    System.IO.File.WriteAllText(tempFile, request.TemplateContent);

                    var layout = new ElmLayout();
                    var result = layout.LoadFromFile(tempFile);

                    if (result != 0)
                    {
                        return BadRequest(new TemplateValidationResponse
                        {
                            Valid = false,
                            Message = $"Template validation failed: {layout.LoadErrorMessage}",
                            Errors = new List<string> { layout.LoadErrorMessage ?? "Unknown error" },
                            Details = new
                            {
                                lineNumber = layout.LoadErrorLineNumber
                            }
                        });
                    }

                    return Ok(new TemplateValidationResponse
                    {
                        Valid = true,
                        Message = "Template is valid",
                        ItemCount = layout.ItemCount,
                        Details = new
                        {
                            totalItems = layout.ItemCount,
                            hasBackPage = layout.RenderBack
                        }
                    });
                }
                finally
                {
                    if (System.IO.File.Exists(tempFile))
                    {
                        System.IO.File.Delete(tempFile);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Template validation exception");
                return BadRequest(new TemplateValidationResponse
                {
                    Valid = false,
                    Message = $"Template validation error: {ex.Message}",
                    Errors = new List<string> { ex.Message }
                });
            }
        }

        /// <summary>
        /// List all configured templates
        /// </summary>
        [HttpGet("list")]
        [ProducesResponseType(typeof(TemplateListResponse), 200)]
        public IActionResult List()
        {
            var templates = _options.Templates.Select(kvp => new TemplateInfo
            {
                Name = kvp.Key,
                FolderName = kvp.Value.FolderName,
                LayoutFile = kvp.Value.LayoutFile,
                SupportedPages = kvp.Value.SupportedPages,
                RequireSections = kvp.Value.RequireSections,
                Path = kvp.Value.GetTemplatePath(_options.TemplatesPath)
            }).ToList();

            return Ok(new TemplateListResponse
            {
                Templates = templates,
                TotalCount = templates.Count,
                TemplatesPath = _options.TemplatesPath
            });
        }

        /// <summary>
        /// Get specific template information
        /// </summary>
        [HttpGet("{name}")]
        [ProducesResponseType(typeof(TemplateDetailsResponse), 200)]
        [ProducesResponseType(404)]
        public IActionResult GetTemplate(string name)
        {
            if (!_options.Templates.ContainsKey(name))
            {
                return NotFound(new { error = $"Template '{name}' not found" });
            }

            var template = _options.Templates[name];
            var templatePath = template.GetTemplatePath(_options.TemplatesPath);
            var layoutPath = template.GetLayoutFilePath(_options.TemplatesPath);

            var response = new TemplateDetailsResponse
            {
                Name = name,
                FolderName = template.FolderName,
                LayoutFile = template.LayoutFile,
                TemplatePath = templatePath,
                LayoutFilePath = layoutPath,
                Exists = Directory.Exists(templatePath),
                LayoutExists = System.IO.File.Exists(layoutPath),
                SupportedPages = template.SupportedPages,
                RequireSections = template.RequireSections
            };

            var (isValid, errorMessage) = template.Validate(_options.TemplatesPath);
            response.IsValid = isValid;
            response.ValidationMessage = errorMessage;

            return Ok(response);
        }
    }

    #region Request/Response Models

    public class TemplateValidationRequest
    {
        public string? TemplateContent { get; set; }
    }

    public class TemplateValidationResponse
    {
        public bool Valid { get; set; }
        public string? Message { get; set; }
        public int ItemCount { get; set; }
        public List<string>? Errors { get; set; }
        public object? Details { get; set; }
    }

    public class TemplateListResponse
    {
        public List<TemplateInfo>? Templates { get; set; }
        public int TotalCount { get; set; }
        public string? TemplatesPath { get; set; }
    }

    public class TemplateInfo
    {
        public string? Name { get; set; }
        public string? FolderName { get; set; }
        public string? LayoutFile { get; set; }
        public List<string>? SupportedPages { get; set; }
        public List<string>? RequireSections { get; set; }
        public string? Path { get; set; }
    }

    public class TemplateDetailsResponse
    {
        public string? Name { get; set; }
        public string? FolderName { get; set; }
        public string? LayoutFile { get; set; }
        public string? TemplatePath { get; set; }
        public string? LayoutFilePath { get; set; }
        public bool Exists { get; set; }
        public bool LayoutExists { get; set; }
        public bool IsValid { get; set; }
        public string? ValidationMessage { get; set; }
        public List<string>? SupportedPages { get; set; }
        public List<string>? RequireSections { get; set; }
    }

    #endregion
}
