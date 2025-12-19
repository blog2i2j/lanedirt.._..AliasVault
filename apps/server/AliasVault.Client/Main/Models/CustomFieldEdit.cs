//-----------------------------------------------------------------------
// <copyright file="CustomFieldEdit.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Main.Models;

using System;

/// <summary>
/// Model for custom field editing.
/// </summary>
public sealed class CustomFieldEdit
{
    /// <summary>
    /// Gets or sets the field value ID (for existing fields).
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the field definition ID.
    /// </summary>
    public Guid FieldDefinitionId { get; set; }

    /// <summary>
    /// Gets or sets the temporary ID for new custom fields (format: custom_{uuid}).
    /// </summary>
    public string? TempId { get; set; }

    /// <summary>
    /// Gets or sets the field label.
    /// </summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the field type.
    /// </summary>
    public string FieldType { get; set; } = "Text";

    /// <summary>
    /// Gets or sets the field value.
    /// </summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets a value indicating whether the field is hidden/masked.
    /// </summary>
    public bool IsHidden { get; set; }
}
