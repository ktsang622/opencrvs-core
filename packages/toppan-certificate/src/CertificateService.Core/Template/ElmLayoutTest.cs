using System;

namespace CertificateService.Core.Template
{
    /// <summary>
    /// Quick test for ElmLayout parser - will move to proper unit tests later
    /// </summary>
    public class ElmLayoutTest
    {
        public static void TestParse()
        {
            var layout = new ElmLayout();
            // In Docker, templates are at /app/templates
            var templatePath = "/app/templates/Birth/ElmLayout.txt";

            Console.WriteLine($"Loading template from: {templatePath}");
            var result = layout.LoadFromFile(templatePath);

            if (result == 0)
            {
                Console.WriteLine($"✅ Template loaded successfully!");
                Console.WriteLine($"   Items found: {layout.ItemCount}");
                Console.WriteLine($"   Render back: {layout.RenderBack}");

                // Test getting some items
                for (int i = 0; i < Math.Min(5, layout.ItemCount); i++)
                {
                    var name = layout.GetName(i);
                    var x = layout.GetSetting(i, "_X", -1);
                    var y = layout.GetSetting(i, "_Y", -1);
                    var source = layout.GetSetting(i, "_Source");

                    Console.WriteLine($"   [{i}] {name}: X={x}, Y={y}, Source={source}");
                }
            }
            else
            {
                Console.WriteLine($"❌ Error loading template (code {result}):");
                Console.WriteLine($"   Line {layout.LoadErrorLineNumber}: {layout.LoadErrorMessage}");
            }
        }
    }
}
