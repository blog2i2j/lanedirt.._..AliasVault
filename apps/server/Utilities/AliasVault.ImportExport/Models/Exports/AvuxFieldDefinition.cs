//-----------------------------------------------------------------------
// <copyright file="AvuxFieldDefinition.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents a custom field definition.
/// </summary>
public class AvuxFieldDefinition
{
    /// <summary>
    /// Gets or sets the field definition ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the field type.
    /// </summary>
    public string FieldType { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the field label.
    /// </summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether this field supports multiple values.
    /// </summary>
    public bool IsMultiValue { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether this field is hidden.
    /// </summary>
    public bool IsHidden { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether history is enabled for this field.
    /// </summary>
    public bool EnableHistory { get; set; }

    /// <summary>
    /// Gets or sets the display order weight.
    /// </summary>
    public int Weight { get; set; }

    /// <summary>
    /// Gets or sets the item types this field applies to (JSON array).
    /// </summary>
    public string? ApplicableToTypes { get; set; }
}
