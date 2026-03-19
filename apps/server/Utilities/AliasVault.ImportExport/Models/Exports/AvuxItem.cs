//-----------------------------------------------------------------------
// <copyright file="AvuxItem.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents an item in the .avux export.
/// </summary>
public class AvuxItem
{
    /// <summary>
    /// Gets or sets the item ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the item name.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// Gets or sets the item type (Login, Alias, CreditCard, Note).
    /// </summary>
    public string ItemType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the creation timestamp.
    /// </summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Gets or sets the last update timestamp.
    /// </summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// Gets or sets the folder ID this item belongs to.
    /// </summary>
    public Guid? FolderId { get; set; }

    /// <summary>
    /// Gets or sets the logo ID this item uses.
    /// </summary>
    public Guid? LogoId { get; set; }

    /// <summary>
    /// Gets or sets the list of field values for this item.
    /// </summary>
    public List<AvuxFieldValue> FieldValues { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of attachments for this item.
    /// </summary>
    public List<AvuxAttachment> Attachments { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of TOTP codes for this item.
    /// </summary>
    public List<AvuxTotpCode> TotpCodes { get; set; } = new();

    /// <summary>
    /// Gets or sets the list of passkeys for this item.
    /// </summary>
    public List<AvuxPasskey> Passkeys { get; set; } = new();
}
