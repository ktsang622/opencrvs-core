using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CertificateService.Core.Services
{
    /// <summary>
    /// Service for creating and verifying digital signatures using ECDSA.
    /// Signs certificate data to ensure authenticity and prevent tampering.
    /// Uses P-256 curve for compact signatures suitable for QR codes.
    /// </summary>
    public class DigitalSignatureService
    {
        private readonly ILogger<DigitalSignatureService> _logger;
        private readonly ECDsa _ecdsa;

        public DigitalSignatureService(ILogger<DigitalSignatureService> logger, string? privateKeyPem = null)
        {
            _logger = logger;
            _ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);

            // Load private key if provided, otherwise generate new key pair
            if (!string.IsNullOrEmpty(privateKeyPem))
            {
                try
                {
                    _ecdsa.ImportFromPem(privateKeyPem);
                    _logger.LogInformation("Loaded ECDSA private key from configuration");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to load ECDSA private key, generating new key pair");
                }
            }
            else
            {
                _logger.LogWarning("No ECDSA private key provided, using generated key pair (not suitable for production)");
            }
        }

        /// <summary>
        /// Sign data with ECDSA private key
        /// </summary>
        public string SignData(string data)
        {
            var dataBytes = Encoding.UTF8.GetBytes(data);
            var signature = _ecdsa.SignData(dataBytes, HashAlgorithmName.SHA256);
            return Convert.ToBase64String(signature);
        }

        /// <summary>
        /// Verify signature with ECDSA public key
        /// </summary>
        public bool VerifySignature(string data, string signatureBase64)
        {
            try
            {
                var dataBytes = Encoding.UTF8.GetBytes(data);
                var signatureBytes = Convert.FromBase64String(signatureBase64);
                return _ecdsa.VerifyData(dataBytes, signatureBytes, HashAlgorithmName.SHA256);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to verify signature");
                return false;
            }
        }

        /// <summary>
        /// Get public key in PEM format for distribution/verification
        /// </summary>
        public string GetPublicKeyPem()
        {
            return _ecdsa.ExportSubjectPublicKeyInfoPem();
        }

        /// <summary>
        /// Export private key in PEM format (for backup/configuration)
        /// WARNING: Keep this secure!
        /// </summary>
        public string ExportPrivateKeyPem()
        {
            return _ecdsa.ExportECPrivateKeyPem();
        }
    }
}
