using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CertificateService.Core.Template
{
    /// <summary>
    /// ElmLayout template parser.
    /// Simplified version for Phase 1 - basic parsing without full expression evaluation.
    /// Ported from Windows app ElmLayout.cs
    /// </summary>
    public class ElmLayout
    {
        private List<ElmLayoutNode> _items = new List<ElmLayoutNode>(); // Flattened list of all leaf items
        private ElmLayoutNode _root;
        private Stack<ElmLayoutNode> _nodeStack = new Stack<ElmLayoutNode>();
        private Dictionary<string, string> _constants = new Dictionary<string, string>(); // c* constants
        private ExpressionEvaluator? _evaluator;

        public string LoadErrorMessage { get; private set; } = string.Empty;
        public int LoadErrorLineNumber { get; private set; } = 0;
        public int ItemCount => _items.Count;
        public bool RenderBack { get; private set; } = false;

        public ElmLayout()
        {
            _root = new ElmLayoutNode("__Root__");
        }

        /// <summary>
        /// Load template from file
        /// Returns: 0=success, 1=file not found, 2=cannot open, 3=parse error
        /// </summary>
        public int LoadFromFile(string filePath)
        {
            if (!File.Exists(filePath))
            {
                LoadErrorMessage = $"Template file not found: {filePath}";
                return 1;
            }

            try
            {
                _items.Clear();
                _constants.Clear();
                _nodeStack.Clear();
                _nodeStack.Push(_root);

                var lines = File.ReadAllLines(filePath);
                LoadErrorLineNumber = 0;

                foreach (var line in lines)
                {
                    LoadErrorLineNumber++;
                    var trimmed = line.Trim();

                    // Skip empty lines and comments
                    if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#"))
                        continue;

                    var result = ParseLine(trimmed);
                    if (result != 0)
                    {
                        return result;
                    }
                }

                // Check if there are items marked for back page
                RenderBack = _items.Any(item => item.GetBoolSetting("_Back", false));
                var backItems = _items.Where(item => item.GetBoolSetting("_Back", false)).Select(item => $"{item.Name} (index {item.Index})").ToList();
                Console.WriteLine($"[ElmLayout] RenderBack={RenderBack}, back items count={backItems.Count}");
                if (backItems.Any())
                {
                    Console.WriteLine($"[ElmLayout] Back items: {string.Join(", ", backItems)}");
                }

                return 0;
            }
            catch (Exception ex)
            {
                LoadErrorMessage = $"Error loading template: {ex.Message}";
                return 2;
            }
        }

        private int ParseLine(string line)
        {
            try
            {
                // Check for node closure (~NodeName)
                if (line.StartsWith("~"))
                {
                    var closeName = line.Substring(1).Trim();
                    if (_nodeStack.Count > 1)
                    {
                        var closed = _nodeStack.Pop();
                        // Verify name matches (optional)
                    }
                    return 0;
                }

                // Check for leaf item (^ItemName: settings...)
                if (line.StartsWith("^"))
                {
                    return ParseLeafItem(line);
                }

                // Check for settings assignment (Key=Value or Key = Value)
                if (line.Contains("="))
                {
                    return ParseSetting(line);
                }

                // Otherwise it's a branch node (section/group name)
                var node = new ElmLayoutNode(line.Trim());
                node.Parent = _nodeStack.Peek();
                _nodeStack.Peek().Children.Add(node);
                _nodeStack.Push(node);

                return 0;
            }
            catch (Exception ex)
            {
                LoadErrorMessage = $"Parse error on line {LoadErrorLineNumber}: {ex.Message}";
                return 3;
            }
        }

        private int ParseLeafItem(string line)
        {
            // Format: ^ItemName: _X=100; _Y=200; _Source=FieldName
            // Or just: ^ItemName (settings inherited from parent)
            var colonIndex = line.IndexOf(':');

            string itemName;
            string settingsPart;

            if (colonIndex < 0)
            {
                // No colon - just item name, settings inherited from parent
                itemName = line.Substring(1).Trim();
                settingsPart = "";
            }
            else
            {
                itemName = line.Substring(1, colonIndex - 1).Trim();
                settingsPart = line.Substring(colonIndex + 1).Trim();
            }

            var item = new ElmLayoutNode(itemName);
            item.Parent = _nodeStack.Peek();
            item.Index = _items.Count;

            // Parse settings (separated by semicolons)
            var settings = settingsPart.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var setting in settings)
            {
                var parts = setting.Split(new[] { '=' }, 2);
                if (parts.Length == 2)
                {
                    var key = parts[0].Trim();
                    var value = parts[1].Trim();
                    item.SetSetting(key, ResolveConstant(value));
                }
            }

            _items.Add(item);
            _nodeStack.Peek().Children.Add(item);

            return 0;
        }

        private int ParseSetting(string line)
        {
            // Handle multiple settings on one line separated by semicolons
            // e.g., "_X = 0 ; _Y = 0 ; _Width = 1325"
            var settings = line.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var setting in settings)
            {
                var parts = setting.Split(new[] { '=' }, 2);
                if (parts.Length != 2)
                {
                    LoadErrorMessage = $"Invalid setting format: {setting}";
                    return 3;
                }

                var key = parts[0].Trim();
                var value = parts[1].Trim();

                // Constants start with 'c' (e.g., cXLeft=238)
                if (key.StartsWith("c"))
                {
                    _constants[key] = value;
                }

                // Add setting to current node
                _nodeStack.Peek().SetSetting(key, value);
            }

            return 0;
        }

        /// <summary>
        /// Resolve constant references (e.g., "cXLeft" -> "238")
        /// Also strips comments from values
        /// </summary>
        private string ResolveConstant(string value)
        {
            // Strip comments (anything after #)
            var commentIndex = value.IndexOf('#');
            if (commentIndex >= 0)
            {
                value = value.Substring(0, commentIndex).Trim();
            }

            if (_constants.TryGetValue(value, out var resolved))
            {
                // Also strip comments from the resolved value
                commentIndex = resolved.IndexOf('#');
                if (commentIndex >= 0)
                {
                    resolved = resolved.Substring(0, commentIndex).Trim();
                }
                return resolved;
            }
            return value;
        }

        /// <summary>
        /// Resolve a constant or variable reference
        /// First checks constants (c*), then checks node settings hierarchy
        /// </summary>
        private string ResolveConstantOrVariable(string value, ElmLayoutNode node)
        {
            // Strip comments
            var commentIndex = value.IndexOf('#');
            if (commentIndex >= 0)
            {
                value = value.Substring(0, commentIndex).Trim();
            }

            // First, try constants (e.g., cXLeft, cYTop)
            if (_constants.TryGetValue(value, out var resolved))
            {
                commentIndex = resolved.IndexOf('#');
                if (commentIndex >= 0)
                {
                    resolved = resolved.Substring(0, commentIndex).Trim();
                }
                return resolved;
            }

            // Second, try to find in node hierarchy (e.g., FrontAmendmentCount)
            // This allows templates to use local variables
            var variableValue = node.GetSetting(value, searchParents: true);
            if (!string.IsNullOrEmpty(variableValue))
            {
                // Recursively resolve in case the variable references another variable/constant
                return ResolveConstantOrVariable(variableValue, node);
            }

            // Return original if not found
            return value;
        }

        /// <summary>
        /// Get item name by index
        /// </summary>
        public string? GetName(int itemIndex)
        {
            if (itemIndex < 0 || itemIndex >= _items.Count)
                return null;
            return _items[itemIndex].Name;
        }

        /// <summary>
        /// Get string setting for an item
        /// </summary>
        public string? GetSetting(int itemIndex, string settingName, string? condition = null)
        {
            if (itemIndex < 0 || itemIndex >= _items.Count)
                return null;

            var value = _items[itemIndex].GetSetting(settingName);
            if (value == null)
                return null;

            // Resolve constants and variables
            return ResolveConstantOrVariable(value, _items[itemIndex]);
        }

        /// <summary>
        /// Get integer setting for an item with default value
        /// </summary>
        public int GetSetting(int itemIndex, string settingName, int defaultValue, string? condition = null)
        {
            var value = GetSetting(itemIndex, settingName, condition);
            if (string.IsNullOrEmpty(value))
                return defaultValue;

            // Try direct parse first
            if (int.TryParse(value, out var result))
                return result;

            // If not a direct integer, try to evaluate as expression
            try
            {
                if (_evaluator == null)
                {
                    // Build integer constants for evaluator
                    var intConstants = new Dictionary<string, int>();
                    foreach (var kvp in _constants)
                    {
                        if (int.TryParse(kvp.Value, out var intVal))
                        {
                            intConstants[kvp.Key] = intVal;
                        }
                    }
                    _evaluator = new ExpressionEvaluator(intConstants);
                }

                return _evaluator.Evaluate(value);
            }
            catch
            {
                return defaultValue;
            }
        }

        /// <summary>
        /// Get boolean setting for an item with default value
        /// </summary>
        public bool GetSetting(int itemIndex, string settingName, bool defaultValue, string? condition = null)
        {
            var value = GetSetting(itemIndex, settingName, condition);
            if (string.IsNullOrEmpty(value))
                return defaultValue;

            var truthy = new[] { "TRUE", "1", "T", "YES", "True" };
            return Array.IndexOf(truthy, value) >= 0;
        }

        /// <summary>
        /// Get item index by name
        /// </summary>
        public int GetIndexFromName(string itemName)
        {
            for (int i = 0; i < _items.Count; i++)
            {
                if (_items[i].Name.Equals(itemName, StringComparison.OrdinalIgnoreCase))
                    return i;
            }
            return -1;
        }
    }
}
