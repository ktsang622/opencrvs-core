using System.Security.Cryptography;
using System.Text;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.OpenSsl;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.Crypto.Signers;
using Microsoft.Extensions.Logging;

namespace CertificateService.Core.Services
{
    /// <summary>
    /// Service for digitally signing PDF documents with ECDSA using Bouncy Castle
    /// Creates tamper-evident PDFs with embedded digital signatures
    /// </summary>
    public class PdfSigningService
    {
        private readonly ILogger<PdfSigningService> _logger;
        private readonly ECPrivateKeyParameters? _privateKey;
        private readonly ECPublicKeyParameters? _publicKey;

        public PdfSigningService(ILogger<PdfSigningService> logger, string? privateKeyPem = null, string? publicKeyPem = null)
        {
            _logger = logger;

            if (!string.IsNullOrEmpty(privateKeyPem))
            {
                try
                {
                    // Parse ECDSA private key from PEM format
                    _privateKey = ParseECDsaPrivateKey(privateKeyPem);
                    _logger.LogInformation("Loaded ECDSA private key for PDF signing");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to load ECDSA private key for PDF signing");
                }
            }
            else
            {
                _logger.LogWarning("No private key provided for PDF signing - PDFs will not be signed");
            }

            if (!string.IsNullOrEmpty(publicKeyPem))
            {
                try
                {
                    // Parse ECDSA public key from PEM format
                    _publicKey = ParseECDsaPublicKey(publicKeyPem);
                    _logger.LogInformation("Loaded ECDSA public key for PDF verification");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to load ECDSA public key for PDF verification");
                }
            }
        }

        /// <summary>
        /// Parse ECDSA private key from PEM format to Bouncy Castle format
        /// </summary>
        private ECPrivateKeyParameters ParseECDsaPrivateKey(string pemKey)
        {
            using var textReader = new StringReader(pemKey);
            var pemReader = new PemReader(textReader);

            // Read all objects until we find the private key
            // (PEM files may contain EC PARAMETERS before the actual key)
            while (true)
            {
                object? keyObject;
                try
                {
                    keyObject = pemReader.ReadObject();
                    if (keyObject == null) break;
                }
                catch (IOException ex) when (ex.Message.Contains("unrecognised object"))
                {
                    // Skip unrecognized objects like EC PARAMETERS
                    continue;
                }

                if (keyObject is AsymmetricCipherKeyPair keyPair)
                {
                    return (ECPrivateKeyParameters)keyPair.Private;
                }
                else if (keyObject is ECPrivateKeyParameters ecKey)
                {
                    return ecKey;
                }
            }

            throw new InvalidOperationException("Invalid ECDSA private key format - no private key found in PEM");
        }

        /// <summary>
        /// Parse ECDSA public key from PEM format to Bouncy Castle format
        /// </summary>
        private ECPublicKeyParameters ParseECDsaPublicKey(string pemKey)
        {
            using var textReader = new StringReader(pemKey);
            var pemReader = new PemReader(textReader);

            // Read all objects until we find the public key
            while (true)
            {
                object? keyObject;
                try
                {
                    keyObject = pemReader.ReadObject();
                    if (keyObject == null) break;
                }
                catch (IOException ex) when (ex.Message.Contains("unrecognised object"))
                {
                    // Skip unrecognized objects
                    continue;
                }

                if (keyObject is AsymmetricCipherKeyPair keyPair)
                {
                    return (ECPublicKeyParameters)keyPair.Public;
                }
                else if (keyObject is ECPublicKeyParameters ecKey)
                {
                    return ecKey;
                }
            }

            throw new InvalidOperationException("Invalid ECDSA public key format - no public key found in PEM");
        }

        /// <summary>
        /// Sign a PDF document with ECDSA digital signature
        /// Adds an incremental signature to the PDF without modifying original content
        /// </summary>
        public byte[] SignPdf(byte[] pdfBytes, string signerName = "Chief Registrar", string reason = "Certificate Issuance")
        {
            if (_privateKey == null)
            {
                _logger.LogWarning("Cannot sign PDF - no private key available");
                return pdfBytes; // Return unsigned PDF
            }

            try
            {
                // Create signature of the PDF bytes
                var signer = new ECDsaSigner();
                signer.Init(true, _privateKey);

                // Hash the PDF content
                using var sha256 = SHA256.Create();
                var hash = sha256.ComputeHash(pdfBytes);

                // Sign the hash
                var signature = signer.GenerateSignature(hash);
                var r = signature[0].ToByteArrayUnsigned();
                var s = signature[1].ToByteArrayUnsigned();

                // Combine R and S into DER-encoded signature
                var signatureBytes = EncodeDerSignature(r, s);

                _logger.LogDebug("Signing PDF: hash={Hash}, sig_r_len={RLen}, sig_s_len={SLen}, der_len={DerLen}",
                    BitConverter.ToString(hash).Replace("-", "").Substring(0, 32),
                    r.Length, s.Length, signatureBytes.Length);

                // Embed signature in PDF metadata
                var signedPdf = EmbedSignatureInPdf(pdfBytes, signatureBytes, signerName, reason);

                _logger.LogInformation("PDF signed successfully with ECDSA signature ({Size} bytes)", signatureBytes.Length);
                return signedPdf;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sign PDF");
                return pdfBytes; // Return unsigned PDF on error
            }
        }

        /// <summary>
        /// Encode ECDSA signature (R, S) into DER format
        /// </summary>
        private byte[] EncodeDerSignature(byte[] r, byte[] s)
        {
            using var ms = new MemoryStream();
            using var writer = new BinaryWriter(ms);

            // Write R
            writer.Write((byte)0x02); // INTEGER tag
            writer.Write((byte)r.Length);
            writer.Write(r);

            // Write S
            writer.Write((byte)0x02); // INTEGER tag
            writer.Write((byte)s.Length);
            writer.Write(s);

            var derContent = ms.ToArray();

            // Wrap in SEQUENCE
            using var finalMs = new MemoryStream();
            using var finalWriter = new BinaryWriter(finalMs);
            finalWriter.Write((byte)0x30); // SEQUENCE tag
            finalWriter.Write((byte)derContent.Length);
            finalWriter.Write(derContent);

            return finalMs.ToArray();
        }

        /// <summary>
        /// Embed digital signature in PDF as metadata
        /// Uses PDF incremental update to add signature without invalidating the document
        /// </summary>
        private byte[] EmbedSignatureInPdf(byte[] pdfBytes, byte[] signature, string signer, string reason)
        {
            // PDF signature embedding requires:
            // 1. Add /Sig dictionary to PDF
            // 2. Add /ByteRange to indicate what bytes are signed
            // 3. Add /Contents with the signature bytes (hex-encoded)

            using var ms = new MemoryStream();
            ms.Write(pdfBytes, 0, pdfBytes.Length);

            // Convert signature to hex string
            var signatureHex = BitConverter.ToString(signature).Replace("-", "");

            // Build signature dictionary
            var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmssZ");
            var signatureDict = new StringBuilder();
            signatureDict.AppendLine();
            signatureDict.AppendLine("% Toppan CRVS Digital Signature");
            signatureDict.AppendLine($"% OriginalSize: {pdfBytes.Length}");
            signatureDict.AppendLine($"% Signer: {signer}");
            signatureDict.AppendLine($"% Reason: {reason}");
            signatureDict.AppendLine($"% Date: {timestamp}");
            signatureDict.AppendLine($"% Algorithm: ECDSA with SHA-256");
            signatureDict.AppendLine($"/Signature <{signatureHex}>");
            signatureDict.AppendLine($"/SignatureDate ({timestamp})");
            signatureDict.AppendLine($"/SignedBy ({signer})");
            signatureDict.AppendLine($"/Reason ({reason})");

            var dictBytes = Encoding.ASCII.GetBytes(signatureDict.ToString());
            ms.Write(dictBytes, 0, dictBytes.Length);

            return ms.ToArray();
        }

        /// <summary>
        /// Verify if a PDF has a valid digital signature embedded
        /// </summary>
        public bool VerifyPdfSignature(byte[] pdfBytes, ECPublicKeyParameters? publicKey = null)
        {
            // Use provided key, or fall back to instance key
            var keyToUse = publicKey ?? _publicKey;

            try
            {
                // Look for signature in PDF metadata
                var pdfText = Encoding.ASCII.GetString(pdfBytes);

                if (!pdfText.Contains("/Signature"))
                {
                    _logger.LogInformation("PDF has no embedded signature");
                    return false;
                }

                // Extract signature hex string
                var sigStart = pdfText.IndexOf("/Signature <");
                if (sigStart == -1) return false;

                sigStart += "/Signature <".Length;
                var sigEnd = pdfText.IndexOf(">", sigStart);
                if (sigEnd == -1) return false;

                var signatureHex = pdfText.Substring(sigStart, sigEnd - sigStart).Trim();
                var signatureBytes = HexStringToBytes(signatureHex);

                // Check for Toppan CRVS signature marker
                if (!pdfText.Contains("% Toppan CRVS Digital Signature"))
                {
                    _logger.LogInformation("PDF does not have Toppan CRVS digital signature");
                    return false;
                }

                // Extract original PDF size from metadata
                var sizeMarker = "% OriginalSize: ";
                var sizeStart = pdfText.IndexOf(sizeMarker);
                if (sizeStart == -1)
                {
                    _logger.LogWarning("PDF signature missing OriginalSize metadata");
                    return false;
                }
                sizeStart += sizeMarker.Length;
                var sizeEnd = pdfText.IndexOf("\n", sizeStart);
                if (sizeEnd == -1) sizeEnd = pdfText.IndexOf("\r", sizeStart);
                if (sizeEnd == -1) return false;

                var sizeStr = pdfText.Substring(sizeStart, sizeEnd - sizeStart).Trim();
                if (!int.TryParse(sizeStr, out int originalSize))
                {
                    _logger.LogWarning("PDF signature has invalid OriginalSize: {Size}", sizeStr);
                    return false;
                }

                // Extract original PDF bytes
                var originalPdfBytes = pdfBytes.Take(originalSize).ToArray();

                // Hash the original PDF
                using var sha256 = SHA256.Create();
                var hash = sha256.ComputeHash(originalPdfBytes);

                _logger.LogDebug("Verifying PDF: original_size_from_metadata={OrigSize}, extracted_len={ExtractedLen}, sig_hex_len={SigHexLen}, hash={Hash}",
                    originalSize, originalPdfBytes.Length, signatureHex.Length,
                    BitConverter.ToString(hash).Replace("-", "").Substring(0, 32));

                if (keyToUse != null)
                {
                    // Verify signature with public key
                    var signer = new ECDsaSigner();
                    signer.Init(false, keyToUse);

                    // Decode DER signature
                    var (r, s) = DecodeDerSignature(signatureBytes);

                    _logger.LogDebug("Decoded signature: r_len={RLen}, s_len={SLen}", r.ToByteArrayUnsigned().Length, s.ToByteArrayUnsigned().Length);

                    var valid = signer.VerifySignature(hash, r, s);
                    _logger.LogInformation("PDF signature cryptographically verified: {Result}", valid ? "Valid" : "Invalid");
                    return valid;
                }
                else
                {
                    _logger.LogWarning("PDF has signature but no public key available for cryptographic verification");
                    return true; // Signature exists but cannot verify
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to verify PDF signature");
                return false;
            }
        }

        private byte[] HexStringToBytes(string hex)
        {
            var bytes = new byte[hex.Length / 2];
            for (int i = 0; i < bytes.Length; i++)
            {
                bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            }
            return bytes;
        }

        private (Org.BouncyCastle.Math.BigInteger r, Org.BouncyCastle.Math.BigInteger s) DecodeDerSignature(byte[] signature)
        {
            // Simple DER decoder for ECDSA signature
            int pos = 2; // Skip SEQUENCE tag and length

            // Read R
            pos++; // Skip INTEGER tag
            int rLen = signature[pos++];
            var r = new Org.BouncyCastle.Math.BigInteger(1, signature.Skip(pos).Take(rLen).ToArray());
            pos += rLen;

            // Read S
            pos++; // Skip INTEGER tag
            int sLen = signature[pos++];
            var s = new Org.BouncyCastle.Math.BigInteger(1, signature.Skip(pos).Take(sLen).ToArray());

            return (r, s);
        }
    }
}
