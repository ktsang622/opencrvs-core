using System;
using System.IO;
using System.Linq;
using System.Text;
using SkiaSharp;
using CertificateService.Core.Models;
using CertificateService.Core.Template;

namespace CertificateService.Core.Rendering
{
    /// <summary>
    /// Renders ElmLayout templates to bitmaps using SkiaSharp.
    /// Simplified version for Phase 1 - ports core functionality from Windows app.
    /// </summary>
    public class ElmRender
    {
        private string _templateFolder;
        private SKTypeface? _defaultTypeface;

        public string? ErrorMessage { get; private set; }

        /// <summary>
        /// Convert a number string to Unicode superscript characters
        /// </summary>
        private string ToSuperscript(string number)
        {
            if (string.IsNullOrEmpty(number))
                return number;

            var sb = new StringBuilder();
            foreach (char c in number)
            {
                switch (c)
                {
                    case '0': sb.Append('⁰'); break;
                    case '1': sb.Append('¹'); break;
                    case '2': sb.Append('²'); break;
                    case '3': sb.Append('³'); break;
                    case '4': sb.Append('⁴'); break;
                    case '5': sb.Append('⁵'); break;
                    case '6': sb.Append('⁶'); break;
                    case '7': sb.Append('⁷'); break;
                    case '8': sb.Append('⁸'); break;
                    case '9': sb.Append('⁹'); break;
                    default: sb.Append(c); break; // Keep non-digit characters as-is
                }
            }
            return sb.ToString();
        }

        /// <summary>
        /// Render template to a bitmap
        /// </summary>
        public SKBitmap? RenderToBitmap(
            string templateFolder,
            ElmLayout layout,
            PersonalInfo personalInfo,
            bool renderBackSide = false)
        {
            _templateFolder = templateFolder;
            ErrorMessage = null;

            // Certificate dimensions (from template)
            const int width = 1325;
            const int height = 1732;

            Console.WriteLine($"[RenderToBitmap] Called with renderBackSide={renderBackSide}");

            // Create surface for drawing (this is the recommended approach)
            using (var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul)))
            {
                var canvas = surface.Canvas;

                // Fill white background
                canvas.Clear(SKColors.White);

                // Load default font
                LoadFonts();

                // Apply layout in layers (0=background, 1=images, 2=text)
                Console.WriteLine($"[RenderToBitmap] Calling ApplyLayout with renderBackSide={renderBackSide}");
                var error = ApplyLayout(canvas, layout, personalInfo, renderBackSide);
                if (!string.IsNullOrEmpty(error))
                {
                    ErrorMessage = error;
                    return null;
                }

                // Flush canvas to ensure all drawing operations are committed
                canvas.Flush();

                // Get snapshot and convert to bitmap
                using (var image = surface.Snapshot())
                {
                    return SKBitmap.FromImage(image);
                }
            }
        }

        private void LoadFonts()
        {
            try
            {
                // Try to load the template font
                var fontPath = Path.Combine(_templateFolder, "arialnarrow-bold.ttf");

                if (File.Exists(fontPath))
                {
                    _defaultTypeface = SKTypeface.FromFile(fontPath);
                }
                else
                {
                    // Fallback to system font
                    _defaultTypeface = SKTypeface.FromFamilyName("Arial", SKFontStyle.Bold);
                }
            }
            catch
            {
                // Use default if loading fails
                _defaultTypeface = SKTypeface.Default;
            }
        }

        private string? ApplyLayout(
            SKCanvas canvas,
            ElmLayout layout,
            PersonalInfo personalInfo,
            bool renderBackSide)
        {
            try
            {
                // Render in 3 layers: 0=background, 1=images, 2=text
                for (int layer = 0; layer <= 2; layer++)
                {
                    for (int itemIndex = 0; itemIndex < layout.ItemCount; itemIndex++)
                    {
                        int itemLayer = layout.GetSetting(itemIndex, "_Layer", 0);
                        bool isBack = layout.GetSetting(itemIndex, "_Back", false);
                        bool isImage = layout.GetSetting(itemIndex, "_Image", false);

                        // Debug: log all items when rendering back side
                        if (renderBackSide && layer == 2)
                        {
                            var itemName = layout.GetName(itemIndex);
                            var groupName = layout.GetSetting(itemIndex, "_Group");
                            if (!string.IsNullOrEmpty(groupName))
                            {
                                Console.WriteLine($"[ApplyLayout] Item {itemIndex} '{itemName}': _Group={groupName}, _Back={isBack}, _Layer={itemLayer}, will skip={isBack != renderBackSide || itemLayer != layer}");
                            }
                        }

                        // Skip items not for this side
                        if (isBack != renderBackSide) continue;

                        // Skip items not for this layer
                        if (itemLayer != layer) continue;

                        // Check if this is a group
                        var groupName2 = layout.GetSetting(itemIndex, "_Group");
                        if (!string.IsNullOrEmpty(groupName2))
                        {
                            var itemName = layout.GetName(itemIndex);
                            Console.WriteLine($"[Render] Found group item {itemIndex} '{itemName}': _Group={groupName2}, _Back={isBack}, _Layer={itemLayer}, renderBackSide={renderBackSide}");
                            var error = RenderGroup(canvas, layout, itemIndex, personalInfo);
                            if (!string.IsNullOrEmpty(error)) return error;
                        }
                        else if (isImage)
                        {
                            var error = RenderImage(canvas, layout, itemIndex, personalInfo);
                            if (!string.IsNullOrEmpty(error)) return error;
                        }
                        else
                        {
                            var error = RenderTextItem(canvas, layout, itemIndex, personalInfo);
                            if (!string.IsNullOrEmpty(error)) return error;
                        }
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                return $"ApplyLayout error: {ex.Message}";
            }
        }

        private string? RenderImage(SKCanvas canvas, ElmLayout layout, int itemIndex, PersonalInfo personalInfo)
        {
            try
            {
                int x = layout.GetSetting(itemIndex, "_X", 0);
                int y = layout.GetSetting(itemIndex, "_Y", 0);
                var source = layout.GetSetting(itemIndex, "_Source");

                if (string.IsNullOrEmpty(source)) return null;

                // Remove quotes if present
                source = source.Trim('"');

                // Check if this is an embedded image (from PersonalInfo)
                if (personalInfo.HasImage(source))
                {
                    var imageBytes = personalInfo.GetImage(source);
                    if (imageBytes != null)
                    {
                        using (var image = SKBitmap.Decode(imageBytes))
                        {
                            if (image != null)
                            {
                                canvas.DrawBitmap(image, x, y);
                            }
                        }
                        return null;
                    }
                }

                // Otherwise, try to load from file
                var imagePath = Path.Combine(_templateFolder, source);
                if (!File.Exists(imagePath))
                {
                    // Not an error - some images might be optional
                    return null;
                }

                using (var image = SKBitmap.Decode(imagePath))
                {
                    if (image != null)
                    {
                        canvas.DrawBitmap(image, x, y);
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                return $"RenderImage error: {ex.Message}";
            }
        }

        private string? RenderTextItem(
            SKCanvas canvas,
            ElmLayout layout,
            int itemIndex,
            PersonalInfo personalInfo,
            int xOffset = 0,
            int yOffset = 0,
            Dictionary<string, string>? groupData = null)
        {
            try
            {
                int x = layout.GetSetting(itemIndex, "_X", 0) + xOffset;
                int y = layout.GetSetting(itemIndex, "_Y", 0) + yOffset;
                int height = layout.GetSetting(itemIndex, "_Height", 20);
                var source = layout.GetSetting(itemIndex, "_Source");
                var xAlign = layout.GetSetting(itemIndex, "_XAlign");
                var wrapWidth = layout.GetSetting(itemIndex, "_Width", 0);
                int wrapLineOffset = layout.GetSetting(itemIndex, "_WrapLineOffset", 16);

                if (string.IsNullOrEmpty(source)) return null;

                // Get text value from personalInfo or group data
                string? text;
                if (groupData != null && groupData.TryGetValue(source, out var groupValue))
                {
                    text = groupValue;
                }
                else
                {
                    text = personalInfo.GetValue(source, "");
                }

                if (string.IsNullOrEmpty(text))
                    return null;

                // Create paint for text
                using (var paint = new SKPaint())
                {
                    paint.Typeface = _defaultTypeface;
                    paint.TextSize = height;
                    paint.Color = SKColors.Black;
                    paint.IsAntialias = true;

                    // Adjust Y coordinate to align with form lines
                    // Y in template is the top of the text, but DrawText uses baseline
                    // Add font ascent to move baseline down from top of text
                    float textYOffset = Math.Abs(paint.FontMetrics.Ascent);

                    // Handle text alignment and wrapping
                    if (!string.IsNullOrEmpty(xAlign) && xAlign.Equals("WRAP", StringComparison.OrdinalIgnoreCase) && wrapWidth > 0)
                    {
                        // Simple word wrapping within _Width; draw each line with _WrapLineOffset spacing
                        var words = text.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                        var line = string.Empty;
                        int lineCount = 0;
                        foreach (var word in words)
                        {
                            var test = string.IsNullOrEmpty(line) ? word : line + " " + word;
                            if (paint.MeasureText(test) <= wrapWidth)
                            {
                                line = test;
                            }
                            else
                            {
                                // draw current line
                                canvas.DrawText(line, x, y + textYOffset + (lineCount * wrapLineOffset), paint);
                                lineCount++;
                                line = word;
                            }
                        }
                        if (!string.IsNullOrEmpty(line))
                        {
                            canvas.DrawText(line, x, y + textYOffset + (lineCount * wrapLineOffset), paint);
                        }
                    }
                    else
                    {
                        float drawX = x;
                        if (!string.IsNullOrEmpty(xAlign))
                        {
                            var align = xAlign.ToUpperInvariant();
                            if (align == "RIGHT")
                            {
                                drawX = x - paint.MeasureText(text);
                            }
                            else if (align == "CENTER")
                            {
                                drawX = x - (paint.MeasureText(text) / 2f);
                            }
                        }

                        // Draw text (y + textYOffset positions text properly on the line)
                        canvas.DrawText(text, drawX, y + textYOffset, paint);
                        // Update x with actual drawn position for superscript positioning logic below
                        x = (int)Math.Round(drawX);
                    }

                    // Check for superscript (postscript)
                    var psSource = layout.GetSetting(itemIndex, "_PSSource");
                    if (!string.IsNullOrEmpty(psSource))
                    {
                        var superscript = personalInfo.GetValue(psSource, "");
                        if (!string.IsNullOrEmpty(superscript))
                        {
                            int psHeight = layout.GetSetting(itemIndex, "_PSHeight", 16);
                            int psX = layout.GetSetting(itemIndex, "_PSX", 0);
                            int psY = layout.GetSetting(itemIndex, "_PSY", -4);

                            // Measure main text to position superscript after it
                            var textWidth = paint.MeasureText(text);

                            using (var psPaint = new SKPaint())
                            {
                                psPaint.Typeface = _defaultTypeface;
                                psPaint.TextSize = psHeight;
                                psPaint.Color = SKColors.Black;
                                psPaint.IsAntialias = true;

                                // Superscript uses same baseline adjustment as main text
                                // Don't use Unicode conversion as the font may not support those characters
                                canvas.DrawText(superscript, x + textWidth + psX, y + textYOffset + psY, psPaint);
                            }
                        }
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                return $"RenderTextItem error: {ex.Message}";
            }
        }

        private string? RenderGroup(SKCanvas canvas, ElmLayout layout, int itemIndex, PersonalInfo personalInfo)
        {
            try
            {
                var groupName = layout.GetSetting(itemIndex, "_Group");
                var groupSource = layout.GetSetting(itemIndex, "_Source");

                Console.WriteLine($"[RenderGroup] Called for item {itemIndex}: groupName='{groupName}', groupSource='{groupSource}'");

                if (string.IsNullOrEmpty(groupSource))
                {
                    Console.WriteLine($"[RenderGroup] ERROR: Group needs a source");
                    return "Group needs a source";
                }

                var groupList = personalInfo.GetGroupList(groupSource);
                Console.WriteLine($"[RenderGroup] Retrieved group '{groupSource}': {(groupList == null ? "NULL" : $"{groupList.Count} items")}");

                if (groupList == null || groupList.Count == 0)
                {
                    Console.WriteLine($"[RenderGroup] No data for group '{groupSource}', skipping render");
                    return null; // No data
                }

                int startIndex = layout.GetSetting(itemIndex, "_StartIndex", 0);
                int maxRows = layout.GetSetting(itemIndex, "_MaxRows", -1);
                int rowOffset = layout.GetSetting(itemIndex, "_GroupRowOffset", 0);
                int groupX = layout.GetSetting(itemIndex, "_X", 0);
                int groupY = layout.GetSetting(itemIndex, "_Y", 0);

                Console.WriteLine($"[RenderGroup] Render params: startIndex={startIndex}, maxRows={maxRows}, rowOffset={rowOffset}, pos=({groupX},{groupY})");

                if (maxRows < 1)
                {
                    Console.WriteLine($"[RenderGroup] No max rows defined, skipping");
                    return null; // No max rows defined
                }

                // Render each group item
                Console.WriteLine($"[RenderGroup] Rendering items {startIndex} to {Math.Min(startIndex + maxRows, groupList.Count) - 1}");
                for (int i = startIndex; i < Math.Min(startIndex + maxRows, groupList.Count); i++)
                {
                    var groupData = groupList[i];
                    int yPos = groupY + ((i - startIndex) * rowOffset);

                    Console.WriteLine($"[RenderGroup] Rendering group item {i} at Y={yPos}, data keys: {string.Join(", ", groupData.Keys)}");

                    // Find all items that belong to this group definition
                    for (int j = 0; j < layout.ItemCount; j++)
                    {
                        var groupToDefine = layout.GetSetting(j, "_GroupToDefine");
                        if (groupToDefine == groupName)
                        {
                            var source = layout.GetSetting(j, "_Source");
                            Console.WriteLine($"[RenderGroup] Rendering field '{source}' from group definition at item {j}");

                            // Render this group item at the calculated position
                            var error = RenderTextItem(canvas, layout, j, personalInfo,
                                groupX, yPos, groupData);
                            if (!string.IsNullOrEmpty(error))
                            {
                                Console.WriteLine($"[RenderGroup] ERROR rendering field: {error}");
                                return error;
                            }
                        }
                    }
                }

                Console.WriteLine($"[RenderGroup] Successfully rendered {Math.Min(maxRows, groupList.Count - startIndex)} group items");
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RenderGroup] EXCEPTION: {ex.Message}\n{ex.StackTrace}");
                return $"RenderGroup error: {ex.Message}";
            }
        }

        /// <summary>
        /// Save bitmap as PNG
        /// </summary>
        public static bool SaveAsPng(SKBitmap bitmap, string outputPath)
        {
            try
            {
                using (var image = SKImage.FromBitmap(bitmap))
                using (var data = image.Encode(SKEncodedImageFormat.Png, 100))
                using (var stream = File.OpenWrite(outputPath))
                {
                    data.SaveTo(stream);
                }
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
