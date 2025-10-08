using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace CertificateService.Api
{
    /// <summary>
    /// Swagger operation filter to handle file upload endpoints
    /// </summary>
    public class FileUploadOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            // This is a placeholder for future file upload support
            // Currently not used but registered for extensibility
        }
    }
}
