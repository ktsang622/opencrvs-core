using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using CertificateService.Api.Configuration;
using CertificateService.Api.Swagger;
using CertificateService.Core.Models;
using CertificateService.Core.Template;
using CertificateService.Core.Rendering;
using CertificateService.Core.Services;
using System.Diagnostics;
using SkiaSharp;
using Swashbuckle.AspNetCore.Filters;

namespace CertificateService.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CertificatesController : ControllerBase
    {
        private readonly CertificateServiceOptions _options;
        private readonly ILogger<CertificatesController> _logger;
        private readonly AmendmentProcessor _amendmentProcessor;
        private readonly PdfGeneratorSkiaSharp _pdfGenerator;
        private readonly QrCodeService? _qrCodeService;
        private readonly PdfSigningService? _pdfSigningService;

        public CertificatesController(
            IOptions<CertificateServiceOptions> options,
            ILogger<CertificatesController> logger,
            QrCodeService? qrCodeService = null,
            PdfSigningService? pdfSigningService = null)
        {
            _options = options.Value;
            _logger = logger;
            _amendmentProcessor = new AmendmentProcessor();
            _pdfGenerator = new PdfGeneratorSkiaSharp();
            _qrCodeService = qrCodeService;
            _pdfSigningService = pdfSigningService;
        }

        /// <summary>
        /// Generate a certificate PDF with amendment history
        /// </summary>
        /// <param name="request">Certificate data including amendments</param>
        /// <returns>PDF file</returns>
        [HttpPost("generate")]
        [ProducesResponseType(typeof(FileContentResult), 200)]
        [ProducesResponseType(typeof(ErrorResponse), 400)]
        [ProducesResponseType(typeof(ErrorResponse), 500)]
        public IActionResult Generate([FromBody] CertificateRequest request)
        {
            var stopwatch = Stopwatch.StartNew();

            try
            {
                _logger.LogInformation("Generating {Type} certificate with template {Template}, {AmendmentCount} amendments",
                    request.CertificateType, request.TemplateName, request.Amendments.Count);

                // 1. Validate request
                var validationResult = ValidateRequest(request);
                if (!validationResult.IsValid)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "ValidationError",
                        Message = validationResult.ErrorMessage!,
                        Details = new { validationErrors = validationResult.Errors }
                    });
                }

                // 2. Convert request to PersonalInfo
                var personalInfo = ConvertRequestToPersonalInfo(request);

                // 3. Process amendments
                if (request.Amendments.Any())
                {
                    var amendments = request.Amendments.Select(a => a.ToAmendment()).ToList();

                    var (isValid, errors) = _amendmentProcessor.ValidateAmendments(amendments, request.CertificateType);
                    if (!isValid)
                    {
                        return BadRequest(new ErrorResponse
                        {
                            Error = "AmendmentValidationError",
                            Message = "Invalid amendments",
                            Details = new { errors }
                        });
                    }

                    _amendmentProcessor.ProcessAmendments(personalInfo, amendments);
                }

                // 4. Get template configuration
                var templateKey = GetTemplateKey(request.CertificateType);
                if (!_options.Templates.ContainsKey(templateKey))
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "TemplateNotFound",
                        Message = $"Template '{templateKey}' not configured"
                    });
                }

                var templateConfig = _options.Templates[templateKey];
                var templatePath = templateConfig.GetTemplatePath(_options.TemplatesPath);
                var layoutPath = templateConfig.GetLayoutFilePath(_options.TemplatesPath);

                // 5. Load and parse template
                var layout = new ElmLayout();
                var loadResult = layout.LoadFromFile(layoutPath);
                if (loadResult != 0)
                {
                    return StatusCode(500, new ErrorResponse
                    {
                        Error = "TemplateLoadError",
                        Message = $"Failed to load template: {layout.LoadErrorMessage}",
                        Details = new {
                            lineNumber = layout.LoadErrorLineNumber
                        }
                    });
                }

                // 6. Render to bitmaps
                var renderer = new ElmRender();

                // Render front page
                var frontBitmap = renderer.RenderToBitmap(templatePath, layout, personalInfo, renderBackSide: false);
                if (frontBitmap == null)
                {
                    return StatusCode(500, new ErrorResponse
                    {
                        Error = "RenderError",
                        Message = $"Failed to render front page: {renderer.ErrorMessage}"
                    });
                }

                // Render back page (if amendments > 5)
                SKBitmap? backBitmap = null;
                bool shouldRenderBack = request.Amendments.Count > 5;
                _logger.LogInformation("Checking if back page should be rendered: amendments={Count}, shouldRenderBack={ShouldRenderBack}",
                    request.Amendments.Count, shouldRenderBack);
                if (shouldRenderBack && layout.RenderBack)
                {
                    _logger.LogInformation("Rendering back page...");
                    backBitmap = renderer.RenderToBitmap(templatePath, layout, personalInfo, renderBackSide: true);
                    _logger.LogInformation("Back page rendered: {Success}", backBitmap != null);
                }

                // 7. Generate PDF
                var pdfBytes = _pdfGenerator.GeneratePdf(
                    frontBitmap,
                    backBitmap,
                    new PdfMetadata
                    {
                        Title = $"{request.CertificateType} Certificate - {request.RegistrationNumber}",
                        Subject = $"{request.CertificateType} Certificate",
                        DPI = _options.PdfSettings.DefaultDpi
                    });

                // 8. Digitally sign the PDF with ECDSA
                if (_pdfSigningService != null)
                {
                    pdfBytes = _pdfSigningService.SignPdf(
                        pdfBytes,
                        signerName: "Chief Registrar",
                        reason: $"{request.CertificateType.ToUpper()} Certificate Issuance");
                    _logger.LogInformation("PDF digitally signed with ECDSA");
                }

                stopwatch.Stop();
                _logger.LogInformation("Certificate generated in {ElapsedMs}ms, PDF size: {SizeKB}KB, Pages: {PageCount}",
                    stopwatch.ElapsedMilliseconds,
                    pdfBytes.Length / 1024,
                    backBitmap != null ? 2 : 1);

                // 8. Save to test-output if in debug mode, otherwise prepare base64 response
                var certNumber = request.RegistrationNumber ?? DateTime.UtcNow.Ticks.ToString();
                var sanitizedCertNumber = certNumber.Replace("/", "-").Replace("\\", "-");
                var pdfFilename = $"{request.CertificateType.ToLower()}-certificate-{sanitizedCertNumber}.pdf";

                var savedFiles = new List<string>();

                // Debug mode: Save files to disk
                if (_options.DebugMode && _options.RetainGeneratedFiles)
                {
                    var folderName = sanitizedCertNumber;
                    var outputDir = Path.Combine(_options.OutputPath, folderName);
                    Directory.CreateDirectory(outputDir);

                    // Save files based on enabled formats
                    foreach (var format in _options.OutputFormats.Enabled)
                    {
                        switch (format.ToUpper())
                        {
                            case "PDF":
                                var pdfPath = Path.Combine(outputDir, pdfFilename);
                                System.IO.File.WriteAllBytes(pdfPath, pdfBytes);
                                savedFiles.Add(pdfPath);
                                break;

                            case "JPG":
                                var jpgFilename = $"{request.CertificateType.ToLower()}-certificate-{sanitizedCertNumber}.jpg";
                                var jpgPath = Path.Combine(outputDir, jpgFilename);
                                var jpgQuality = _options.OutputFormats.Viewing.Quality;
                                using (var image = SKImage.FromBitmap(frontBitmap))
                                using (var data = image.Encode(SKEncodedImageFormat.Jpeg, jpgQuality))
                                using (var stream = System.IO.File.OpenWrite(jpgPath))
                                {
                                    data.SaveTo(stream);
                                }
                                savedFiles.Add(jpgPath);
                                break;

                            case "PNG":
                                var pngFilename = $"{request.CertificateType.ToLower()}-certificate-{sanitizedCertNumber}.png";
                                var pngPath = Path.Combine(outputDir, pngFilename);
                                using (var image = SKImage.FromBitmap(frontBitmap))
                                using (var data = image.Encode(SKEncodedImageFormat.Png, 100))
                                using (var stream = System.IO.File.OpenWrite(pngPath))
                                {
                                    data.SaveTo(stream);
                                }
                                savedFiles.Add(pngPath);
                                break;
                        }
                    }

                    _logger.LogInformation("Certificate saved: {Files}", string.Join(", ", savedFiles));
                    Response.Headers["X-Output-Files"] = string.Join(";", savedFiles);
                }

                // 9. Generate JPG bytes for base64 response
                byte[] jpgBytes;
                using (var image = SKImage.FromBitmap(frontBitmap))
                using (var data = image.Encode(SKEncodedImageFormat.Jpeg, _options.OutputFormats.Viewing.Quality))
                {
                    jpgBytes = data.ToArray();
                }

                // 10. Cleanup
                frontBitmap.Dispose();
                backBitmap?.Dispose();

                // 11. Return JSON with base64 data (both debug and production modes)
                return Ok(new
                {
                    success = true,
                    certificateNumber = request.RegistrationNumber,
                    pages = backBitmap != null ? 2 : 1,
                    amendments = request.Amendments.Count,
                    generationTimeMs = stopwatch.ElapsedMilliseconds,
                    debugMode = _options.DebugMode,
                    savedFiles = savedFiles.Count > 0 ? savedFiles : null,
                    pdf = new
                    {
                        filename = pdfFilename,
                        contentType = "application/pdf",
                        sizeBytes = pdfBytes.Length,
                        base64 = Convert.ToBase64String(pdfBytes)
                    },
                    jpg = new
                    {
                        filename = pdfFilename.Replace(".pdf", ".jpg"),
                        contentType = "image/jpeg",
                        sizeBytes = jpgBytes.Length,
                        base64 = Convert.ToBase64String(jpgBytes)
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate certificate");
                return StatusCode(500, new ErrorResponse
                {
                    Error = "InternalError",
                    Message = "An error occurred while generating the certificate",
                    Details = new { exception = ex.Message }
                });
            }
        }

        private (bool IsValid, string? ErrorMessage, List<string>? Errors) ValidateRequest(CertificateRequest request)
        {
            var errors = new List<string>();

            if (string.IsNullOrEmpty(request.CertificateType))
                errors.Add("certificateType is required");

            if (string.IsNullOrEmpty(request.TemplateName))
                errors.Add("templateName is required");

            // Certificate-specific validation
            if (request.CertificateType?.ToLower() == "birth" && request.Child == null)
                errors.Add("child section is required for birth certificates");

            if (request.CertificateType?.ToLower() == "death" && request.Deceased == null)
                errors.Add("deceased section is required for death certificates");

            if (request.Amendments.Count > _options.MaxAmendments)
                errors.Add($"Too many amendments (max {_options.MaxAmendments})");

            if (errors.Any())
                return (false, string.Join("; ", errors), errors);

            return (true, null, null);
        }

        private PersonalInfo ConvertRequestToPersonalInfo(CertificateRequest request)
        {
            var personalInfo = new PersonalInfo();

            // Add child data
            if (request.Child != null)
            {
                AddPersonSection(personalInfo, "Child", request.Child);
            }

            // Add mother data
            if (request.Mother != null)
            {
                AddPersonSection(personalInfo, "Mother", request.Mother);
            }
            else if (request.CertificateType?.ToLower() == "birth")
            {
                personalInfo.AddScalar("MotherUnknown", "x x x x x");
            }

            // Add father data
            if (request.Father != null)
            {
                AddPersonSection(personalInfo, "Father", request.Father);
            }
            else if (request.CertificateType?.ToLower() == "birth")
            {
                personalInfo.AddScalar("FatherUnknown", "x x x x x");
            }

            // Add deceased data (for death certificates)
            if (request.Deceased != null)
            {
                AddPersonSection(personalInfo, "Deceased", request.Deceased);
            }

            // Add informant data
            if (request.Informant != null)
            {
                var informantNameParts = new List<string>();
                if (!string.IsNullOrWhiteSpace(request.Informant.FirstName))
                    informantNameParts.Add(request.Informant.FirstName.Trim());
                if (!string.IsNullOrWhiteSpace(request.Informant.MiddleName))
                    informantNameParts.Add(request.Informant.MiddleName.Trim());
                if (!string.IsNullOrWhiteSpace(request.Informant.Surname))
                    informantNameParts.Add(request.Informant.Surname.Trim());
                if (!string.IsNullOrWhiteSpace(request.Informant.Suffix))
                    informantNameParts.Add(request.Informant.Suffix.Trim());

                if (informantNameParts.Any())
                    personalInfo.AddScalar("InformantName", string.Join(" ", informantNameParts));

                if (!string.IsNullOrEmpty(request.Informant.DateOfBirth))
                    personalInfo.AddScalar("InformantDateOfBirth", request.Informant.DateOfBirth);

                if (!string.IsNullOrEmpty(request.Informant.Relationship))
                    personalInfo.AddScalar("InformantRelationship", request.Informant.Relationship);

                var informantProfession = !string.IsNullOrWhiteSpace(request.Informant.Profession)
                    ? request.Informant.Profession
                    : request.Informant.Occupation;
                if (!string.IsNullOrWhiteSpace(informantProfession))
                    personalInfo.AddScalar("InformantProfession", informantProfession.Trim());

                // Combine address into one line
                var addressParts = new List<string>();
                if (!string.IsNullOrEmpty(request.Informant.AddressOne))
                    addressParts.Add(request.Informant.AddressOne);
                if (!string.IsNullOrEmpty(request.Informant.AddressTwo))
                    addressParts.Add(request.Informant.AddressTwo);

                if (addressParts.Any())
                    personalInfo.AddScalar("InformantAddress", string.Join(", ", addressParts));
            }

            // Add metadata
            if (!string.IsNullOrEmpty(request.RegistrationNumber))
                personalInfo.AddScalar("RegistrationNumber", request.RegistrationNumber);

            if (!string.IsNullOrEmpty(request.RegistrationDate))
                personalInfo.AddScalar("RegistrationDate", request.RegistrationDate);

            if (!string.IsNullOrEmpty(request.Registrar))
                personalInfo.AddScalar("Registrar", request.Registrar);

            if (!string.IsNullOrEmpty(request.Parish))
            {
                personalInfo.AddScalar("Parish", request.Parish);
                _logger.LogInformation("Added Parish field: {Parish}", request.Parish);
            }
            else
            {
                _logger.LogWarning("Parish field is empty or null");
            }

            // Add sex indicators (for checkboxes)
            if (request.Child?.Sex?.ToLower() == "male")
            {
                personalInfo.AddScalar("m", "x");
                personalInfo.AddScalar("f", "");
            }
            else if (request.Child?.Sex?.ToLower() == "female")
            {
                personalInfo.AddScalar("f", "x");
                personalInfo.AddScalar("m", "");
            }

            // Add late registration indicators (for checkboxes)
            if (request.LateRegistration.HasValue)
            {
                if (request.LateRegistration.Value)
                {
                    personalInfo.AddScalar("LateRegistrationYes", "x");
                    personalInfo.AddScalar("LateRegistrationNo", "");
                }
                else
                {
                    personalInfo.AddScalar("LateRegistrationYes", "");
                    personalInfo.AddScalar("LateRegistrationNo", "x");
                }
            }

            // Generate QR code with signed certificate data
            if (_qrCodeService != null)
            {
                try
                {
                    var qrBytes = _qrCodeService.GenerateQrCode(request);
                    personalInfo.AddImage("QrCode", qrBytes);
                    _logger.LogInformation("Generated QR code for certificate {CertNumber}", request.RegistrationNumber);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to generate QR code for certificate {CertNumber}", request.RegistrationNumber);
                }
            }

            // Add signature file from configured path
            if (!string.IsNullOrEmpty(_options.SignatureFilePath) && System.IO.File.Exists(_options.SignatureFilePath))
            {
                try
                {
                    var signatureBytes = System.IO.File.ReadAllBytes(_options.SignatureFilePath);
                    personalInfo.AddImage("SignatureFile", signatureBytes);
                    _logger.LogDebug("Added signature file from {Path}", _options.SignatureFilePath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load signature file from {Path}", _options.SignatureFilePath);
                }
            }
            else
            {
                _logger.LogDebug("Signature file not configured or not found at {Path}", _options.SignatureFilePath);
            }

            // Add generation date
            var generationDate = DateTime.UtcNow.ToString("dd MMM yyyy HH:mm UTC");
            personalInfo.AddScalar("GenerationDate", generationDate);

            // Add additional fields
            if (request.AdditionalFields != null)
            {
                foreach (var field in request.AdditionalFields)
                {
                    personalInfo.AddScalar(field.Key, field.Value);
                }
            }

            return personalInfo;
        }

        private void AddPersonSection(PersonalInfo personalInfo, string section, PersonSection person)
        {
            if (!string.IsNullOrEmpty(person.FirstName))
                personalInfo.AddScalar($"{section}FirstName", person.FirstName);

            if (!string.IsNullOrEmpty(person.MiddleName))
                personalInfo.AddScalar($"{section}MiddleName", person.MiddleName);

            if (!string.IsNullOrEmpty(person.Surname))
                personalInfo.AddScalar($"{section}Surname", person.Surname);

            if (!string.IsNullOrEmpty(person.Suffix))
                personalInfo.AddScalar($"{section}Suffix", person.Suffix);

            if (!string.IsNullOrEmpty(person.MaidenName))
                personalInfo.AddScalar($"{section}MaidenName", person.MaidenName);

            if (!string.IsNullOrEmpty(person.DateOfBirth))
                personalInfo.AddScalar($"{section}DateOfBirth", person.DateOfBirth);

            if (!string.IsNullOrEmpty(person.PlaceOfBirth))
                personalInfo.AddScalar($"{section}PlaceOfBirth", person.PlaceOfBirth);

            if (!string.IsNullOrEmpty(person.Sex))
                personalInfo.AddScalar($"{section}Sex", person.Sex);

            if (!string.IsNullOrEmpty(person.Occupation))
                personalInfo.AddScalar($"{section}Occupation", person.Occupation);

            if (!string.IsNullOrEmpty(person.AddressOne))
                personalInfo.AddScalar($"{section}AddressOne", person.AddressOne);

            if (!string.IsNullOrEmpty(person.AddressTwo))
                personalInfo.AddScalar($"{section}AddressTwo", person.AddressTwo);

            if (!string.IsNullOrEmpty(person.CountryOfBirth))
                personalInfo.AddScalar($"{section}CountryOfBirth", person.CountryOfBirth);

            if (!string.IsNullOrEmpty(person.Nationality))
                personalInfo.AddScalar($"{section}Nationality", person.Nationality);
        }

        private string GetTemplateKey(string certificateType)
        {
            return certificateType switch
            {
                "birth" => "Birth",
                "death" => "Death",
                "marriage" => "Marriage",
                _ => certificateType
            };
        }

        /// <summary>
        /// Verify a certificate QR code signature
        /// </summary>
        /// <remarks>
        /// Verifies the digital signature of a scanned certificate QR code.
        /// Returns certificate details if valid, or error message if invalid/tampered.
        /// </remarks>
        /// <param name="request">QR code JSON data from scanned certificate</param>
        /// <returns>Verification result with certificate details</returns>
        [HttpPost("verify")]
        [ProducesResponseType(typeof(QrVerificationResponse), 200)]
        [ProducesResponseType(typeof(ErrorResponse), 400)]
        public ActionResult<QrVerificationResponse> VerifyQrCode([FromBody] QrVerificationRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.QrData))
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "InvalidRequest",
                        Message = "QR data cannot be empty"
                    });
                }

                if (_qrCodeService == null)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "ServiceUnavailable",
                        Message = "QR verification service is not configured"
                    });
                }

                _logger.LogInformation("Verifying QR code ({Length} bytes)", request.QrData.Length);

                var result = _qrCodeService.VerifyQrCodeDetailed(request.QrData);

                if (result.Valid)
                {
                    _logger.LogInformation("QR code verified successfully for certificate {CertNumber}",
                        result.CertificateNumber);
                }
                else
                {
                    _logger.LogWarning("QR code verification failed: {Error}", result.Error);
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during QR code verification");
                return BadRequest(new ErrorResponse
                {
                    Error = "VerificationFailed",
                    Message = "Failed to verify QR code",
                    Details = ex.Message
                });
            }
        }

        /// <summary>
        /// Verify PDF digital signature
        /// </summary>
        /// <param name="file">PDF file to verify</param>
        /// <returns>Verification result</returns>
        [HttpPost("verify-pdf")]
        [ProducesResponseType(typeof(PdfVerificationResponse), 200)]
        [ProducesResponseType(typeof(ErrorResponse), 400)]
        public async Task<ActionResult<PdfVerificationResponse>> VerifyPdf(IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "InvalidRequest",
                        Message = "PDF file is required"
                    });
                }

                if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "InvalidRequest",
                        Message = "File must be a PDF"
                    });
                }

                if (_pdfSigningService == null)
                {
                    return BadRequest(new ErrorResponse
                    {
                        Error = "ServiceUnavailable",
                        Message = "PDF verification service is not configured"
                    });
                }

                _logger.LogInformation("Verifying PDF signature for file: {FileName} ({Size} bytes)",
                    file.FileName, file.Length);

                // Read PDF bytes
                byte[] pdfBytes;
                using (var ms = new MemoryStream())
                {
                    await file.CopyToAsync(ms);
                    pdfBytes = ms.ToArray();
                }

                // Verify signature
                var isValid = _pdfSigningService.VerifyPdfSignature(pdfBytes);

                _logger.LogInformation("PDF signature verification result: {Result}",
                    isValid ? "Valid" : "Invalid");

                return Ok(new PdfVerificationResponse
                {
                    Valid = isValid,
                    FileName = file.FileName,
                    FileSize = file.Length,
                    Message = isValid
                        ? "PDF signature is valid. Document has not been tampered."
                        : "PDF signature is invalid or missing. Document may have been tampered with."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during PDF verification");
                return BadRequest(new ErrorResponse
                {
                    Error = "VerificationFailed",
                    Message = "Failed to verify PDF",
                    Details = ex.Message
                });
            }
        }
    }

    /// <summary>
    /// PDF verification response
    /// </summary>
    public class PdfVerificationResponse
    {
        public bool Valid { get; set; }
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    /// <summary>
    /// Error response model
    /// </summary>
    public class ErrorResponse
    {
        public string Error { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public object? Details { get; set; }
    }
}
