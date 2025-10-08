using CertificateService.Core.Models;
using Swashbuckle.AspNetCore.Filters;

namespace CertificateService.Api.Swagger
{
    /// <summary>
    /// Swagger example: Birth certificate with name amendment
    /// </summary>
    public class BirthCertificateWithAmendmentsExample : IExamplesProvider<CertificateRequest>
    {
        public CertificateRequest GetExamples()
        {
            return new CertificateRequest
            {
                CertificateType = "birth",
                TemplateName = "Birth",
                Child = new PersonSection
                {
                    FirstName = "Jonathan",
                    MiddleName = "Andrew",
                    Surname = "Doe",
                    Suffix = "Jr",
                    DateOfBirth = "15 Jan 2024",
                    PlaceOfBirth = "St. John's Hospital",
                    Sex = "Male"
                },
                Mother = new PersonSection
                {
                    FirstName = "Jane",
                    MiddleName = "Marie",
                    Surname = "Smith",
                    MaidenName = "Johnson",
                    DateOfBirth = "10 Mar 1990",
                    Occupation = "Teacher",
                    AddressOne = "123 Main Street",
                    AddressTwo = "St. John's, Antigua",
                    CountryOfBirth = "Antigua and Barbuda"
                },
                Father = new PersonSection
                {
                    FirstName = "Robert",
                    MiddleName = "James",
                    Surname = "Doe",
                    DateOfBirth = "15 Jul 1988",
                    Occupation = "Engineer",
                    AddressOne = "123 Main Street",
                    AddressTwo = "St. John's, Antigua",
                    CountryOfBirth = "Antigua and Barbuda"
                },
                Amendments = new List<AmendmentDto>
                {
                    new AmendmentDto
                    {
                        Type = "ChangeOfName",
                        Date = "15 Mar 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "FirstName", "Jonathan" },
                            { "MiddleName", "Andrew" }
                        }
                    }
                },
                RegistrationNumber = "2024/B/001234",
                RegistrationDate = "20 Jan 2024",
                Registrar = "John Smith",
                Parish = "St. John",
                RecordUrl = "https://crvs.gov.ag/view/2024-B-001234"
            };
        }
    }

    /// <summary>
    /// Swagger example: Birth certificate with unknown father
    /// </summary>
    public class BirthCertificateUnknownFatherExample : IExamplesProvider<CertificateRequest>
    {
        public CertificateRequest GetExamples()
        {
            return new CertificateRequest
            {
                CertificateType = "birth",
                TemplateName = "Birth",
                Child = new PersonSection
                {
                    FirstName = "Sarah",
                    Surname = "Johnson",
                    DateOfBirth = "20 Feb 2024",
                    PlaceOfBirth = "Holberton Hospital",
                    Sex = "Female"
                },
                Mother = new PersonSection
                {
                    FirstName = "Emily",
                    Surname = "Johnson",
                    DateOfBirth = "22 May 1995"
                },
                Father = null, // Unknown father
                Amendments = new List<AmendmentDto>(),
                RegistrationNumber = "2024/B/001235",
                Parish = "St. George",
                RecordUrl = "https://crvs.gov.ag/view/2024-B-001235"
            };
        }
    }

    /// <summary>
    /// Swagger example: Birth with father added later
    /// </summary>
    public class BirthCertificateFatherAddedExample : IExamplesProvider<CertificateRequest>
    {
        public CertificateRequest GetExamples()
        {
            return new CertificateRequest
            {
                CertificateType = "birth",
                TemplateName = "Birth",
                Child = new PersonSection
                {
                    FirstName = "Michael",
                    Surname = "Brown",
                    DateOfBirth = "10 Jan 2024",
                    Sex = "Male"
                },
                Mother = new PersonSection
                {
                    FirstName = "Lisa",
                    Surname = "Brown"
                },
                Father = new PersonSection
                {
                    FirstName = "David",
                    Surname = "Brown",
                    DateOfBirth = "05 Jun 1985"
                },
                Amendments = new List<AmendmentDto>
                {
                    new AmendmentDto
                    {
                        Type = "FathersNameAndParticularsAdded",
                        Date = "15 Feb 2024",
                        Section = "Father",
                        Fields = new Dictionary<string, string>
                        {
                            { "FirstName", "David" },
                            { "Surname", "Brown" },
                            { "DateOfBirth", "05 Jun 1985" }
                        },
                        Description = "Father's details added per paternity acknowledgment"
                    }
                },
                RegistrationNumber = "2024/B/000567",
                Parish = "St. Peter",
                RecordUrl = "https://crvs.gov.ag/view/2024-B-000567"
            };
        }
    }

    /// <summary>
    /// Swagger example: Minimal birth certificate (absolute minimum fields)
    /// </summary>
    public class BirthCertificateMinimalExample : IExamplesProvider<CertificateRequest>
    {
        public CertificateRequest GetExamples()
        {
            return new CertificateRequest
            {
                CertificateType = "birth",
                TemplateName = "Birth",
                Child = new PersonSection
                {
                    FirstName = "Emma",
                    Surname = "Davis",
                    DateOfBirth = "05 Mar 2024",
                    Sex = "Female"
                },
                Mother = new PersonSection
                {
                    FirstName = "Rachel",
                    Surname = "Davis"
                },
                Father = new PersonSection
                {
                    FirstName = "James",
                    Surname = "Davis"
                },
                Amendments = new List<AmendmentDto>(),
                RegistrationNumber = "2024/B/000890",
                LateRegistration = false,
                Parish = "St. Mary",
                RecordUrl = "https://crvs.gov.ag/view/2024-B-000890"
            };
        }
    }

    /// <summary>
    /// Swagger example: Complete birth certificate with ALL optional fields and multiple amendments
    /// Demonstrates all possible fields and various amendment types at different times
    /// </summary>
    public class BirthCertificateCompleteExample : IExamplesProvider<CertificateRequest>
    {
        public CertificateRequest GetExamples()
        {
            return new CertificateRequest
            {
                CertificateType = "birth",
                TemplateName = "Birth",
                Child = new PersonSection
                {
                    FirstName = "Alexander",
                    MiddleName = "James",
                    Surname = "Thompson",
                    Suffix = "Jr",
                    DateOfBirth = "20 Apr 2024",
                    PlaceOfBirth = "Mount St. John's Medical Centre",
                    Sex = "Male",
                    Occupation = null,  // Not applicable for child
                    AddressOne = null,  // Not applicable for child
                    AddressTwo = null,  // Not applicable for child
                    CountryOfBirth = "Antigua and Barbuda",
                    MaidenName = null,  // Not applicable
                    Relationship = null,  // Not applicable
                    Profession = null   // Not applicable
                },
                Mother = new PersonSection
                {
                    FirstName = "Sophia",
                    MiddleName = "Grace",
                    Surname = "Thompson",
                    MaidenName = "Richards",
                    Suffix = null,
                    DateOfBirth = "12 Aug 1992",
                    PlaceOfBirth = "Barbados",
                    Sex = "Female",
                    Occupation = "Registered Nurse",
                    Profession = "Healthcare Professional",
                    AddressOne = "45 Independence Avenue",
                    AddressTwo = "St. John's, Antigua and Barbuda",
                    CountryOfBirth = "Barbados",
                    Relationship = null  // Not applicable for mother
                },
                Father = new PersonSection
                {
                    FirstName = "Alexander",
                    MiddleName = "William",
                    Surname = "Thompson",
                    Suffix = "Sr",
                    DateOfBirth = "08 Nov 1990",
                    PlaceOfBirth = "St. John's, Antigua",
                    Sex = "Male",
                    Occupation = "Certified Public Accountant",
                    Profession = "Financial Services",
                    AddressOne = "45 Independence Avenue",
                    AddressTwo = "St. John's, Antigua and Barbuda",
                    CountryOfBirth = "Antigua and Barbuda",
                    MaidenName = null,  // Not applicable for father
                    Relationship = null  // Not applicable for father
                },
                Informant = new PersonSection
                {
                    FirstName = "Sophia",
                    MiddleName = "Grace",
                    Surname = "Thompson",
                    Suffix = null,
                    DateOfBirth = "12 Aug 1992",
                    PlaceOfBirth = null,
                    Sex = "Female",
                    Relationship = "Mother",
                    Profession = "Registered Nurse",
                    Occupation = null,
                    AddressOne = "45 Independence Avenue",
                    AddressTwo = "St. John's, Antigua and Barbuda",
                    CountryOfBirth = null,
                    MaidenName = null
                },
                Amendments = new List<AmendmentDto>
                {
                    new AmendmentDto
                    {
                        Type = "ChangeOfName",
                        Date = "15 May 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "FirstName", "Alexander" }
                        },
                        Description = "Corrected spelling of first name from 'Alexender' to 'Alexander' per court order #CO-2024-156"
                    },
                    new AmendmentDto
                    {
                        Type = "BirthNameAndParticularsChanged",
                        Date = "22 Jun 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "MiddleName", "James" }
                        },
                        Description = "Middle name added per parents' joint request, baptismal certificate provided"
                    },
                    new AmendmentDto
                    {
                        Type = "MothersNameAndParticularsChanged",
                        Date = "10 Jul 2024",
                        Section = "Mother",
                        Fields = new Dictionary<string, string>
                        {
                            { "Surname", "Thompson" },
                            { "Occupation", "Registered Nurse" }
                        },
                        Description = "Mother's surname changed from 'Richards' to 'Thompson' following marriage on 05 Jul 2024, occupation updated"
                    },
                    new AmendmentDto
                    {
                        Type = "FathersNameAndParticularsChanged",
                        Date = "15 Aug 2024",
                        Section = "Father",
                        Fields = new Dictionary<string, string>
                        {
                            { "AddressOne", "45 Independence Avenue" },
                            { "AddressTwo", "St. John's, Antigua and Barbuda" }
                        },
                        Description = "Father's address updated per statutory declaration dated 12 Aug 2024"
                    },
                    new AmendmentDto
                    {
                        Type = "BirthNameAndParticularsChanged",
                        Date = "25 Sep 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "PlaceOfBirth", "Mount St. John's Medical Centre" }
                        },
                        Description = "Place of birth corrected from 'St. Johns Hospital' to proper facility name per hospital records"
                    }
                },
                RegistrationNumber = "2024/B/001456",
                RegistrationDate = "25 Apr 2024",
                Registrar = "Margaret Williams",
                LateRegistration = false,
                Parish = "St. Philip",
                RecordUrl = "https://crvs.gov.ag/view/2024-B-001456"
            };
        }
    }

    /// <summary>
    /// Swagger example: Complete birth certificate with 10 amendments (triggers back page)
    /// Demonstrates maximum complexity with amendments spanning multiple pages
    /// Front page shows first 5 amendments, back page shows all 10 in two-column format
    /// </summary>
    public class BirthCertificateCompleteWith10AmendmentsExample : IExamplesProvider<CertificateRequest>
    {
        public CertificateRequest GetExamples()
        {
            return new CertificateRequest
            {
                CertificateType = "birth",
                TemplateName = "Birth",
                Child = new PersonSection
                {
                    FirstName = "Alexander",
                    MiddleName = "James",
                    Surname = "Thompson",
                    Suffix = "Jr",
                    DateOfBirth = "20 Apr 2024",
                    PlaceOfBirth = "Mount St. John's Medical Centre",
                    Sex = "Male",
                    Occupation = null,  // Not applicable for child
                    AddressOne = null,  // Not applicable for child
                    AddressTwo = null,  // Not applicable for child
                    CountryOfBirth = "Antigua and Barbuda",
                    MaidenName = null,  // Not applicable
                    Relationship = null,  // Not applicable
                    Profession = null   // Not applicable
                },
                Mother = new PersonSection
                {
                    FirstName = "Sophia",
                    MiddleName = "Grace",
                    Surname = "Thompson",
                    MaidenName = "Richards",
                    Suffix = null,
                    DateOfBirth = "12 Aug 1992",
                    PlaceOfBirth = "Barbados",
                    Sex = "Female",
                    Occupation = "Registered Nurse",
                    Profession = "Healthcare Professional",
                    AddressOne = "45 Independence Avenue",
                    AddressTwo = "St. John's, Antigua and Barbuda",
                    CountryOfBirth = "Barbados",
                    Relationship = null  // Not applicable for mother
                },
                Father = new PersonSection
                {
                    FirstName = "Alexander",
                    MiddleName = "William",
                    Surname = "Thompson",
                    Suffix = "Sr",
                    DateOfBirth = "08 Nov 1990",
                    PlaceOfBirth = "St. John's, Antigua",
                    Sex = "Male",
                    Occupation = "Certified Public Accountant",
                    Profession = "Financial Services",
                    AddressOne = "45 Independence Avenue",
                    AddressTwo = "St. John's, Antigua and Barbuda",
                    CountryOfBirth = "Antigua and Barbuda",
                    MaidenName = null,  // Not applicable for father
                    Relationship = null  // Not applicable for father
                },
                Informant = new PersonSection
                {
                    FirstName = "Sophia",
                    MiddleName = "Grace",
                    Surname = "Thompson",
                    Suffix = null,
                    DateOfBirth = "12 Aug 1992",
                    PlaceOfBirth = null,
                    Sex = "Female",
                    Relationship = "Mother",
                    Profession = "Registered Nurse",
                    Occupation = null,
                    AddressOne = "45 Independence Avenue",
                    AddressTwo = "St. John's, Antigua and Barbuda",
                    CountryOfBirth = null,
                    MaidenName = null
                },
                Amendments = new List<AmendmentDto>
                {
                    new AmendmentDto
                    {
                        Type = "ChangeOfName",
                        Date = "15 May 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "FirstName", "Alexander" }
                        },
                        Description = "Corrected spelling of first name from 'Alexender' to 'Alexander' per court order #CO-2024-156"
                    },
                    new AmendmentDto
                    {
                        Type = "BirthNameAndParticularsChanged",
                        Date = "22 Jun 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "MiddleName", "James" }
                        },
                        Description = "Middle name added per parents' joint request, baptismal certificate provided"
                    },
                    new AmendmentDto
                    {
                        Type = "MothersNameAndParticularsChanged",
                        Date = "10 Jul 2024",
                        Section = "Mother",
                        Fields = new Dictionary<string, string>
                        {
                            { "Surname", "Thompson" },
                            { "Occupation", "Registered Nurse" }
                        },
                        Description = "Mother's surname changed from 'Richards' to 'Thompson' following marriage on 05 Jul 2024, occupation updated"
                    },
                    new AmendmentDto
                    {
                        Type = "FathersNameAndParticularsChanged",
                        Date = "15 Aug 2024",
                        Section = "Father",
                        Fields = new Dictionary<string, string>
                        {
                            { "AddressOne", "45 Independence Avenue" },
                            { "AddressTwo", "St. John's, Antigua and Barbuda" }
                        },
                        Description = "Father's address updated per statutory declaration dated 12 Aug 2024"
                    },
                    new AmendmentDto
                    {
                        Type = "BirthNameAndParticularsChanged",
                        Date = "25 Sep 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "PlaceOfBirth", "Mount St. John's Medical Centre" }
                        },
                        Description = "Place of birth corrected from 'St. Johns Hospital' to proper facility name per hospital records"
                    },
                    new AmendmentDto
                    {
                        Type = "MothersNameAndParticularsChanged",
                        Date = "05 Oct 2024",
                        Section = "Mother",
                        Fields = new Dictionary<string, string>
                        {
                            { "AddressOne", "45 Independence Avenue" },
                            { "AddressTwo", "St. John's, Antigua and Barbuda" }
                        },
                        Description = "Mother's address updated to match father's address following family relocation"
                    },
                    new AmendmentDto
                    {
                        Type = "BirthNameAndParticularsChanged",
                        Date = "12 Nov 2024",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "Suffix", "Jr" }
                        },
                        Description = "Suffix 'Jr' added to distinguish from father Alexander William Thompson Sr"
                    },
                    new AmendmentDto
                    {
                        Type = "FathersNameAndParticularsChanged",
                        Date = "20 Dec 2024",
                        Section = "Father",
                        Fields = new Dictionary<string, string>
                        {
                            { "Occupation", "Certified Public Accountant" }
                        },
                        Description = "Father's occupation updated from 'Accountant' to 'Certified Public Accountant' per CPA certification dated 15 Dec 2024"
                    },
                    new AmendmentDto
                    {
                        Type = "MothersNameAndParticularsChanged",
                        Date = "10 Jan 2025",
                        Section = "Mother",
                        Fields = new Dictionary<string, string>
                        {
                            { "MiddleName", "Grace" }
                        },
                        Description = "Mother's middle name 'Grace' added per baptismal certificate and statutory declaration"
                    },
                    new AmendmentDto
                    {
                        Type = "BirthNameAndParticularsChanged",
                        Date = "15 Feb 2025",
                        Section = "Child",
                        Fields = new Dictionary<string, string>
                        {
                            { "DateOfBirth", "20 Apr 2024" }
                        },
                        Description = "Date of birth confirmed as 20 Apr 2024 per hospital birth records and statutory declaration"
                    }
                },
                RegistrationNumber = "2024/B/002890",
                RegistrationDate = "25 Apr 2024",
                Registrar = "Margaret Williams",
                LateRegistration = true,
                Parish = "St. Paul",
                RecordUrl = "https://crvs.gov.ag/view/2024-B-002890"
            };
        }
    }
}
