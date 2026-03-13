//-----------------------------------------------------------------------
// <copyright file="AvuxManifest.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents the complete manifest for an .avux export file.
/// </summary>
public class AvuxManifest
{
    /// <summary>
    /// Gets or sets the export format version.
    /// </summary>
    public string Version { get; set; } = "1.0.0";

    /// <summary>
    /// Gets or sets the export timestamp.
    /// </summary>
    public DateTime ExportedAt { get; set; }

    /// <summary>
    /// Gets or sets the username who created the export.
    /// </summary>
    public string ExportedBy { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the list of items in the vault.
    /// </summary>
    public List<AvuxItem> Items { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of folders.
    /// </summary>
    public List<AvuxFolder> Folders { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of tags.
    /// </summary>
    public List<AvuxTag> Tags { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of item-tag associations.
    /// </summary>
    public List<AvuxItemTag> ItemTags { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of custom field definitions.
    /// </summary>
    public List<AvuxFieldDefinition> FieldDefinitions { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of logos (deduplicated by source domain).
    /// </summary>
    public List<AvuxLogo> Logos { get; set; } = new();
}
