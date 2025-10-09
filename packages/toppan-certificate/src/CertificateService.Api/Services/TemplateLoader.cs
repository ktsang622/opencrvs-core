using CertificateService.Api.Configuration;
using Microsoft.Extensions.Options;

namespace CertificateService.Api.Services
{
    /// <summary>
    /// Loads templates from HTTP URL (country-config) with fallback to local file system
    ///
    /// Priority:
    /// 1. Try HTTP (if TemplatesUrl configured)
    /// 2. Fallback to local file system (TemplatesPath)
    /// </summary>
    public class TemplateLoader
    {
        private readonly CertificateServiceOptions _options;
        private readonly ILogger<TemplateLoader> _logger;
        private readonly HttpClient _httpClient;
        private readonly Dictionary<string, string> _cache = new();
        private readonly object _cacheLock = new();

        public TemplateLoader(
            IOptions<CertificateServiceOptions> options,
            ILogger<TemplateLoader> logger,
            HttpClient httpClient)
        {
            _options = options.Value;
            _logger = logger;
            _httpClient = httpClient;
        }

        /// <summary>
        /// Load template file with HTTP fallback to file system
        /// </summary>
        /// <param name="templateType">Template type (e.g., "birth", "death")</param>
        /// <param name="filename">Filename (e.g., "ElmLayout.txt", "BirthCertificateBackground.jpg")</param>
        /// <returns>File content as string</returns>
        public async Task<string?> LoadTemplateFileAsync(string templateType, string filename)
        {
            var cacheKey = $"{templateType}/{filename}";

            // Check cache
            if (_options.EnableCaching)
            {
                lock (_cacheLock)
                {
                    if (_cache.TryGetValue(cacheKey, out var cached))
                    {
                        _logger.LogDebug("Template cache hit: {CacheKey}", cacheKey);
                        return cached;
                    }
                }
            }

            string? content = null;

            // Try HTTP first (if configured)
            if (!string.IsNullOrEmpty(_options.TemplatesUrl))
            {
                content = await TryLoadFromHttpAsync(templateType, filename);
            }

            // Fallback to file system
            if (content == null)
            {
                content = TryLoadFromFileSystem(templateType, filename);
            }

            // Cache if enabled
            if (content != null && _options.EnableCaching)
            {
                lock (_cacheLock)
                {
                    _cache[cacheKey] = content;
                }
            }

            return content;
        }

        /// <summary>
        /// Try loading template from HTTP endpoint (country-config)
        /// </summary>
        private async Task<string?> TryLoadFromHttpAsync(string templateType, string filename)
        {
            try
            {
                var url = $"{_options.TemplatesUrl}/{templateType}/{filename}";
                _logger.LogInformation("Fetching template from HTTP: {Url}", url);

                var response = await _httpClient.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("HTTP template fetch failed: {Status} from {Url}",
                        response.StatusCode, url);
                    return null;
                }

                var content = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Loaded template from HTTP: {Url} ({Size} bytes)",
                    url, content.Length);

                return content;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load template from HTTP: {TemplateType}/{Filename}",
                    templateType, filename);
                return null;
            }
        }

        /// <summary>
        /// Try loading template from local file system
        /// </summary>
        private string? TryLoadFromFileSystem(string templateType, string filename)
        {
            try
            {
                var filePath = Path.Combine(_options.TemplatesPath, templateType, filename);

                if (!File.Exists(filePath))
                {
                    _logger.LogWarning("Template file not found: {FilePath}", filePath);
                    return null;
                }

                var content = File.ReadAllText(filePath);
                _logger.LogInformation("Loaded template from file system: {FilePath} ({Size} bytes)",
                    filePath, content.Length);

                return content;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load template from file system: {TemplateType}/{Filename}",
                    templateType, filename);
                return null;
            }
        }

        /// <summary>
        /// Load binary file (images) with HTTP fallback
        /// </summary>
        public async Task<byte[]?> LoadBinaryFileAsync(string templateType, string filename)
        {
            // Try HTTP first
            if (!string.IsNullOrEmpty(_options.TemplatesUrl))
            {
                try
                {
                    var url = $"{_options.TemplatesUrl}/{templateType}/{filename}";
                    _logger.LogInformation("Fetching binary file from HTTP: {Url}", url);

                    var response = await _httpClient.GetAsync(url);

                    if (response.IsSuccessStatusCode)
                    {
                        var bytes = await response.Content.ReadAsByteArrayAsync();
                        _logger.LogInformation("Loaded binary from HTTP: {Url} ({Size} bytes)",
                            url, bytes.Length);
                        return bytes;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load binary from HTTP: {TemplateType}/{Filename}",
                        templateType, filename);
                }
            }

            // Fallback to file system
            try
            {
                var filePath = Path.Combine(_options.TemplatesPath, templateType, filename);

                if (!File.Exists(filePath))
                {
                    _logger.LogWarning("Binary file not found: {FilePath}", filePath);
                    return null;
                }

                var bytes = File.ReadAllBytes(filePath);
                _logger.LogInformation("Loaded binary from file system: {FilePath} ({Size} bytes)",
                    filePath, bytes.Length);

                return bytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load binary from file system: {TemplateType}/{Filename}",
                    templateType, filename);
                return null;
            }
        }

        /// <summary>
        /// Preload templates at startup (mirrors OpenCRVS client pattern)
        /// Loads all templates into cache to avoid HTTP calls during runtime
        /// </summary>
        /// <param name="templateTypes">Template types to preload (e.g., ["birth", "death", "marriage"])</param>
        /// <returns>Summary of preload results</returns>
        public async Task<PreloadResult> PreloadTemplatesAsync(string[] templateTypes)
        {
            _logger.LogInformation("Preloading templates for: {Types}", string.Join(", ", templateTypes));
            var result = new PreloadResult();
            var startTime = DateTime.UtcNow;

            foreach (var templateType in templateTypes)
            {
                try
                {
                    // Get template config
                    var templateKey = GetTemplateKey(templateType);
                    if (!_options.Templates.TryGetValue(templateKey, out var templateConfig))
                    {
                        _logger.LogWarning("Template configuration not found for: {Type}", templateType);
                        result.FailedTemplates.Add(templateType);
                        continue;
                    }

                    // Load ElmLayout.txt
                    var layoutContent = await LoadTemplateFileAsync(templateType, templateConfig.LayoutFile);
                    if (layoutContent == null)
                    {
                        _logger.LogError("Failed to load layout file for: {Type}", templateType);
                        result.FailedTemplates.Add(templateType);
                        continue;
                    }

                    // Note: Images are referenced in ElmLayout.txt and will be loaded on-demand
                    // We could optionally preload them here, but they're large (600KB+) and may not all be needed

                    result.LoadedTemplates.Add(templateType);
                    _logger.LogInformation("✓ Preloaded template: {Type} (layout: {Size} bytes)",
                        templateType, layoutContent.Length);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error preloading template: {Type}", templateType);
                    result.FailedTemplates.Add(templateType);
                }
            }

            result.Duration = DateTime.UtcNow - startTime;
            result.CacheStats = GetCacheStats();

            _logger.LogInformation(
                "Template preload complete: {Loaded}/{Total} loaded in {Ms}ms, cache: {CacheCount} items, {CacheSize} bytes",
                result.LoadedTemplates.Count,
                templateTypes.Length,
                result.Duration.TotalMilliseconds,
                result.CacheStats.Count,
                result.CacheStats.TotalSizeBytes
            );

            return result;
        }

        /// <summary>
        /// Get template key (capitalizes first letter to match config)
        /// </summary>
        private string GetTemplateKey(string certificateType)
        {
            return certificateType switch
            {
                "birth" => "Birth",
                "death" => "Death",
                "marriage" => "Marriage",
                _ => char.ToUpper(certificateType[0]) + certificateType.Substring(1)
            };
        }

        /// <summary>
        /// Clear template cache
        /// </summary>
        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _cache.Clear();
                _logger.LogInformation("Template cache cleared");
            }
        }

        /// <summary>
        /// Get cache statistics
        /// </summary>
        public (int Count, int TotalSizeBytes) GetCacheStats()
        {
            lock (_cacheLock)
            {
                var count = _cache.Count;
                var size = _cache.Values.Sum(v => v.Length);
                return (count, size);
            }
        }
    }

    /// <summary>
    /// Result of template preload operation
    /// </summary>
    public class PreloadResult
    {
        public List<string> LoadedTemplates { get; set; } = new();
        public List<string> FailedTemplates { get; set; } = new();
        public TimeSpan Duration { get; set; }
        public (int Count, int TotalSizeBytes) CacheStats { get; set; }

        public bool IsSuccess => FailedTemplates.Count == 0;
    }
}
