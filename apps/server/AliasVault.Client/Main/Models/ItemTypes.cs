//-----------------------------------------------------------------------
// <copyright file="ItemTypes.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Main.Models;

/// <summary>
/// Constants for item types.
/// </summary>
public static class ItemTypes
{
    /// <summary>
    /// Login item type - username/password credentials.
    /// </summary>
    public const string Login = "Login";

    /// <summary>
    /// Alias item type - login with auto-generated identity.
    /// </summary>
    public const string Alias = "Alias";

    /// <summary>
    /// Credit card item type - payment card information.
    /// </summary>
    public const string CreditCard = "CreditCard";

    /// <summary>
    /// Note item type - secure notes only.
    /// </summary>
    public const string Note = "Note";

    /// <summary>
    /// All available item types.
    /// </summary>
    public static readonly string[] All = { Login, Alias, CreditCard, Note };

    /// <summary>
    /// Checks if a string value is a valid item type.
    /// </summary>
    /// <param name="value">The value to check.</param>
    /// <returns>True if the value is a valid item type.</returns>
    public static bool IsValid(string? value)
    {
        return value == Login || value == Alias || value == CreditCard || value == Note;
    }
}
