//-----------------------------------------------------------------------
// <copyright file="AvuxFolder.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents a folder.
/// </summary>
public class AvuxFolder
{
    /// <summary>
    /// Gets or sets the folder ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the folder name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the parent folder ID (null for root folders).
    /// </summary>
    public Guid? ParentFolderId { get; set; }

    /// <summary>
    /// Gets or sets the display order weight.
    /// </summary>
    public int Weight { get; set; }

    /// <summary>
    /// Gets or sets the creation timestamp.
    /// </summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Gets or sets the last update timestamp.
    /// </summary>
    public DateTime UpdatedAt { get; set; }
}
