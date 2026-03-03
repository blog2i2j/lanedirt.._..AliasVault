//-----------------------------------------------------------------------
// <copyright file="ImportedAttachment.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models;

/// <summary>
/// Represents an attachment in an intermediary format that is imported from various sources.
/// </summary>
public class ImportedAttachment
{
    /// <summary>
    /// Gets or sets the filename.
    /// </summary>
    public string Filename { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the file blob data.
    /// </summary>
    public byte[] Blob { get; set; } = Array.Empty<byte>();
}
