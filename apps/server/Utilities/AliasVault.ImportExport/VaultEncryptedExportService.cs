//-----------------------------------------------------------------------
// <copyright file="VaultEncryptedExportService.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport;

using System.Text;
using System.Text.Json;
using AliasVault.Cryptography.Client;
using AliasVault.Cryptography.Server;
using AliasVault.ImportExport.Constants;
using AliasVault.ImportExport.Models.Exports;
using AliasVault.Shared.Core;

/// <summary>
/// Service for creating encrypted .avex export files.
/// </summary>
public static class VaultEncryptedExportService
{

    /// <summary>
    /// Exports vault data to .avex (AliasVault Encrypted eXport) format.
    /// This wraps an existing .avux file in an encrypted container using a user-provided password.
    /// </summary>
    /// <param name="avuxBytes">The unencrypted .avux file bytes.</param>
    /// <param name="exportPassword">The password to encrypt the export with.</param>
    /// <param name="username">The username creating the export.</param>
    /// <returns>A byte array containing the encrypted .avex file.</returns>
    public static async Task<byte[]> ExportToAvexAsync(
        byte[] avuxBytes,
        string exportPassword,
        string username)
    {
        if (avuxBytes == null || avuxBytes.Length == 0)
        {
            throw new ArgumentException("AVUX bytes cannot be null or empty", nameof(avuxBytes));
        }

        if (string.IsNullOrWhiteSpace(exportPassword))
        {
            throw new ArgumentException("Export password cannot be null or empty", nameof(exportPassword));
        }

        // 1. Generate random salt for key derivation
        var salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(32);
        var saltBase64 = Convert.ToBase64String(salt);

        // 2. Derive encryption key from password using Argon2id
        var key = await AliasVault.Cryptography.Client.Encryption.DeriveKeyFromPasswordAsync(
            exportPassword,
            saltBase64,
            Defaults.EncryptionType,
            Defaults.EncryptionSettings);

        // 3. Encrypt the .avux bytes using AES-256-GCM
        var encryptedPayload = AliasVault.Cryptography.Server.Encryption.SymmetricEncrypt(avuxBytes, key);

        // 4. Create the header
        var header = new AvexHeader
        {
            Format = AvexConstants.FormatIdentifier,
            Version = AvexConstants.FormatVersion,
            Kdf = new KdfParams
            {
                Type = Defaults.EncryptionType,
                Salt = saltBase64,
                Params = new Dictionary<string, int>
                {
                    ["DegreeOfParallelism"] = Defaults.Argon2IdDegreeOfParallelism,
                    ["MemorySize"] = Defaults.Argon2IdMemorySize,
                    ["Iterations"] = Defaults.Argon2IdIterations,
                },
            },
            Encryption = new EncryptionParams
            {
                Algorithm = "AES-256-GCM",
                EncryptedDataOffset = 0, // Will be calculated below
            },
            Metadata = new AvexMetadata
            {
                ExportedAt = DateTime.UtcNow,
                ExportedBy = username,
                AppVersion = AppInfo.GetFullVersion(),
            },
        };

        // 5. Serialize header to JSON
        var jsonOptions = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        var headerJson = JsonSerializer.Serialize(header, jsonOptions);
        var headerBytes = Encoding.UTF8.GetBytes(headerJson);
        var delimiterBytes = Encoding.UTF8.GetBytes(AvexConstants.HeaderDelimiter);

        // 6. Calculate the offset where encrypted data begins
        header.Encryption.EncryptedDataOffset = headerBytes.Length + delimiterBytes.Length;

        // Re-serialize with correct offset
        headerJson = JsonSerializer.Serialize(header, jsonOptions);
        headerBytes = Encoding.UTF8.GetBytes(headerJson);

        // 7. Combine header + delimiter + encrypted payload
        var avexFile = new byte[headerBytes.Length + delimiterBytes.Length + encryptedPayload.Length];
        Buffer.BlockCopy(headerBytes, 0, avexFile, 0, headerBytes.Length);
        Buffer.BlockCopy(delimiterBytes, 0, avexFile, headerBytes.Length, delimiterBytes.Length);
        Buffer.BlockCopy(encryptedPayload, 0, avexFile, headerBytes.Length + delimiterBytes.Length, encryptedPayload.Length);

        return avexFile;
    }
}
