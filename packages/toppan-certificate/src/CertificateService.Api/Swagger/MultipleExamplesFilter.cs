using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using CertificateService.Core.Models;

namespace CertificateService.Api.Swagger
{
    /// <summary>
    /// Adds multiple request examples to Swagger UI with dropdown selector
    /// </summary>
    public class MultipleExamplesFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            // Check if this is the generate certificate endpoint
            var isGenerateEndpoint = context.ApiDescription.RelativePath?.Contains("Certificates/generate") ?? false;

            if (isGenerateEndpoint)
            {
                var requestBody = operation.RequestBody;
                if (requestBody?.Content != null && requestBody.Content.ContainsKey("application/json"))
                {
                    var mediaType = requestBody.Content["application/json"];

                    // Create examples dictionary
                    var examples = new Dictionary<string, OpenApiExample>();

                    // Example 1: Minimal
                    var minimalExample = new BirthCertificateMinimalExample();
                    examples.Add("minimal", new OpenApiExample
                    {
                        Summary = "1. Minimal - Required fields only",
                        Description = "Simplest possible birth certificate with only required fields (10 fields total)",
                        Value = ConvertToOpenApiObject(minimalExample.GetExamples())
                    });

                    // Example 2: With Amendments
                    var amendmentsExample = new BirthCertificateWithAmendmentsExample();
                    examples.Add("withAmendments", new OpenApiExample
                    {
                        Summary = "2. With Amendments - Name change",
                        Description = "Birth certificate with single name change amendment showing superscript notation",
                        Value = ConvertToOpenApiObject(amendmentsExample.GetExamples())
                    });

                    // Example 3: Unknown Father
                    var unknownFatherExample = new BirthCertificateUnknownFatherExample();
                    examples.Add("unknownFather", new OpenApiExample
                    {
                        Summary = "3. Unknown Father - Father is null",
                        Description = "Birth certificate with missing father section (renders as xxxxx)",
                        Value = ConvertToOpenApiObject(unknownFatherExample.GetExamples())
                    });

                    // Example 4: Father Added Later
                    var fatherAddedExample = new BirthCertificateFatherAddedExample();
                    examples.Add("fatherAdded", new OpenApiExample
                    {
                        Summary = "4. Father Added Later - Paternity amendment",
                        Description = "Father's details added via amendment (all father fields show superscript ¹)",
                        Value = ConvertToOpenApiObject(fatherAddedExample.GetExamples())
                    });

                    // Example 5: Complete
                    var completeExample = new BirthCertificateCompleteExample();
                    examples.Add("complete", new OpenApiExample
                    {
                        Summary = "5. Complete - All optional fields + 5 amendments",
                        Description = "Birth certificate with all available fields populated (including informant) and 5 amendments",
                        Value = ConvertToOpenApiObject(completeExample.GetExamples())
                    });

                    // Example 6: Complete with 10 Amendments (Back Page)
                    var complete10AmendmentsExample = new BirthCertificateCompleteWith10AmendmentsExample();
                    examples.Add("complete10Amendments", new OpenApiExample
                    {
                        Summary = "6. Complete - All fields + 10 amendments (triggers back page)",
                        Description = "Birth certificate with all fields and 10 amendments. Front page shows first 5, back page shows all 10 in two columns",
                        Value = ConvertToOpenApiObject(complete10AmendmentsExample.GetExamples())
                    });

                    mediaType.Examples = examples;
                }
            }
        }

        private IOpenApiAny ConvertToOpenApiObject(object obj)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(obj, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            });

            return new OpenApiString(json);
        }
    }
}
