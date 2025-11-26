//-----------------------------------------------------------------------
// <copyright file="FieldHistory.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasClientDb;

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using AliasClientDb.Abstracts;

/// <summary>
/// FieldHistory entity that stores historical snapshots of field values.
/// </summary>
public class FieldHistory : SyncableEntity
{
    /// <summary>
    /// Gets or sets the field history ID.
    /// </summary>
    [Key]
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the item ID.
    /// </summary>
    [Required]
    public Guid ItemId { get; set; }

    /// <summary>
    /// Gets or sets the item object.
    /// </summary>
    [ForeignKey("ItemId")]
    public virtual Item Item { get; set; } = null!;

    /// <summary>
    /// Gets or sets the field definition ID.
    /// </summary>
    [Required]
    public Guid FieldDefinitionId { get; set; }

    /// <summary>
    /// Gets or sets the field definition object.
    /// </summary>
    [ForeignKey("FieldDefinitionId")]
    public virtual FieldDefinition FieldDefinition { get; set; } = null!;

    /// <summary>
    /// Gets or sets the value snapshot as JSON (e.g., '{"values":["hunter2"]}').
    /// </summary>
    [Required]
    public string ValueSnapshot { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the timestamp when this value was changed.
    /// </summary>
    [Required]
    public DateTime ChangedAt { get; set; }
}
