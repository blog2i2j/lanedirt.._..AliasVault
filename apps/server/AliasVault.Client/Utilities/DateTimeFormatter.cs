//-----------------------------------------------------------------------
// <copyright file="DateTimeFormatter.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Utilities;

using System;
using System.Globalization;

/// <summary>
/// Centralized utility for formatting DateTime values consistently across the client application.
/// All dates are stored in UTC with the format: "yyyy-MM-dd HH:mm:ss.fff" (23 characters).
/// </summary>
public static class DateTimeFormatter
{
    /// <summary>
    /// The standard date-time format string used throughout the application.
    /// Format: "yyyy-MM-dd HH:mm:ss.fff" (23 characters with milliseconds).
    /// </summary>
    public const string StandardFormat = "yyyy-MM-dd HH:mm:ss.fff";

    /// <summary>
    /// The standard date format string for BirthDate fields (no time component).
    /// Format: "yyyy-MM-dd HH:mm:ss" (19 characters, time set to 00:00:00).
    /// </summary>
    public const string BirthDateFormat = "yyyy-MM-dd HH:mm:ss";

    /// <summary>
    /// Formats a DateTime to the standard format string.
    /// </summary>
    /// <param name="dateTime">The DateTime to format.</param>
    /// <returns>Formatted date-time string in format "yyyy-MM-dd HH:mm:ss.fff".</returns>
    public static string ToStandardFormat(DateTime dateTime)
    {
        // Ensure we're working with UTC
        var utcDateTime = dateTime.Kind == DateTimeKind.Utc ? dateTime : dateTime.ToUniversalTime();
        return utcDateTime.ToString(StandardFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Formats the current UTC time to the standard format string.
    /// </summary>
    /// <returns>Formatted current UTC date-time string.</returns>
    public static string Now()
    {
        return ToStandardFormat(DateTime.UtcNow);
    }

    /// <summary>
    /// Formats a DateTime to the birth date format (no milliseconds, time set to 00:00:00).
    /// </summary>
    /// <param name="dateTime">The DateTime to format.</param>
    /// <returns>Formatted date string in format "yyyy-MM-dd 00:00:00".</returns>
    public static string ToBirthDateFormat(DateTime dateTime)
    {
        // Ensure we're working with UTC and strip time components
        var utcDateTime = dateTime.Kind == DateTimeKind.Utc ? dateTime : dateTime.ToUniversalTime();
        var dateOnly = new DateTime(utcDateTime.Year, utcDateTime.Month, utcDateTime.Day, 0, 0, 0, DateTimeKind.Utc);
        return dateOnly.ToString(BirthDateFormat, CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Parses a date string that may be in various formats and returns a DateTime.
    /// Supports:
    /// - "yyyy-MM-dd HH:mm:ss.fff" (standard format)
    /// - "yyyy-MM-dd HH:mm:ss" (without milliseconds)
    /// - "yyyy-MM-ddTHH:mm:ss.fffZ" (ISO 8601)
    /// - "yyyy-MM-ddTHH:mm:ssZ" (ISO 8601 without milliseconds)
    /// Returns DateTime.MinValue if the string cannot be parsed or is null/empty.
    /// </summary>
    /// <param name="dateString">The date string to parse.</param>
    /// <returns>Parsed DateTime or DateTime.MinValue if parsing fails.</returns>
    public static DateTime Parse(string? dateString)
    {
        if (string.IsNullOrWhiteSpace(dateString))
        {
            return DateTime.MinValue;
        }

        // Try standard format first (fastest path)
        if (DateTime.TryParseExact(
            dateString,
            StandardFormat,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var result1))
        {
            return result1;
        }

        // Try format without milliseconds
        if (DateTime.TryParseExact(
            dateString,
            BirthDateFormat,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var result2))
        {
            return result2;
        }

        // Try ISO 8601 formats
        if (DateTime.TryParse(
            dateString,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var result3))
        {
            return result3;
        }

        // If all parsing fails, return MinValue
        return DateTime.MinValue;
    }
}
