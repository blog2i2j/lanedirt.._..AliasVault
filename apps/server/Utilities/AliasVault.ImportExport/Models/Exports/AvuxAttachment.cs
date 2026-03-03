//-----------------------------------------------------------------------
// <copyright file="AvuxAttachment.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents an attachment in an item.
/// </summary>
public class AvuxAttachment
{
    /// <summary>
    /// Gets or sets the attachment ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the filename.
    /// </summary>
    public string Filename { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the relative path in the .avux archive.
    /// </summary>
    public string RelativePath { get; set; } = string.Empty;
}
