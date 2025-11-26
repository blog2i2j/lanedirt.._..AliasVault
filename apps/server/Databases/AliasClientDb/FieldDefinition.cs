//-----------------------------------------------------------------------
// <copyright file="FieldDefinition.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasClientDb;

using System.ComponentModel.DataAnnotations;
using AliasClientDb.Abstracts;

/// <summary>
/// FieldDefinition entity that defines the schema for fields.
/// </summary>
public class FieldDefinition : SyncableEntity
{
    /// <summary>
    /// Gets or sets the field definition ID.
    /// </summary>
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the field key for system fields (e.g., 'login.username', 'card.number').
    /// NULL for custom (user-defined) fields.
    /// System fields use predefined keys like:
    /// - login.username, login.password, login.notes, login.url
    /// - card.number, card.cardholder_name, card.cvv
    /// - identity.first_name, identity.email, identity.phone_numbers
    /// - apikey.key, apikey.type
    /// - alias.email, alias.first_name (legacy)
    /// Custom fields have FieldKey = NULL and are identified by their GUID and Label.
    /// </summary>
    [StringLength(100)]
    public string? FieldKey { get; set; }

    /// <summary>
    /// Gets or sets the field type (Text, Password, Email, URL, Date, etc.).
    /// </summary>
    [Required]
    [StringLength(50)]
    public string FieldType { get; set; } = "Text";

    /// <summary>
    /// Gets or sets the display label for the field.
    /// </summary>
    [Required]
    [StringLength(255)]
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether this field supports multiple values.
    /// </summary>
    public bool IsMultiValue { get; set; } = false;

    /// <summary>
    /// Gets or sets a value indicating whether the field value is hidden (masked) by default in the UI.
    /// </summary>
    public bool IsHidden { get; set; } = false;

    /// <summary>
    /// Gets or sets a value indicating whether history tracking is enabled for this field.
    /// </summary>
    public bool EnableHistory { get; set; } = false;

    /// <summary>
    /// Gets or sets the weight for sorting fields in the UI. This primarily applies to custom fields.
    /// </summary>
    public int Weight { get; set; } = 0;

    /// <summary>
    /// Gets or sets the applicable item types as JSON array (e.g., '["Login","ApiKey"]').
    /// Null means applicable to all types.
    /// </summary>
    public string? ApplicableToTypes { get; set; }

    /// <summary>
    /// Gets or sets the field values using this definition.
    /// </summary>
    public virtual ICollection<FieldValue> FieldValues { get; set; } = [];

    /// <summary>
    /// Gets or sets the field history entries using this definition.
    /// </summary>
    public virtual ICollection<FieldHistory> FieldHistories { get; set; } = [];
}
