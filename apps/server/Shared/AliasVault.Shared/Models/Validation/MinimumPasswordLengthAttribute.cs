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
        DevelopmentMinimumLength = null;
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="MinimumPasswordLengthAttribute"/> class with different lengths for development and production.
    /// </summary>
    /// <param name="minimumLength">The minimum required password length for production.</param>
    /// <param name="developmentMinimumLength">The minimum required password length for development.</param>
    public MinimumPasswordLengthAttribute(int minimumLength, int developmentMinimumLength)
    {
        MinimumLength = minimumLength;
        DevelopmentMinimumLength = developmentMinimumLength;
    }

    /// <summary>
    /// Gets the minimum required password length.
    /// </summary>
    public int MinimumLength { get; }

    /// <summary>
    /// Gets the minimum required password length for development environment (optional).
    /// </summary>
    public int? DevelopmentMinimumLength { get; }

    /// <inheritdoc />
    public override bool IsValid(object? value)
    {
        if (value is not string password)
        {
            return false;
        }

        return password.Length >= GetEffectiveMinimumLength();
    }

    /// <inheritdoc />
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (IsValid(value))
        {
            return ValidationResult.Success;
        }

        var effectiveMinLength = GetEffectiveMinimumLength();

        // Format the error message with the minimum password length
        var errorMessage = string.Format(
            ErrorMessage ?? "Password must be at least {0} characters long.",
            effectiveMinLength);

        return new ValidationResult(errorMessage);
    }

    /// <summary>
    /// Gets the effective minimum length based on the current environment.
    /// </summary>
    /// <returns>The minimum length to use for validation.</returns>
    private int GetEffectiveMinimumLength()
    {
#if DEBUG
        return DevelopmentMinimumLength ?? MinimumLength;
#else
        return MinimumLength;
#endif
    }
}
