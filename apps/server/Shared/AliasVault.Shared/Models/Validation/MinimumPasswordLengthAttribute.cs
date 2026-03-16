//-----------------------------------------------------------------------
// <copyright file="MinimumPasswordLengthAttribute.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.Validation;

using System.ComponentModel.DataAnnotations;

/// <summary>
/// Validation attribute to ensure that a password meets the minimum length requirement.
/// </summary>
[AttributeUsage(AttributeTargets.Property)]
public class MinimumPasswordLengthAttribute : ValidationAttribute
{
    /// <summary>
    /// Initializes a new instance of the <see cref="MinimumPasswordLengthAttribute"/> class.
    /// </summary>
    /// <param name="minimumLength">The minimum required password length.</param>
    public MinimumPasswordLengthAttribute(int minimumLength)
    {
        MinimumLength = minimumLength;
    }

    /// <summary>
    /// Gets the minimum required password length.
    /// </summary>
    public int MinimumLength { get; }

    /// <inheritdoc />
    public override bool IsValid(object? value)
    {
        if (value is not string password)
        {
            return false;
        }

        return password.Length >= MinimumLength;
    }

    /// <inheritdoc />
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (IsValid(value))
        {
            return ValidationResult.Success;
        }

        // Format the error message with the minimum password length
        var errorMessage = string.Format(
            ErrorMessage ?? "Password must be at least {0} characters long.",
            MinimumLength);

        return new ValidationResult(errorMessage);
    }
}
