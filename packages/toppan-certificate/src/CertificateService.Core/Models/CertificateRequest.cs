using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace CertificateService.Core.Models
{
    /// <summary>
    /// Request model for certificate generation API.
    /// This is what the OpenCRVS Gateway sends to the certificate service.
    /// </summary>
    public class CertificateRequest
    {
        [JsonPropertyName("certificateType")]
        public string CertificateType { get; set; } = string.Empty; // "birth", "death", "marriage"

        [JsonPropertyName("templateName")]
        public string TemplateName { get; set; } = string.Empty; // e.g., "antigua-birth-v1"

        [JsonPropertyName("child")]
        public PersonSection? Child { get; set; }

        [JsonPropertyName("mother")]
        public PersonSection? Mother { get; set; }

        [JsonPropertyName("father")]
        public PersonSection? Father { get; set; }

        [JsonPropertyName("deceased")]
        public PersonSection? Deceased { get; set; } // For death certificates

        [JsonPropertyName("spouse")]
        public PersonSection? Spouse { get; set; } // For death/marriage certificates

        [JsonPropertyName("informant")]
        public PersonSection? Informant { get; set; }

        [JsonPropertyName("amendments")]
        public List<AmendmentDto> Amendments { get; set; } = new List<AmendmentDto>();

        [JsonPropertyName("registrationNumber")]
        public string? RegistrationNumber { get; set; }

        [JsonPropertyName("registrationDate")]
        public string? RegistrationDate { get; set; }

        [JsonPropertyName("registrar")]
        public string? Registrar { get; set; }

        [JsonPropertyName("parish")]
        public string? Parish { get; set; }

        [JsonPropertyName("lateRegistration")]
        public bool? LateRegistration { get; set; }

        [JsonPropertyName("recordUrl")]
        public string? RecordUrl { get; set; }

        [JsonPropertyName("additionalFields")]
        public Dictionary<string, string>? AdditionalFields { get; set; }
    }

    /// <summary>
    /// Person data section - optimized for actual certificate fields
    /// Fields are kept optional to support different certificate types and scenarios
    /// </summary>
    public class PersonSection
    {
        // Name fields (all certificate types)
        [JsonPropertyName("firstName")]
        public string? FirstName { get; set; }

        [JsonPropertyName("middleName")]
        public string? MiddleName { get; set; }

        [JsonPropertyName("surname")]
        public string? Surname { get; set; }

        [JsonPropertyName("suffix")]
        public string? Suffix { get; set; }

        [JsonPropertyName("maidenName")]
        public string? MaidenName { get; set; }

        // Birth/Death fields
        [JsonPropertyName("dateOfBirth")]
        public string? DateOfBirth { get; set; }

        [JsonPropertyName("dateOfDeath")]
        public string? DateOfDeath { get; set; }

        [JsonPropertyName("placeOfBirth")]
        public string? PlaceOfBirth { get; set; }

        [JsonPropertyName("sex")]
        public string? Sex { get; set; } // "Male" or "Female"

        // Parent/Person details
        [JsonPropertyName("occupation")]
        public string? Occupation { get; set; }

        [JsonPropertyName("addressOne")]
        public string? AddressOne { get; set; }

        [JsonPropertyName("addressTwo")]
        public string? AddressTwo { get; set; }

        [JsonPropertyName("countryOfBirth")]
        public string? CountryOfBirth { get; set; }

        [JsonPropertyName("nationality")]
        public string? Nationality { get; set; }

        // Informant-specific field
        [JsonPropertyName("relationship")]
        public string? Relationship { get; set; } // Relationship to child

        [JsonPropertyName("profession")]
        public string? Profession { get; set; } // Informant's profession (alternative to occupation)
    }

    /// <summary>
    /// Amendment DTO for API (matches API spec)
    /// </summary>
    public class AmendmentDto
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty; // "ChangeOfName", "FathersNameAndParticularsAdded", etc.

        [JsonPropertyName("date")]
        public string Date { get; set; } = string.Empty;

        [JsonPropertyName("section")]
        public string Section { get; set; } = string.Empty;

        [JsonPropertyName("fields")]
        public Dictionary<string, string> Fields { get; set; } = new Dictionary<string, string>();

        [JsonPropertyName("description")]
        public string? Description { get; set; }

        /// <summary>
        /// Convert DTO to domain model
        /// </summary>
        public Amendment ToAmendment()
        {
            AmendmentType amendmentType;
            if (!Enum.TryParse<AmendmentType>(Type, out amendmentType))
            {
                throw new ArgumentException($"Invalid amendment type: {Type}");
            }

            return new Amendment
            {
                Type = amendmentType,
                Date = Date,
                Section = Section,
                Fields = Fields,
                Description = Description
            };
        }
    }
}
