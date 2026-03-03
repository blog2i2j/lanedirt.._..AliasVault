//-----------------------------------------------------------------------
// <copyright file="ImportedPasskey.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models;

/// <summary>
/// Represents a passkey in an intermediary format that is imported from various sources.
/// </summary>
public class ImportedPasskey
{
    /// <summary>
    /// Gets or sets the relying party ID.
    /// </summary>
    public string RpId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the user handle (user ID provided by relying party).
    /// </summary>
    public byte[]? UserHandle { get; set; }

    /// <summary>
    /// Gets or sets the public key (JWK format).
    /// </summary>
    public string PublicKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the private key (JWK format).
    /// </summary>
    public string PrivateKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the PRF key (optional).
    /// </summary>
    public byte[]? PrfKey { get; set; }

    /// <summary>
    /// Gets or sets the display name for the passkey.
    /// </summary>
    public string DisplayName { get; set; } = string.Empty;
}
