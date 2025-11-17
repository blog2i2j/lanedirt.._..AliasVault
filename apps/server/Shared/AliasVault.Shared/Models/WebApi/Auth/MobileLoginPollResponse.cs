//-----------------------------------------------------------------------
// <copyright file="MobileLoginPollResponse.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Response model for polling mobile login status.
/// All sensitive data is encrypted with AES-256, and the AES key is encrypted with client's RSA public key.
/// Client decrypts username to call /login endpoint for salt and encryption settings.
/// </summary>
/// <param name="Fulfilled">Whether the request has been fulfilled by the mobile app.</param>
/// <param name="EncryptedSymmetricKey">The AES symmetric key encrypted with client's RSA public key (base64 encoded). Used to decrypt all encrypted fields. Null if not fulfilled.</param>
/// <param name="EncryptedToken">The JWT token encrypted with AES symmetric key (base64 encoded). Null if not fulfilled.</param>
/// <param name="EncryptedRefreshToken">The refresh token encrypted with AES symmetric key (base64 encoded). Null if not fulfilled.</param>
/// <param name="EncryptedDecryptionKey">The vault decryption key encrypted with client's RSA public key (base64 encoded). Null if not fulfilled.</param>
/// <param name="EncryptedUsername">The username encrypted with AES symmetric key (base64 encoded). Retrieved from User via UserId FK. Null if not fulfilled.</param>
public record MobileLoginPollResponse(
    bool Fulfilled,
    string? EncryptedSymmetricKey,
    string? EncryptedToken,
    string? EncryptedRefreshToken,
    string? EncryptedDecryptionKey,
    string? EncryptedUsername);
