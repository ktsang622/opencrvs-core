using System.Collections;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using QRCoder;
using CertificateService.Core.Models;
using SkiaSharp;

namespace CertificateService.Core.Services
{
    /// <summary>
    /// Service for generating QR codes with signed certificate data.
    /// QR codes can be scanned to verify certificate authenticity.
    /// </summary>
    public class QrCodeService
    {
        private readonly ILogger<QrCodeService> _logger;
        private readonly DigitalSignatureService _signatureService;

        public QrCodeService(
            ILogger<QrCodeService> logger,
            DigitalSignatureService signatureService)
        {
            _logger = logger;
            _signatureService = signatureService;
        }

        /// <summary>
        /// Generate QR code PNG bytes from certificate data
        /// </summary>
        public byte[] GenerateQrCode(CertificateRequest request)
        {
            // Create QR data structure
            var qrData = new CertificateQrData
            {
                CertificateNumber = request.RegistrationNumber ?? "UNKNOWN",
                CertificateType = request.CertificateType,
                Child = request.Child != null ? new QrPersonInfo
                {
                    FirstName = request.Child.FirstName,
                    Surname = request.Child.Surname,
                    DateOfBirth = request.Child.DateOfBirth
                } : null,
                RegistrationDate = request.RegistrationDate,
                RecordUrl = request.RecordUrl,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            };

            // Create payload to sign (without signature field)
            var payloadForSigning = JsonSerializer.Serialize(new
            {
                certificateNumber = qrData.CertificateNumber,
                certificateType = qrData.CertificateType,
                child = qrData.Child,
                registrationDate = qrData.RegistrationDate,
                recordUrl = qrData.RecordUrl,
                timestamp = qrData.Timestamp,
                keyVersion = qrData.KeyVersion
            });

            // Sign the payload
            qrData.Signature = _signatureService.SignData(payloadForSigning);

            // Serialize full QR data including signature
            var qrJsonData = JsonSerializer.Serialize(qrData, new JsonSerializerOptions
            {
                WriteIndented = false
            });

            _logger.LogInformation("Generated QR data: {Length} bytes, Content: {Content}", qrJsonData.Length, qrJsonData);

            // Generate QR code bitmap using SkiaSharp (cross-platform)
            using var qrGenerator = new QRCodeGenerator();
            using var qrCodeData = qrGenerator.CreateQrCode(qrJsonData, QRCodeGenerator.ECCLevel.M);
            var qrBytes = RenderQrCodeToPng(qrCodeData, pixelsPerModule: 2);

            _logger.LogInformation("Generated QR code for certificate {CertNumber}: {Bytes} bytes",
                request.RegistrationNumber, qrBytes.Length);

            return qrBytes;
        }

        private byte[] RenderQrCodeToPng(QRCodeData qrCodeData, int pixelsPerModule)
        {
            var moduleMatrix = qrCodeData.ModuleMatrix;
            var moduleCount = moduleMatrix.Count;
            var imageSize = moduleCount * pixelsPerModule;

            using var bitmap = new SKBitmap(imageSize, imageSize, SKColorType.Rgba8888, SKAlphaType.Premul);
            using var canvas = new SKCanvas(bitmap);
            canvas.Clear(SKColors.White);

            using var paint = new SKPaint
            {
                Color = SKColors.Black,
                Style = SKPaintStyle.Fill,
                IsAntialias = false
            };

            for (var y = 0; y < moduleCount; y++)
            {
                var rowObject = moduleMatrix[y];
                if (rowObject == null) continue;

                // Handle BitArray specifically (most common case from QRCoder)
                if (rowObject is BitArray bitArray)
                {
                    RenderBitArrayRow(canvas, paint, bitArray, y, pixelsPerModule);
                }
                // Handle generic IEnumerable types (arrays, lists, etc)
                else if (rowObject is IEnumerable enumerableRow)
                {
                    RenderEnumerableRow(canvas, paint, enumerableRow, y, pixelsPerModule);
                }
            }

            using var image = SKImage.FromBitmap(bitmap);
            using var data = image.Encode(SKEncodedImageFormat.Png, 100);
            return data.ToArray();
        }

        private static void RenderBitArrayRow(SKCanvas canvas, SKPaint paint, BitArray bitArray, int y, int pixelsPerModule)
        {
            for (var x = 0; x < bitArray.Count; x++)
            {
                if (bitArray[x])
                {
                    var rect = new SKRect(
                        x * pixelsPerModule,
                        y * pixelsPerModule,
                        (x + 1) * pixelsPerModule,
                        (y + 1) * pixelsPerModule);
                    canvas.DrawRect(rect, paint);
                }
            }
        }

        private static void RenderEnumerableRow(SKCanvas canvas, SKPaint paint, IEnumerable enumerableRow, int y, int pixelsPerModule)
        {
            var x = 0;
            foreach (var moduleValue in enumerableRow)
            {
                if (IsDarkModule(moduleValue))
                {
                    var rect = new SKRect(
                        x * pixelsPerModule,
                        y * pixelsPerModule,
                        (x + 1) * pixelsPerModule,
                        (y + 1) * pixelsPerModule);
                    canvas.DrawRect(rect, paint);
                }
                x++;
            }
        }

        private static bool IsDarkModule(object? moduleValue)
        {
            if (moduleValue == null) return false;

            return moduleValue switch
            {
                bool b => b,
                sbyte sb => sb != 0,
                byte b8 => b8 != 0,
                int i => i != 0,
                _ => false
            };
        }

        /// <summary>
        /// Verify QR code data signature
        /// </summary>
        public bool VerifyQrCode(string qrJsonData)
        {
            try
            {
                var qrData = JsonSerializer.Deserialize<CertificateQrData>(qrJsonData);
                if (qrData == null)
                    return false;

                // Reconstruct payload that was signed
                var payloadForVerification = JsonSerializer.Serialize(new
                {
                    certificateNumber = qrData.CertificateNumber,
                    certificateType = qrData.CertificateType,
                    child = qrData.Child,
                    registrationDate = qrData.RegistrationDate,
                    recordUrl = qrData.RecordUrl,
                    timestamp = qrData.Timestamp
                });

                return _signatureService.VerifySignature(payloadForVerification, qrData.Signature);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to verify QR code");
                return false;
            }
        }

        /// <summary>
        /// Verify QR code and return detailed response
        /// </summary>
        public QrVerificationResponse VerifyQrCodeDetailed(string qrJsonData)
        {
            try
            {
                var qrData = JsonSerializer.Deserialize<CertificateQrData>(qrJsonData);
                if (qrData == null)
                {
                    return new QrVerificationResponse
                    {
                        Valid = false,
                        Error = "Invalid QR data format"
                    };
                }

                // Reconstruct payload that was signed
                var payloadForVerification = JsonSerializer.Serialize(new
                {
                    certificateNumber = qrData.CertificateNumber,
                    certificateType = qrData.CertificateType,
                    child = qrData.Child,
                    registrationDate = qrData.RegistrationDate,
                    recordUrl = qrData.RecordUrl,
                    timestamp = qrData.Timestamp
                });

                bool isValid = _signatureService.VerifySignature(payloadForVerification, qrData.Signature);

                var response = new QrVerificationResponse
                {
                    Valid = isValid,
                    CertificateNumber = qrData.CertificateNumber,
                    CertificateType = qrData.CertificateType,
                    Child = qrData.Child,
                    RegistrationDate = qrData.RegistrationDate,
                    Timestamp = qrData.Timestamp,
                    TimestampReadable = DateTimeOffset.FromUnixTimeSeconds(qrData.Timestamp).ToString("yyyy-MM-dd HH:mm:ss UTC")
                };

                if (!isValid)
                {
                    response.Error = "Digital signature verification failed - certificate may be tampered or forged";
                }

                return response;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to verify QR code");
                return new QrVerificationResponse
                {
                    Valid = false,
                    Error = $"Verification error: {ex.Message}"
                };
            }
        }
    }
}
