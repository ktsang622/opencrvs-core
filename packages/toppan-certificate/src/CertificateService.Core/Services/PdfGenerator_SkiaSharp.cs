using SkiaSharp;
using Microsoft.Extensions.Logging;

namespace CertificateService.Core.Services
{
    /// <summary>
    /// Pure SkiaSharp PDF generation (no external PDF library needed)
    /// 100% open source (MIT license), fast, and robust
    /// </summary>
    public class PdfGeneratorSkiaSharp
    {
        private readonly ILogger<PdfGeneratorSkiaSharp>? _logger;

        public PdfGeneratorSkiaSharp(ILogger<PdfGeneratorSkiaSharp>? logger = null)
        {
            _logger = logger;
        }

        /// <summary>
        /// Generate PDF from SkiaSharp bitmaps using native SkiaSharp PDF support
        /// </summary>
        public byte[] GeneratePdf(
            SKBitmap frontPageBitmap,
            SKBitmap? backPageBitmap = null,
            PdfMetadata? metadata = null)
        {
            metadata ??= new PdfMetadata();

            var pageCount = backPageBitmap != null ? 2 : 1;
            _logger?.LogInformation("Generating PDF with {PageCount} pages using SkiaSharp", pageCount);

            try
            {
                using var stream = new MemoryStream();

                // Create PDF document
                using (var document = SKDocument.CreatePdf(stream, CreateMetadata(metadata)))
                {
                    // Front page
                    using (var canvas = document.BeginPage(frontPageBitmap.Width, frontPageBitmap.Height))
                    {
                        canvas.Clear(SKColors.White);
                        canvas.DrawBitmap(frontPageBitmap, 0, 0);
                        document.EndPage();
                    }

                    // Back page (if provided)
                    if (backPageBitmap != null)
                    {
                        using (var canvas = document.BeginPage(backPageBitmap.Width, backPageBitmap.Height))
                        {
                            canvas.Clear(SKColors.White);
                            canvas.DrawBitmap(backPageBitmap, 0, 0);
                            document.EndPage();
                        }
                    }

                    document.Close();
                }

                var pdfBytes = stream.ToArray();
                _logger?.LogInformation("PDF generated successfully: {Size} KB, {PageCount} pages",
                    pdfBytes.Length / 1024, pageCount);

                return pdfBytes;
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Failed to generate PDF with SkiaSharp");
                throw new PdfGenerationException("Failed to generate PDF", ex);
            }
        }

        /// <summary>
        /// Generate multi-page PDF from list of bitmaps
        /// </summary>
        public byte[] GenerateMultiPagePdf(
            List<SKBitmap> bitmaps,
            PdfMetadata? metadata = null)
        {
            metadata ??= new PdfMetadata();

            if (bitmaps == null || !bitmaps.Any())
            {
                throw new ArgumentException("At least one bitmap is required", nameof(bitmaps));
            }

            _logger?.LogInformation("Generating multi-page PDF with {PageCount} pages", bitmaps.Count);

            try
            {
                using var stream = new MemoryStream();

                using (var document = SKDocument.CreatePdf(stream, CreateMetadata(metadata)))
                {
                    foreach (var bitmap in bitmaps)
                    {
                        using (var canvas = document.BeginPage(bitmap.Width, bitmap.Height))
                        {
                            canvas.Clear(SKColors.White);
                            canvas.DrawBitmap(bitmap, 0, 0);
                            document.EndPage();
                        }
                    }

                    document.Close();
                }

                var pdfBytes = stream.ToArray();
                _logger?.LogInformation("Multi-page PDF generated: {Size} KB, {PageCount} pages",
                    pdfBytes.Length / 1024, bitmaps.Count);

                return pdfBytes;
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Failed to generate multi-page PDF");
                throw new PdfGenerationException("Failed to generate multi-page PDF", ex);
            }
        }

        /// <summary>
        /// Create PDF metadata
        /// </summary>
        private SKDocumentPdfMetadata CreateMetadata(PdfMetadata metadata)
        {
            return new SKDocumentPdfMetadata
            {
                Title = metadata.Title,
                Author = metadata.Author,
                Subject = metadata.Subject,
                Creator = metadata.Creator,
                Producer = "SkiaSharp PDF Generator",
                RasterDpi = metadata.DPI,
                EncodingQuality = 100 // Maximum quality
            };
        }

        /// <summary>
        /// Estimate PDF file size
        /// </summary>
        public long EstimatePdfSize(int pageCount, int dpi = 300)
        {
            // At 300 DPI with PNG compression: ~500KB per page
            // At 150 DPI: ~200KB per page
            var bytesPerPage = dpi >= 300 ? 500 * 1024 : 200 * 1024;
            return pageCount * bytesPerPage;
        }
    }

    /// <summary>
    /// PDF metadata
    /// </summary>
    public class PdfMetadata
    {
        public string Title { get; set; } = "Certificate";
        public string Author { get; set; } = "Toppan CRVS Certificate Service";
        public string Subject { get; set; } = "Birth/Death/Marriage Certificate";
        public string Creator { get; set; } = "Toppan CRVS Certificate Service v1.0";
        public int DPI { get; set; } = 300;
    }

    /// <summary>
    /// PDF generation exception
    /// </summary>
    public class PdfGenerationException : Exception
    {
        public PdfGenerationException(string message) : base(message) { }
        public PdfGenerationException(string message, Exception innerException) : base(message, innerException) { }
    }
}
