//-----------------------------------------------------------------------
// <copyright file="SyncableTables.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Services.JsInterop.RustCore;

/// <summary>
/// List of syncable table names that need to be read for merge operations.
/// </summary>
public static class SyncableTables
{
    /// <summary>
    /// Table names that need LWW merge.
    /// </summary>
    public static readonly string[] Names =
    [
        "Items",
        "FieldValues",
        "Folders",
        "Tags",
        "ItemTags",
        "Attachments",
        "TotpCodes",
        "Passkeys",
        "FieldDefinitions",
        "FieldHistories",
        "Logos",
    ];
}
