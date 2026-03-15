//-----------------------------------------------------------------------
// <copyright file="VaultEncryptedImportService.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.ImportExport;

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AliasVault.Cryptography.Client;
using AliasVault.Cryptography.Server;
using AliasVault.ImportExport.Models.Exports;

/// <summary>
/// Service for importing encrypted .avex export files.
/// </summary>
public static class VaultEncryptedImportService
{
    private const string HeaderDelimiter = "\n--- ENCRYPTED PAYLOAD FOLLOWS ---\n";

    /// <summary>
    /// Checks if the provided file bytes represent an .avex encrypted export.
    /// </summary>
    /// <param name="fileBytes">The file bytes to check.</param>
    /// <returns>True if the file is an .avex format, false otherwise.</returns>
    public static bool IsAvexFormat(byte[] fileBytes)
    {
        if (fileBytes == null || fileBytes.Length < 50)
        {
            return false;
        }

        try
        {
            // Read first 500 bytes as string to check for header
            var headerLength = Math.Min(500, fileBytes.Length);
            var headerText = Encoding.UTF8.GetString(fileBytes, 0, headerLength);

            return headerText.Contains("\"format\": \"avex\"") ||
                   headerText.Contains("\"format\":\"avex\"");
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Decrypts an .avex file and returns the unencrypted .avux bytes.
    /// </summary>
    /// <param name="avexBytes">The encrypted .avex file bytes.</param>
    /// <param name="exportPassword">The password to decrypt the export with.</param>
    /// <returns>The decrypted .avux file bytes.</returns>
    public static async Task<byte[]> DecryptAvexAsync(byte[] avexBytes, string exportPassword)
    {
        if (avexBytes == null || avexBytes.Length == 0)
        {
            throw new ArgumentException("AVEX bytes cannot be null or empty", nameof(avexBytes));
        }

        if (string.IsNullOrWhiteSpace(exportPassword))
        {
            throw new ArgumentException("Export password cannot be null or empty", nameof(exportPassword));
        }

        // 1. Parse the header
        var (header, payloadOffset) = ParseAvexHeader(avexBytes);

        // 2. Validate version
        if (header.Version != "1.0.0")
        {
            throw new InvalidOperationException($"Unsupported .avex version: {header.Version}. Expected 1.0.0.");
        }

        // 3. Validate encryption algorithm
        if (header.Encryption.Algorithm != "AES-256-GCM")
        {
            throw new InvalidOperationException($"Unsupported encryption algorithm: {header.Encryption.Algorithm}");
        }

        // 4. Extract encrypted payload
        var encryptedPayloadLength = avexBytes.Length - (int)payloadOffset;
        if (encryptedPayloadLength <= 0)
        {
            throw new InvalidOperationException("Invalid .avex file: no encrypted payload found");
        }

        var encryptedPayload = new byte[encryptedPayloadLength];
        Buffer.BlockCopy(avexBytes, (int)payloadOffset, encryptedPayload, 0, encryptedPayloadLength);

        // 5. Derive decryption key from password using same KDF parameters
        var kdfSettings = JsonSerializer.Serialize(header.Kdf.Params);
        var key = await AliasVault.Cryptography.Client.Encryption.DeriveKeyFromPasswordAsync(
            exportPassword,
            header.Kdf.Salt,
            header.Kdf.Type,
            kdfSettings);

        // 6. Decrypt the payload
        byte[] avuxBytes;
        try
        {
            avuxBytes = AliasVault.Cryptography.Server.Encryption.SymmetricDecrypt(encryptedPayload, key);
        }
        catch (CryptographicException ex)
        {
            throw new InvalidOperationException("Failed to decrypt .avex file. The password may be incorrect or the file may be corrupted.", ex);
        }

        return avuxBytes;
    }

    /// <summary>
    /// Parses the .avex header and returns the header object and payload offset.
    /// </summary>
    /// <param name="avexBytes">The .avex file bytes.</param>
    /// <returns>A tuple containing the header and the offset where encrypted data begins.</returns>
    private static (AvexHeader Header, long PayloadOffset) ParseAvexHeader(byte[] avexBytes)
    {
        // Find the delimiter
        var delimiterBytes = Encoding.UTF8.GetBytes(HeaderDelimiter);
        var delimiterIndex = IndexOf(avexBytes, delimiterBytes);

        if (delimiterIndex == -1)
        {
            throw new InvalidOperationException("Invalid .avex file: header delimiter not found");
        }

        // Extract header JSON
        var headerBytes = new byte[delimiterIndex];
        Buffer.BlockCopy(avexBytes, 0, headerBytes, 0, delimiterIndex);
        var headerJson = Encoding.UTF8.GetString(headerBytes);

        // Deserialize header
        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        };

        var header = JsonSerializer.Deserialize<AvexHeader>(headerJson, jsonOptions);

        if (header == null)
        {
            throw new InvalidOperationException("Invalid .avex file: failed to parse header JSON");
        }

        if (header.Format != "avex")
        {
            throw new InvalidOperationException($"Invalid .avex file: expected format 'avex', got '{header.Format}'");
        }

        // Calculate payload offset
        var payloadOffset = delimiterIndex + delimiterBytes.Length;

        return (header, payloadOffset);
    }

    /// <summary>
    /// Finds the index of a byte pattern within a byte array.
    /// </summary>
    /// <param name="source">The source byte array to search in.</param>
    /// <param name="pattern">The pattern to search for.</param>
    /// <returns>The index of the pattern, or -1 if not found.</returns>
    private static int IndexOf(byte[] source, byte[] pattern)
    {
        if (pattern.Length > source.Length)
        {
            return -1;
        }

        for (int i = 0; i <= source.Length - pattern.Length; i++)
        {
            bool found = true;
            for (int j = 0; j < pattern.Length; j++)
            {
                if (source[i + j] != pattern[j])
                {
                    found = false;
                    break;
                }
            }

            if (found)
            {
                return i;
            }
        }

        return -1;
    }
}
