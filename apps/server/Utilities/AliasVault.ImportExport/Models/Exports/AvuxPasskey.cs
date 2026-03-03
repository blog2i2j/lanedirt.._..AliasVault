//-----------------------------------------------------------------------
// <copyright file="AvuxPasskey.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents a passkey in an item.
/// </summary>
public class AvuxPasskey
{
    /// <summary>
    /// Gets or sets the passkey ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the relying party ID.
    /// </summary>
    public string RpId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the user handle (base64-encoded).
    /// </summary>
    public string? UserHandle { get; set; }

    /// <summary>
    /// Gets or sets the public key (JWK format).
    /// </summary>
    public string PublicKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the private key (JWK format).
    /// </summary>
    public string PrivateKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the PRF key (base64-encoded).
    /// </summary>
    public string? PrfKey { get; set; }

    /// <summary>
    /// Gets or sets the display name.
    /// </summary>
    public string DisplayName { get; set; } = string.Empty;
}
