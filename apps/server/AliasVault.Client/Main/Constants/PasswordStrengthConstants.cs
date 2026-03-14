//-----------------------------------------------------------------------
// <copyright file="PasswordStrengthConstants.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Main.Constants;

/// <summary>
/// Constants for password strength validation and requirements.
/// </summary>
public static class PasswordStrengthConstants
{
    /// <summary>
    /// Minimum password strength level required for account creation and password changes.
    /// Level 2 corresponds to "Good" (12-15 characters).
    /// </summary>
    public const int MinimumRequiredStrength = 2;

    /// <summary>
    /// Minimum password length for "Good" strength level.
    /// </summary>
    public const int MinimumGoodPasswordLength = 12;
}
