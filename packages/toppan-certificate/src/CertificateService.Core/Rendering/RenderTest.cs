using System;
using CertificateService.Core.Models;
using CertificateService.Core.Template;

namespace CertificateService.Core.Rendering
{
    public class RenderTest
    {
        public static void TestSimpleDraw()
        {
            Console.WriteLine("\n=== Testing Simple Draw ===");

            try
            {
                // Create a simple bitmap with a rectangle
                using (var surface = SkiaSharp.SKSurface.Create(new SkiaSharp.SKImageInfo(400, 400)))
                {
                    var canvas = surface.Canvas;
                    canvas.Clear(SkiaSharp.SKColors.White);

                    // Draw a red rectangle
                    using (var paint = new SkiaSharp.SKPaint())
                    {
                        paint.Color = SkiaSharp.SKColors.Red;
                        paint.IsAntialias = true;
                        canvas.DrawRect(50, 50, 300, 300, paint);
                    }

                    // Draw some black text
                    using (var paint = new SkiaSharp.SKPaint())
                    {
                        paint.Color = SkiaSharp.SKColors.Black;
                        paint.TextSize = 48;
                        paint.IsAntialias = true;
                        canvas.DrawText("TEST", 100, 200, paint);
                    }

                    canvas.Flush();

                    // Save
                    using (var image = surface.Snapshot())
                    using (var bitmap = SkiaSharp.SKBitmap.FromImage(image))
                    {
                        ElmRender.SaveAsPng(bitmap, "/tmp/simple-test.png");
                        Console.WriteLine("✅ Saved simple test to /tmp/simple-test.png");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Simple draw error: {ex.Message}");
            }

            Console.WriteLine("======================================\n");
        }

        public static void TestRender()
        {
            Console.WriteLine("\n=== Certificate Rendering Test ===");
            Console.WriteLine();
            Console.WriteLine("INPUT DATA:");
            Console.WriteLine("-----------");
            Console.WriteLine("Child:");
            Console.WriteLine("  First Name: Jonathan");
            Console.WriteLine("  Middle Name: Andrew");
            Console.WriteLine("  Surname: Doe");
            Console.WriteLine("  Date of Birth: 15 Jan 2024");
            Console.WriteLine("  Place of Birth: St. John Hospital");
            Console.WriteLine("  Sex: Male");
            Console.WriteLine();
            Console.WriteLine("Mother:");
            Console.WriteLine("  First Name: Jane");
            Console.WriteLine("  Surname: Doe");
            Console.WriteLine("  Date of Birth: 10 Mar 1990");
            Console.WriteLine("  Occupation: Teacher");
            Console.WriteLine();
            Console.WriteLine("Father:");
            Console.WriteLine("  First Name: Robert");
            Console.WriteLine("  Surname: Doe");
            Console.WriteLine("  Date of Birth: 15 Jul 1988");
            Console.WriteLine("  Occupation: Engineer");
            Console.WriteLine();
            Console.WriteLine("RENDERING:");
            Console.WriteLine("----------");

            try
            {
                // 1. Load template
                var layout = new ElmLayout();
                // Prefer container path, but fall back to repo templates when running locally
                var templatePath = "/app/templates/Birth/ElmLayout.txt";
                if (!File.Exists(templatePath))
                {
                    // search upwards from current directory for templates/Birth/ElmLayout.txt
                    string? dir = Directory.GetCurrentDirectory();
                    for (int i = 0; i < 6 && dir != null; i++)
                    {
                        var candidate = Path.Combine(dir, "templates", "Birth", "ElmLayout.txt");
                        if (File.Exists(candidate))
                        {
                            templatePath = candidate;
                            break;
                        }
                        dir = Directory.GetParent(dir)?.FullName;
                    }
                }
                var result = layout.LoadFromFile(templatePath);

                if (result != 0)
                {
                    Console.WriteLine($"❌ Failed to load template: {layout.LoadErrorMessage}");
                    return;
                }

                Console.WriteLine($"✅ Template loaded: {layout.ItemCount} items");

                // 2. Create sample personal info
                var personalInfo = new PersonalInfo();

                // Add child data
                personalInfo.AddScalar("ChildFirstName", "Jonathan");
                personalInfo.AddScalar("ChildMiddleName", "Andrew");
                personalInfo.AddScalar("ChildSurname", "Doe");
                personalInfo.AddScalar("ChildDateOfBirth", "15 Jan 2024");
                personalInfo.AddScalar("ChildPlaceOfBirth", "St. John Hospital");
                personalInfo.AddScalar("m", "x"); // Male
                personalInfo.AddScalar("f", "");  // Not female

                // Add mother data
                personalInfo.AddScalar("MotherFirstName", "Jane");
                personalInfo.AddScalar("MotherSurname", "Doe");
                personalInfo.AddScalar("MotherDateOfBirth", "10 Mar 1990");
                personalInfo.AddScalar("MotherOccupation", "Teacher");

                // Add father data
                personalInfo.AddScalar("FatherFirstName", "Robert");
                personalInfo.AddScalar("FatherSurname", "Doe");
                personalInfo.AddScalar("FatherDateOfBirth", "15 Jul 1988");
                personalInfo.AddScalar("FatherOccupation", "Engineer");

                // 3. Render front page
                var renderer = new ElmRender();
                string templateFolder = Path.GetDirectoryName(templatePath)!;
                var bitmap = renderer.RenderToBitmap(templateFolder, layout, personalInfo, false);

                if (bitmap == null)
                {
                    Console.WriteLine($"❌ Rendering failed: {renderer.ErrorMessage}");
                    return;
                }

                Console.WriteLine($"✅ Rendered certificate: {bitmap.Width}x{bitmap.Height} pixels");

                // 4. Save as PNG
                // Save to repo test-output folder if it exists
                string outputPath = "/tmp/test-certificate-front.png";
                string? saveDir = Directory.GetCurrentDirectory();
                for (int i = 0; i < 6 && saveDir != null; i++)
                {
                    var outCandidateDir = Path.Combine(saveDir, "test-output");
                    if (Directory.Exists(outCandidateDir))
                    {
                        outputPath = Path.Combine(outCandidateDir, "birth-certificate-sample.png");
                        break;
                    }
                    saveDir = Directory.GetParent(saveDir)?.FullName;
                }
                if (ElmRender.SaveAsPng(bitmap, outputPath))
                {
                    Console.WriteLine($"✅ Saved to: {outputPath}");
                }
                else
                {
                    Console.WriteLine($"❌ Failed to save PNG");
                }

                Console.WriteLine();
                Console.WriteLine("OUTPUT:");
                Console.WriteLine("-------");
                Console.WriteLine("Certificate successfully generated!");
                Console.WriteLine($"File: {outputPath}");
                Console.WriteLine($"Dimensions: {bitmap.Width} x {bitmap.Height} pixels");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error: {ex.Message}");
                Console.WriteLine($"   Stack: {ex.StackTrace}");
            }

            Console.WriteLine("======================================\n");
        }
    }
}
