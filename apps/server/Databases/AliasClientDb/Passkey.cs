//-----------------------------------------------------------------------
// <copyright file="Passkey.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasClientDb;

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using AliasClientDb.Abstracts;

/// <summary>
/// The Passkey class that stores WebAuthn/FIDO2 passkey information.
/// </summary>
public class Passkey : SyncableEntity
{
    /// <summary>
    /// Gets or sets the ID.
    /// </summary>
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the item version for payload schema.
    /// </summary>
    [Required]
    public int ItemVersion { get; set; }

    /// <summary>
    /// Gets or sets the relying party identifier.
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string RpId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the credential ID.
    /// </summary>
    [Required]
    public byte[] CredentialId { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Gets or sets the signature counter.
    /// </summary>
    [Required]
    public int SignCount { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the passkey is backup eligible.
    /// </summary>
    [Required]
    public bool IsBackupEligible { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the passkey is in backup state.
    /// </summary>
    [Required]
    public bool IsBackupState { get; set; }

    /// <summary>
    /// Gets or sets the display name for the passkey.
    /// </summary>
    [MaxLength(255)]
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the additional data as JSON blob.
    /// </summary>
    public byte[]? AdditionalData { get; set; }
}
