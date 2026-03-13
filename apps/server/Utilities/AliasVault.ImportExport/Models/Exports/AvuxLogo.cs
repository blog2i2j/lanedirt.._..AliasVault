//-----------------------------------------------------------------------
// <copyright file="AvuxLogo.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents a logo in the .avux export.
/// Logos are deduplicated by source domain.
/// </summary>
public class AvuxLogo
{
    /// <summary>
    /// Gets or sets the logo ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the source domain (e.g., 'github.com').
    /// </summary>
    public string Source { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the MIME type of the logo.
    /// </summary>
    public string? MimeType { get; set; }

    /// <summary>
    /// Gets or sets the timestamp when the logo was fetched.
    /// </summary>
    public DateTime? FetchedAt { get; set; }

    /// <summary>
    /// Gets or sets the relative path to the logo file in the .avux archive.
    /// </summary>
    public string RelativePath { get; set; } = string.Empty;
}
