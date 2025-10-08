using CertificateService.Core.Models;
using Swashbuckle.AspNetCore.Filters;

namespace CertificateService.Api.Swagger
{
    /// <summary>
    /// Swagger example: Valid QR code verification
    /// </summary>
    public class QrVerificationValidExample : IExamplesProvider<QrVerificationRequest>
    {
        public QrVerificationRequest GetExamples()
        {
            return new QrVerificationRequest
            {
                QrData = @"{""certificateNumber"":""2024/B/002890"",""certificateType"":""birth"",""child"":{""firstName"":""Alexander"",""surname"":""Thompson"",""dateOfBirth"":""20 Apr 2024""},""registrationDate"":""25 Apr 2024"",""timestamp"":1704067200,""signature"":""MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCg...""}"
            };
        }
    }

    /// <summary>
    /// Swagger example: Invalid QR code (tampered data)
    /// </summary>
    public class QrVerificationInvalidExample : IExamplesProvider<QrVerificationRequest>
    {
        public QrVerificationRequest GetExamples()
        {
            return new QrVerificationRequest
            {
                QrData = @"{""certificateNumber"":""2024/B/999999"",""certificateType"":""birth"",""child"":{""firstName"":""Fake"",""surname"":""Name"",""dateOfBirth"":""01 Jan 2000""},""registrationDate"":""01 Jan 2000"",""timestamp"":1704067200,""signature"":""InvalidSignature123""}"
            };
        }
    }
}
