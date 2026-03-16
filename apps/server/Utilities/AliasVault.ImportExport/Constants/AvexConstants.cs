//-----------------------------------------------------------------------
// <copyright file="AvexConstants.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Constants;

/// <summary>
/// Constants for the .avex (AliasVault Encrypted eXport) file format.
/// </summary>
public static class AvexConstants
{
    /// <summary>
    /// The delimiter that separates the JSON header from the encrypted payload in .avex files.
    /// Follows a similar pattern to PEM-encoded certificates for industry familiarity.
    /// </summary>
    public const string HeaderDelimiter = "\n-----BEGIN ENCRYPTED DATA-----\n";

    /// <summary>
    /// The .avex file format identifier.
    /// </summary>
    public const string FormatIdentifier = "avex";

    /// <summary>
    /// The .avex format version.
    /// This represents the structure version of the .avex container format itself,
    /// independent of the AliasVault application version that created the export.
    /// Note: when changing the format version, also update the import logic to support
    /// both the old and new format versions, as all current logic checks for format version 1.0.0 explicitly.
    /// Version history:
    /// - 1.0.0: Initial .avex format with Argon2id KDF + AES-256-GCM encryption.
    /// </summary>
    public const string FormatVersion = "1.0.0";
}
