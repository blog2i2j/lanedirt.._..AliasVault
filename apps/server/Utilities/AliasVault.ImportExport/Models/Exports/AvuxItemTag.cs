//-----------------------------------------------------------------------
// <copyright file="AvuxItemTag.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Represents an item-tag association.
/// </summary>
public class AvuxItemTag
{
    /// <summary>
    /// Gets or sets the association ID.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the item ID.
    /// </summary>
    public Guid ItemId { get; set; }

    /// <summary>
    /// Gets or sets the tag ID.
    /// </summary>
    public Guid TagId { get; set; }
}
