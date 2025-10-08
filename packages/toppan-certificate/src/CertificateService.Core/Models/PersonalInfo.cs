using System;
using System.Collections.Generic;

namespace CertificateService.Core.Models
{
    /// <summary>
    /// Data container for certificate personal information.
    /// Ported from Windows app PersonalInfo.cs
    /// 
    /// Contains two types of data:
    /// 1. SimpleItems - Key-value pairs for most fields (e.g., ChildFirstName=John)
    /// 2. Groups - Lists of dictionaries for repeating data (e.g., amendments)
    /// </summary>
    public class PersonalInfo
    {
        private Dictionary<string, string> _simpleItems;
        private Dictionary<string, List<Dictionary<string, string>>> _groups;
        private Dictionary<string, byte[]> _images;

        public PersonalInfo()
        {
            _simpleItems = new Dictionary<string, string>();
            _groups = new Dictionary<string, List<Dictionary<string, string>>>();
            _images = new Dictionary<string, byte[]>();
        }

        /// <summary>
        /// Expose simple items as read-only property
        /// </summary>
        public IReadOnlyDictionary<string, string> SimpleItems => _simpleItems;

        /// <summary>
        /// Add a simple scalar field (e.g., ChildFirstName=John)
        /// </summary>
        public void AddScalar(string key, string value)
        {
            if (_simpleItems.ContainsKey(key))
            {
                _simpleItems[key] = value; // Update if exists
            }
            else
            {
                _simpleItems.Add(key, value);
            }
        }

        /// <summary>
        /// Remove all fields starting with a section prefix (e.g., "Father")
        /// Used when father is removed via amendment
        /// </summary>
        public void RemoveSectionFields(string sectionToRemove)
        {
            var newSimpleItems = new Dictionary<string, string>();
            foreach (var kvp in _simpleItems)
            {
                if (!kvp.Key.StartsWith(sectionToRemove))
                {
                    newSimpleItems.Add(kvp.Key, kvp.Value);
                }
            }
            _simpleItems = newSimpleItems;
        }

        /// <summary>
        /// Add an item to a group (e.g., add amendment to amendments list)
        /// </summary>
        public void AddToGroup(string groupName, Dictionary<string, string> groupItem)
        {
            List<Dictionary<string, string>>? groupList;
            if (!_groups.ContainsKey(groupName))
            {
                groupList = new List<Dictionary<string, string>>();
                _groups.Add(groupName, groupList);
            }
            else
            {
                groupList = _groups[groupName];
            }

            groupList.Add(groupItem);
        }

        /// <summary>
        /// Get a group list by name (e.g., get all amendments)
        /// </summary>
        public List<Dictionary<string, string>>? GetGroupList(string groupName)
        {
            if (_groups.ContainsKey(groupName))
            {
                return _groups[groupName];
            }
            return null;
        }

        /// <summary>
        /// Get a simple item value by key, or return default if not found
        /// </summary>
        public string GetValue(string key, string defaultValue = "")
        {
            return _simpleItems.TryGetValue(key, out var value) ? value : defaultValue;
        }

        /// <summary>
        /// Check if a simple item exists
        /// </summary>
        public bool HasValue(string key)
        {
            return _simpleItems.ContainsKey(key);
        }

        /// <summary>
        /// Add an image as byte array (e.g., QR code)
        /// </summary>
        public void AddImage(string key, byte[] imageData)
        {
            if (_images.ContainsKey(key))
            {
                _images[key] = imageData;
            }
            else
            {
                _images.Add(key, imageData);
            }
        }

        /// <summary>
        /// Get an image by key
        /// </summary>
        public byte[]? GetImage(string key)
        {
            return _images.TryGetValue(key, out var imageData) ? imageData : null;
        }

        /// <summary>
        /// Check if an image exists
        /// </summary>
        public bool HasImage(string key)
        {
            return _images.ContainsKey(key);
        }
    }
}
