using System.Text.Json.Serialization;

namespace CertificateService.Core.Models
{
    /// <summary>
    /// Request to verify a certificate QR code
    /// </summary>
    public class QrVerificationRequest
    {
        [JsonPropertyName("qrData")]
        public string QrData { get; set; } = string.Empty;
    }

    /// <summary>
    /// Response from QR code verification
    /// </summary>
    public class QrVerificationResponse
    {
        [JsonPropertyName("valid")]
        public bool Valid { get; set; }

        [JsonPropertyName("certificateNumber")]
        public string? CertificateNumber { get; set; }

        [JsonPropertyName("certificateType")]
        public string? CertificateType { get; set; }

        [JsonPropertyName("child")]
        public QrPersonInfo? Child { get; set; }

        [JsonPropertyName("registrationDate")]
        public string? RegistrationDate { get; set; }

        [JsonPropertyName("timestamp")]
        public long? Timestamp { get; set; }

        [JsonPropertyName("timestampReadable")]
        public string? TimestampReadable { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
