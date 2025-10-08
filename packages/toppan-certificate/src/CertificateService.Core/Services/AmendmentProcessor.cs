using CertificateService.Core.Models;
using Microsoft.Extensions.Logging;

namespace CertificateService.Core.Services
{
    /// <summary>
    /// Processes amendments and applies them to PersonalInfo.
    /// Ported from Windows Forms amendment processing logic.
    /// </summary>
    public class AmendmentProcessor
    {
        private readonly ILogger<AmendmentProcessor>? _logger;

        public AmendmentProcessor(ILogger<AmendmentProcessor>? logger = null)
        {
            _logger = logger;
        }

        /// <summary>
        /// Process amendments and apply them to PersonalInfo with superscript tracking.
        /// </summary>
        /// <param name="personalInfo">PersonalInfo to modify</param>
        /// <param name="amendments">List of amendments to apply</param>
        /// <returns>Number of amendments processed</returns>
        public int ProcessAmendments(PersonalInfo personalInfo, List<Amendment> amendments)
        {
            if (amendments == null || !amendments.Any())
            {
                _logger?.LogDebug("No amendments to process");
                return 0;
            }

            // Sort amendments chronologically (oldest first)
            var sortedAmendments = amendments
                .OrderBy(a => DateTime.TryParse(a.Date, out var date) ? date : DateTime.MaxValue)
                .ThenBy(a => a.Type)
                .ToList();

            _logger?.LogInformation("Processing {Count} amendments chronologically", sortedAmendments.Count);

            int amendmentNumber = 1;

            foreach (var amendment in sortedAmendments)
            {
                ProcessSingleAmendment(personalInfo, amendment, amendmentNumber);
                amendmentNumber++;
            }

            // Add amendments list for rendering on back page
            AddAmendmentsListToPersonalInfo(personalInfo, sortedAmendments);

            return sortedAmendments.Count;
        }

        /// <summary>
        /// Process a single amendment
        /// </summary>
        private void ProcessSingleAmendment(PersonalInfo personalInfo, Amendment amendment, int amendmentNumber)
        {
            var section = amendment.Section; // e.g., "Child", "Mother", "Father"

            _logger?.LogDebug("Processing amendment #{Number}: {Type} for {Section}",
                amendmentNumber, amendment.Type, section);

            // Handle removal amendments (remove entire section)
            if (amendment.Type == AmendmentType.FathersNameAndParticularsRemoved ||
                amendment.Type == AmendmentType.MothersNameAndParticularsRemoved)
            {
                personalInfo.RemoveSectionFields(section);
                _logger?.LogDebug("Removed {Section} section fields", section);
                return;
            }

            // Apply field changes and track superscripts
            foreach (var field in amendment.Fields)
            {
                var fieldName = $"{section}{field.Key}"; // e.g., "ChildFirstName"
                var fieldValue = field.Value;

                // Handle clearing ("|" marker from Windows app)
                if (fieldValue == "|")
                {
                    personalInfo.AddScalar(fieldName, "");
                    personalInfo.AddScalar($"{fieldName}Super", amendmentNumber.ToString());
                    _logger?.LogDebug("Cleared field {Field} with superscript {Number}", fieldName, amendmentNumber);
                }
                else
                {
                    personalInfo.AddScalar(fieldName, fieldValue);
                    personalInfo.AddScalar($"{fieldName}Super", amendmentNumber.ToString());
                    _logger?.LogDebug("Updated field {Field} = '{Value}' with superscript {Number}",
                        fieldName, fieldValue, amendmentNumber);
                }
            }
        }

        /// <summary>
        /// Add amendments list group for rendering on back page
        /// </summary>
        private void AddAmendmentsListToPersonalInfo(PersonalInfo personalInfo, List<Amendment> sortedAmendments)
        {
            int amendmentNumber = 1;

            foreach (var amendment in sortedAmendments)
            {
                var description = string.IsNullOrEmpty(amendment.Description)
                    ? GetDefaultDescription(amendment)
                    : amendment.Description;

                // Append date in parentheses to description for better space utilization
                var descriptionWithDate = $"{description} ({amendment.Date})";

                // Add to group (for new template format)
                var amendmentItem = new Dictionary<string, string>
                {
                    ["Super"] = amendmentNumber.ToString(),
                    ["Desc"] = descriptionWithDate,
                    ["Date"] = amendment.Date  // Keep original date in case template still references it
                };
                personalInfo.AddToGroup("AmendmentsList", amendmentItem);

                // ALSO add as individual fields (for old template format)
                // This supports templates using Super1, Desc1, Date1, etc.
                personalInfo.AddScalar($"Super{amendmentNumber}", amendmentNumber.ToString());
                personalInfo.AddScalar($"Desc{amendmentNumber}", description);
                personalInfo.AddScalar($"Date{amendmentNumber}", amendment.Date);

                _logger?.LogDebug("Added amendment to list: #{Number} - {Description}", amendmentNumber, description);

                amendmentNumber++;
            }
        }

        /// <summary>
        /// Get default description based on amendment type and fields
        /// </summary>
        private string GetDefaultDescription(Amendment amendment)
        {
            var description = amendment.GetDefaultDescription();

            // If we have field changes, append them to make it more descriptive
            if (amendment.Fields.Any())
            {
                var changedFields = string.Join(", ", amendment.Fields
                    .Where(f => f.Value != "|")
                    .Select(f => $"{f.Key}: {f.Value}"));

                if (!string.IsNullOrEmpty(changedFields))
                {
                    description += $" - {changedFields}";
                }
            }

            return description;
        }

        /// <summary>
        /// Calculate total pages needed based on amendment count
        /// </summary>
        public int CalculatePageCount(int amendmentCount, int frontPageCapacity = 5, int backPageCapacity = 24)
        {
            if (amendmentCount == 0)
                return 1; // Front page only

            if (amendmentCount <= frontPageCapacity)
                return 1; // All fit on front

            // Need back page
            var backPageAmendments = amendmentCount - frontPageCapacity;
            var backPagesNeeded = (int)Math.Ceiling((double)backPageAmendments / backPageCapacity);

            return 1 + backPagesNeeded; // Front + back pages
        }

        /// <summary>
        /// Validate amendments before processing
        /// </summary>
        public (bool IsValid, List<string> Errors) ValidateAmendments(List<Amendment> amendments, string certificateType)
        {
            var errors = new List<string>();

            if (amendments == null || !amendments.Any())
                return (true, errors); // No amendments is valid

            for (int i = 0; i < amendments.Count; i++)
            {
                var amendment = amendments[i];

                // Check section validity
                if (string.IsNullOrEmpty(amendment.Section))
                {
                    errors.Add($"Amendment {i}: Section is required");
                }
                else if (certificateType.ToLower() == "birth")
                {
                    var validSections = new[] { "Child", "Mother", "Father" };
                    if (!validSections.Contains(amendment.Section))
                    {
                        errors.Add($"Amendment {i}: Invalid section '{amendment.Section}' for birth certificate");
                    }
                }

                // Check date validity
                if (string.IsNullOrEmpty(amendment.Date))
                {
                    errors.Add($"Amendment {i}: Date is required");
                }

                // Check fields
                if (!amendment.Fields.Any())
                {
                    errors.Add($"Amendment {i}: At least one field change is required");
                }
            }

            return (!errors.Any(), errors);
        }
    }
}
