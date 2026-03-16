//-----------------------------------------------------------------------
// <copyright file="AvexHeader.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

using AliasVault.ImportExport.Constants;

/// <summary>
/// Represents the header for an .avex (encrypted export) file.
/// </summary>
public class AvexHeader
{
    /// <summary>
    /// Gets or sets the file format identifier.
    /// </summary>
    public string Format { get; set; } = AvexConstants.FormatIdentifier;

    /// <summary>
    /// Gets or sets the .avex container format version (not the app version).
    /// </summary>
    public string Version { get; set; } = AvexConstants.FormatVersion;

    /// <summary>
    /// Gets or sets the key derivation function parameters.
    /// </summary>
    public KdfParams Kdf { get; set; } = new();

    /// <summary>
    /// Gets or sets the encryption parameters.
    /// </summary>
    public EncryptionParams Encryption { get; set; } = new();

    /// <summary>
    /// Gets or sets the export metadata.
    /// </summary>
    public AvexMetadata Metadata { get; set; } = new();
}

/// <summary>
/// Key derivation function parameters.
/// </summary>
public class KdfParams
{
    /// <summary>
    /// Gets or sets the KDF algorithm type.
    /// </summary>
    public string Type { get; set; } = "Argon2id";

    /// <summary>
    /// Gets or sets the salt value (base64-encoded).
    /// </summary>
    public string Salt { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the algorithm-specific parameters.
    /// </summary>
    public Dictionary<string, int> Params { get; set; } = new();
}

/// <summary>
/// Encryption algorithm parameters.
/// </summary>
public class EncryptionParams
{
    /// <summary>
    /// Gets or sets the encryption algorithm name.
    /// </summary>
    public string Algorithm { get; set; } = "AES-256-GCM";

    /// <summary>
    /// Gets or sets the byte offset where encrypted data begins.
    /// </summary>
    public long EncryptedDataOffset { get; set; }
}

/// <summary>
/// Metadata about the export.
/// </summary>
public class AvexMetadata
{
    /// <summary>
    /// Gets or sets the timestamp when the export was created.
    /// </summary>
    public DateTime ExportedAt { get; set; }

    /// <summary>
    /// Gets or sets the username who created the export.
    /// </summary>
    public string ExportedBy { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the AliasVault application version that created this export.
    /// This helps with troubleshooting and understanding which version generated the export.
    /// </summary>
    public string? AppVersion { get; set; }
}
