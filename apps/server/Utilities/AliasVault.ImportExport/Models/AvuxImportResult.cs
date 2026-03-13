// <copyright file="AvuxImportResult.cs" company="Luka Burazin">
// Copyright (c) Luka Burazin. All rights reserved.
// </copyright>

namespace AliasVault.ImportExport.Models;

/// <summary>
/// Represents the result of importing an .avux file.
/// Contains imported credentials and associated logo data.
/// </summary>
public class AvuxImportResult
{
    /// <summary>
    /// Gets or sets the imported credentials.
    /// </summary>
    public List<ImportedCredential> Credentials { get; set; } = new();

    /// <summary>
    /// Gets or sets the logo data dictionary mapping logo ID to (Source domain, File data).
    /// Example: { guid1 => ("github.com", byte[]), guid2 => ("google.com", byte[]) }.
    /// </summary>
    public Dictionary<Guid, (string Source, byte[] FileData)> Logos { get; set; } = new();
}
