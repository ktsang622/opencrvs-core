using System;
using System.Collections.Generic;

namespace CertificateService.Core.Template
{
    /// <summary>
    /// Represents a node in the ElmLayout tree structure.
    /// Ported from Windows app - simplified for Phase 1.
    /// </summary>
    public class ElmLayoutNode
    {
        public string Name { get; set; } = string.Empty;
        public int Index { get; set; }
        public Dictionary<string, string> Settings { get; set; } = new Dictionary<string, string>();
        public List<ElmLayoutNode> Children { get; set; } = new List<ElmLayoutNode>();
        public ElmLayoutNode? Parent { get; set; }

        public ElmLayoutNode(string name)
        {
            Name = name;
        }

        /// <summary>
        /// Get a setting value with optional inheritance from parent nodes
        /// </summary>
        public string? GetSetting(string settingName, bool searchParents = true)
        {
            // Check this node first
            if (Settings.TryGetValue(settingName, out var value))
            {
                return value;
            }

            // Search parent nodes if enabled
            if (searchParents && Parent != null)
            {
                return Parent.GetSetting(settingName, true);
            }

            return null;
        }

        /// <summary>
        /// Get an integer setting with default value
        /// </summary>
        public int GetIntSetting(string settingName, int defaultValue = 0)
        {
            var value = GetSetting(settingName);
            if (string.IsNullOrEmpty(value))
                return defaultValue;

            // Try to evaluate as expression (simple arithmetic)
            try
            {
                // For Phase 1, just parse direct integers
                // TODO: Add expression evaluation later (e.g., "cXLeft + 10")
                if (int.TryParse(value, out var result))
                    return result;
            }
            catch
            {
                // Fall through to default
            }

            return defaultValue;
        }

        /// <summary>
        /// Get a boolean setting with default value
        /// </summary>
        public bool GetBoolSetting(string settingName, bool defaultValue = false)
        {
            var value = GetSetting(settingName);
            if (string.IsNullOrEmpty(value))
                return defaultValue;

            var truthy = new[] { "TRUE", "1", "T", "YES" };
            return Array.IndexOf(truthy, value.ToUpper()) >= 0;
        }

        /// <summary>
        /// Add or update a setting
        /// </summary>
        public void SetSetting(string key, string value)
        {
            Settings[key] = value;
        }
    }
}
