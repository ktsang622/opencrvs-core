using System;
using System.Collections.Generic;

namespace CertificateService.Core.Models
{
    /// <summary>
    /// Amendment types supported by the certificate system.
    /// Matches the types defined in the Windows app.
    /// </summary>
    public enum AmendmentType
    {
        ChangeOfName = 0,
        BirthNameAndParticularsChanged = 1,
        FathersNameAndParticularsAdded = 2,
        FathersNameAndParticularsRemoved = 3,
        FathersNameAndParticularsChanged = 4,
        MothersNameAndParticularsAdded = 5,
        MothersNameAndParticularsRemoved = 6,
        MothersNameAndParticularsChanged = 7
    }

    /// <summary>
    /// Represents a single amendment to a birth certificate.
    /// Ported from Windows app Amendment.cs
    /// </summary>
    public class Amendment
    {
        /// <summary>
        /// Type of amendment
        /// </summary>
        public AmendmentType Type { get; set; }

        /// <summary>
        /// Date when amendment was made (formatted, e.g., "15 Jan 2024")
        /// </summary>
        public string Date { get; set; } = string.Empty;

        /// <summary>
        /// Section this amendment affects (Child, Mother, Father)
        /// </summary>
        public string Section { get; set; } = string.Empty;

        /// <summary>
        /// Fields changed in this amendment (field name -> new value)
        /// Example: { "FirstName": "John", "Surname": "Smith" }
        /// </summary>
        public Dictionary<string, string> Fields { get; set; } = new Dictionary<string, string>();

        /// <summary>
        /// Optional description/reason for amendment
        /// </summary>
        public string? Description { get; set; }

        /// <summary>
        /// Get the description based on amendment type
        /// </summary>
        public string GetDefaultDescription()
        {
            return Type switch
            {
                AmendmentType.ChangeOfName => "Change of name",
                AmendmentType.BirthNameAndParticularsChanged => "Birth name and particulars changed",
                AmendmentType.FathersNameAndParticularsAdded => "Father's name and particulars added",
                AmendmentType.FathersNameAndParticularsRemoved => "Father's name and particulars removed",
                AmendmentType.FathersNameAndParticularsChanged => "Father's name and particulars changed",
                AmendmentType.MothersNameAndParticularsAdded => "Mother's name and particulars added",
                AmendmentType.MothersNameAndParticularsRemoved => "Mother's name and particulars removed",
                AmendmentType.MothersNameAndParticularsChanged => "Mother's name and particulars changed",
                _ => "Amendment"
            };
        }

        /// <summary>
        /// Get the section this amendment type affects
        /// </summary>
        public static string GetSectionForType(AmendmentType type)
        {
            return type switch
            {
                AmendmentType.ChangeOfName => "Child",
                AmendmentType.BirthNameAndParticularsChanged => "Child",
                AmendmentType.FathersNameAndParticularsAdded => "Father",
                AmendmentType.FathersNameAndParticularsRemoved => "Father",
                AmendmentType.FathersNameAndParticularsChanged => "Father",
                AmendmentType.MothersNameAndParticularsAdded => "Mother",
                AmendmentType.MothersNameAndParticularsRemoved => "Mother",
                AmendmentType.MothersNameAndParticularsChanged => "Mother",
                _ => "Unknown"
            };
        }
    }
}
