//-----------------------------------------------------------------------
// <copyright file="UnsupportedFileFormatException.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport.Exceptions;

/// <summary>
/// Exception thrown when an unsupported file format is provided for import.
/// </summary>
public class UnsupportedFileFormatException : Exception
{
    /// <summary>
    /// Initializes a new instance of the <see cref="UnsupportedFileFormatException"/> class.
    /// </summary>
    public UnsupportedFileFormatException()
        : base("Unsupported file format")
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="UnsupportedFileFormatException"/> class.
    /// </summary>
    /// <param name="message">The error message.</param>
    public UnsupportedFileFormatException(string message)
        : base(message)
    {
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="UnsupportedFileFormatException"/> class.
    /// </summary>
    /// <param name="message">The error message.</param>
    /// <param name="innerException">The inner exception.</param>
    public UnsupportedFileFormatException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
