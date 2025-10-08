using System.Collections.Generic;

namespace CertificateService.Api.Configuration
{
    /// <summary>
    /// Strongly-typed configuration for Certificate Service
    /// </summary>
    public class CertificateServiceOptions
    {
        public const string SectionName = "CertificateService";

        // === Template Configuration ===
        public string TemplatesPath { get; set; } = "/app/templates";
        public string DefaultLayoutFileName { get; set; } = "ElmLayout.txt";
        public Dictionary<string, TemplateConfiguration> Templates { get; set; } = new();

        // === Performance ===
        public int MaxConcurrentRenders { get; set; } = 5;
        public int RenderTimeoutSeconds { get; set; } = 30;
        public bool EnableCaching { get; set; } = true;
        public int CacheDurationMinutes { get; set; } = 60;

        // === PDF Generation ===
        public PdfSettings PdfSettings { get; set; } = new();

        // === Multi-Page Configuration ===
        public PageSettings PageSettings { get; set; } = new();

        // === Output ===
        public string OutputPath { get; set; } = "/app/output";
        public bool DebugMode { get; set; } = false;
        public bool RetainGeneratedFiles { get; set; } = false;
        public int MaxOutputFileSizeMB { get; set; } = 10;
        public OutputFormatsSettings OutputFormats { get; set; } = new();

        // === Fonts ===
        public string FontsPath { get; set; } = "/app/templates/fonts";
        public string FallbackFont { get; set; } = "arial.ttf";

        // === Signature ===
        public string? SignatureFilePath { get; set; }

        // === Validation ===
        public int MaxAmendments { get; set; } = 50;
        public int MaxRequestSizeMB { get; set; } = 5;
        public List<string> RequiredFields { get; set; } = new() { "certificateType", "templateName" };

        // === Health Check ===
        public HealthCheckSettings HealthCheck { get; set; } = new();

        // === Logging & Debugging ===
        public bool EnableDetailedLogging { get; set; } = true;
        public bool LogRenderTimings { get; set; } = true;
        public bool LogAmendmentProcessing { get; set; } = true;
    }

    /// <summary>
    /// Template-specific configuration
    /// </summary>
    public class TemplateConfiguration
    {
        public string FolderName { get; set; } = string.Empty;
        public string LayoutFile { get; set; } = "ElmLayout.txt";
        public string FrontPageBackgroundImage { get; set; } = string.Empty;
        public string BackPageBackgroundImage { get; set; } = string.Empty;
        public List<string> SupportedPages { get; set; } = new() { "front", "back" };
        public List<string> RequireSections { get; set; } = new();
        public int FrontAmendmentCount { get; set; } = 5;
        public int BackAmendmentMaxRows { get; set; } = 24;
        public int BackAmendmentMaxCols { get; set; } = 2;

        /// <summary>
        /// Get full path to template folder
        /// </summary>
        public string GetTemplatePath(string basePath)
        {
            return Path.Combine(basePath, FolderName);
        }

        /// <summary>
        /// Get full path to layout file
        /// </summary>
        public string GetLayoutFilePath(string basePath)
        {
            return Path.Combine(GetTemplatePath(basePath), LayoutFile);
        }

        /// <summary>
        /// Get full path to front page background
        /// </summary>
        public string GetFrontPageBackgroundPath(string basePath)
        {
            return Path.Combine(GetTemplatePath(basePath), FrontPageBackgroundImage);
        }

        /// <summary>
        /// Get full path to back page background
        /// </summary>
        public string GetBackPageBackgroundPath(string basePath)
        {
            return Path.Combine(GetTemplatePath(basePath), BackPageBackgroundImage);
        }

        /// <summary>
        /// Validate template exists and is properly configured
        /// </summary>
        public (bool IsValid, string ErrorMessage) Validate(string basePath)
        {
            var templatePath = GetTemplatePath(basePath);
            if (!Directory.Exists(templatePath))
                return (false, $"Template folder not found: {templatePath}");

            var layoutPath = GetLayoutFilePath(basePath);
            if (!File.Exists(layoutPath))
                return (false, $"Layout file not found: {layoutPath}");

            // Background images are optional (defined in ElmLayout.txt)
            return (true, string.Empty);
        }
    }

    /// <summary>
    /// PDF generation settings
    /// </summary>
    public class PdfSettings
    {
        public int DefaultDpi { get; set; } = 300;
        public int PageWidth { get; set; } = 1325;
        public int PageHeight { get; set; } = 1732;
        public bool CompressionEnabled { get; set; } = true;
        public string PdfVersion { get; set; } = "1.7";
        public bool EmbedFonts { get; set; } = true;
    }

    /// <summary>
    /// Multi-page settings
    /// </summary>
    public class PageSettings
    {
        public List<string> FrontPageSections { get; set; } = new() { "certificate", "data" };
        public List<string> BackPageSections { get; set; } = new() { "amendments", "notes" };
        public int MaxAmendmentsPerPage { get; set; } = 5;
        public bool EnableDynamicPageCount { get; set; } = true;
    }

    /// <summary>
    /// Health check settings
    /// </summary>
    public class HealthCheckSettings
    {
        public bool ValidateTemplatesOnStartup { get; set; } = true;
        public bool TemplateWatcherEnabled { get; set; } = false;
        public List<string> RequiredTemplates { get; set; } = new() { "Birth" };
    }

    /// <summary>
    /// Output formats configuration
    /// </summary>
    public class OutputFormatsSettings
    {
        public List<string> Enabled { get; set; } = new() { "PDF", "JPG" };
        public FormatSettings Printing { get; set; } = new() { Format = "PDF", Dpi = 300, Quality = 95 };
        public FormatSettings Viewing { get; set; } = new() { Format = "JPG", Dpi = 150, Quality = 90 };
        public FormatSettings Archival { get; set; } = new() { Format = "PDFA", Dpi = 300, Enabled = false };
    }

    /// <summary>
    /// Format-specific settings
    /// </summary>
    public class FormatSettings
    {
        public string Format { get; set; } = "PDF";
        public int Dpi { get; set; } = 300;
        public int Quality { get; set; } = 95;
        public bool Enabled { get; set; } = true;
    }
}
