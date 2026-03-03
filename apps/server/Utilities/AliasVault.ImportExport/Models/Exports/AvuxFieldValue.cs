//-----------------------------------------------------------------------
// <copyright file="AvuxFieldValue.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents a field value in an item.
/// </summary>
public class AvuxFieldValue
{
    /// <summary>
    /// Gets or sets the field value ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the field key (e.g., "login.username").
    /// </summary>
    public string? FieldKey { get; set; }

    /// <summary>
    /// Gets or sets the custom field definition ID (if this is a custom field).
    /// </summary>
    public Guid? FieldDefinitionId { get; set; }

    /// <summary>
    /// Gets or sets the field value.
    /// </summary>
    public string? Value { get; set; }

    /// <summary>
    /// Gets or sets the display order weight.
    /// </summary>
    public int Weight { get; set; }
}
