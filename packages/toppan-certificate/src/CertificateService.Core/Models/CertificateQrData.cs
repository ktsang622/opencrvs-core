using System.Text.Json.Serialization;

namespace CertificateService.Core.Models
{
    /// <summary>
    /// Data structure for QR code embedded in certificates.
    /// Contains essential certificate information with digital signature for verification.
    /// </summary>
    public class CertificateQrData
    {
        [JsonPropertyName("certificateNumber")]
        public string CertificateNumber { get; set; } = string.Empty;

        [JsonPropertyName("certificateType")]
        public string CertificateType { get; set; } = string.Empty;

        [JsonPropertyName("child")]
        public QrPersonInfo? Child { get; set; }

        [JsonPropertyName("registrationDate")]
        public string? RegistrationDate { get; set; }

        [JsonPropertyName("recordUrl")]
        public string? RecordUrl { get; set; }

        [JsonPropertyName("signature")]
        public string Signature { get; set; } = string.Empty;

        [JsonPropertyName("timestamp")]
        public long Timestamp { get; set; }
    }

    /// <summary>
    /// Minimal person information for QR code
    /// </summary>
    public class QrPersonInfo
    {
        [JsonPropertyName("firstName")]
        public string? FirstName { get; set; }

        [JsonPropertyName("surname")]
        public string? Surname { get; set; }

        [JsonPropertyName("dateOfBirth")]
        public string? DateOfBirth { get; set; }
    }
}
