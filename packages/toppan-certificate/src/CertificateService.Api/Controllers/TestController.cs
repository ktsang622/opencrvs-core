using Microsoft.AspNetCore.Mvc;
using CertificateService.Core.Models;
using CertificateService.Core.Rendering;
using CertificateService.Core.Template;
using CertificateService.Core.Services;
using SkiaSharp;
using System.Text;
using System.Text.Json;

namespace CertificateService.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TestController : ControllerBase
    {
        /// <summary>
        /// Simple test endpoint that returns a "PDF" (just text for now)
        /// </summary>
        [HttpGet("hello")]
        public IActionResult Hello()
        {
            return Ok(new { message = "Certificate Service is running!", timestamp = DateTime.UtcNow });
        }

        /// <summary>
        /// Debug endpoint to inspect PersonalInfo after amendment processing
        /// </summary>
        [HttpPost("debug-amendments")]
        public IActionResult DebugAmendments([FromBody] CertificateRequest request)
        {
            try
            {
                // Convert request to PersonalInfo
                var personalInfo = new PersonalInfo();

                // Add child data
                if (request.Child != null)
                {
                    personalInfo.AddScalar("ChildFirstName", request.Child.FirstName ?? "");
                    personalInfo.AddScalar("ChildMiddleName", request.Child.MiddleName ?? "");
                    personalInfo.AddScalar("ChildSurname", request.Child.Surname ?? "");
                }

                // Process amendments
                var amendmentProcessor = new AmendmentProcessor();
                if (request.Amendments.Any())
                {
                    var amendments = request.Amendments.Select(a => a.ToAmendment()).ToList();
                    amendmentProcessor.ProcessAmendments(personalInfo, amendments);
                }

                // Inspect PersonalInfo
                var result = new
                {
                    simpleItems = personalInfo.SimpleItems.OrderBy(kv => kv.Key).ToDictionary(kv => kv.Key, kv => kv.Value),
                    amendmentsList = personalInfo.GetGroupList("AmendmentsList"),
                    amendmentsListCount = personalInfo.GetGroupList("AmendmentsList")?.Count ?? 0
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stack = ex.StackTrace });
            }
        }

        /// <summary>
        /// Test endpoint that returns mock PDF with sample data
        /// </summary>
        [HttpPost("generate-mock")]
        public IActionResult GenerateMockPdf([FromBody] CertificateRequest request)
        {
            // For now, create a simple text file showing what we received
            var content = new StringBuilder();
            content.AppendLine("MOCK CERTIFICATE - PDF Generation Coming Soon!");
            content.AppendLine("=============================================");
            content.AppendLine($"Certificate Type: {request.CertificateType}");
            content.AppendLine($"Template: {request.TemplateName}");
            content.AppendLine();

            if (request.Child != null)
            {
                content.AppendLine("CHILD:");
                content.AppendLine($"  Name: {request.Child.FirstName} {request.Child.MiddleName} {request.Child.Surname}");
                content.AppendLine($"  DOB: {request.Child.DateOfBirth}");
                content.AppendLine($"  Sex: {request.Child.Sex}");
            }

            if (request.Mother != null)
            {
                content.AppendLine("\nMOTHER:");
                content.AppendLine($"  Name: {request.Mother.FirstName} {request.Mother.Surname}");
                content.AppendLine($"  DOB: {request.Mother.DateOfBirth}");
            }

            if (request.Father != null)
            {
                content.AppendLine("\nFATHER:");
                content.AppendLine($"  Name: {request.Father.FirstName} {request.Father.Surname}");
                content.AppendLine($"  DOB: {request.Father.DateOfBirth}");
            }

            content.AppendLine($"\nAMENDMENTS: {request.Amendments.Count}");
            foreach (var amendment in request.Amendments)
            {
                content.AppendLine($"  - {amendment.Type}: {amendment.Section} on {amendment.Date}");
                foreach (var field in amendment.Fields)
                {
                    content.AppendLine($"    {field.Key} = {field.Value}");
                }
            }

            var bytes = Encoding.UTF8.GetBytes(content.ToString());
            return File(bytes, "text/plain", "mock-certificate.txt");
        }

        /// <summary>
        /// Generate PNG certificate with amendments
        /// </summary>
        [HttpPost("generate-png")]
        public IActionResult GeneratePng([FromBody] CertificateRequest request)
        {
            try
            {
                // Setup output directory
                var outputDir = "/app/test-output";
                Directory.CreateDirectory(outputDir);

                // Convert request to PersonalInfo
                var personalInfo = new PersonalInfo();

                // Add child data
                if (request.Child != null)
                {
                    personalInfo.AddScalar("Child_FirstName", request.Child.FirstName ?? "");
                    personalInfo.AddScalar("Child_MiddleName", request.Child.MiddleName ?? "");
                    personalInfo.AddScalar("Child_Surname", request.Child.Surname ?? "");
                    personalInfo.AddScalar("Child_DateOfBirth", request.Child.DateOfBirth ?? "");
                    personalInfo.AddScalar("Child_Sex", request.Child.Sex ?? "");
                }

                // Add mother data
                if (request.Mother != null)
                {
                    personalInfo.AddScalar("Mother_FirstName", request.Mother.FirstName ?? "");
                    personalInfo.AddScalar("Mother_Surname", request.Mother.Surname ?? "");
                    personalInfo.AddScalar("Mother_DateOfBirth", request.Mother.DateOfBirth ?? "");
                }

                // Add father data
                if (request.Father != null)
                {
                    personalInfo.AddScalar("Father_FirstName", request.Father.FirstName ?? "");
                    personalInfo.AddScalar("Father_Surname", request.Father.Surname ?? "");
                    personalInfo.AddScalar("Father_DateOfBirth", request.Father.DateOfBirth ?? "");
                }

                // Add amendments as a group list
                if (request.Amendments.Any())
                {
                    foreach (var amendment in request.Amendments)
                    {
                        var amendmentDict = new Dictionary<string, string>
                        {
                            { "Type", amendment.Type },
                            { "Date", amendment.Date },
                            { "Section", amendment.Section }
                        };
                        foreach (var field in amendment.Fields)
                        {
                            amendmentDict[field.Key] = field.Value;
                        }
                        personalInfo.AddToGroup("Amendments", amendmentDict);
                    }
                }

                // Load template
                var templatePath = Path.Combine("/app/templates", request.TemplateName);
                var layoutFile = Path.Combine(templatePath, "ElmLayout.txt");

                // Create a simple layout if it doesn't exist
                if (!System.IO.File.Exists(layoutFile))
                {
                    return BadRequest(new { error = "Template layout not found" });
                }

                var layout = new ElmLayout();
                var loadResult = layout.LoadFromFile(layoutFile);
                if (loadResult != 0)
                {
                    return BadRequest(new { error = $"Failed to load layout: {layout.LoadErrorMessage}" });
                }

                // Render to bitmap
                var renderer = new ElmRender();
                var bitmap = renderer.RenderToBitmap(templatePath, layout, personalInfo, false);

                if (bitmap == null)
                {
                    return BadRequest(new { error = renderer.ErrorMessage ?? "Unknown rendering error" });
                }

                // Save as PNG
                var outputPath = Path.Combine(outputDir, $"certificate-{DateTime.UtcNow:yyyyMMdd-HHmmss}.png");
                if (!ElmRender.SaveAsPng(bitmap, outputPath))
                {
                    return StatusCode(500, new { error = "Failed to save PNG" });
                }

                bitmap.Dispose();

                return Ok(new {
                    message = "Certificate generated successfully",
                    outputPath = outputPath,
                    amendments = request.Amendments.Count
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stack = ex.StackTrace });
            }
        }
    }
}
