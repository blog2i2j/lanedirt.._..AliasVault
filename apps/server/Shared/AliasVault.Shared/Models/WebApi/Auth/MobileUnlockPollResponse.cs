//-----------------------------------------------------------------------
// <copyright file="MobileUnlockPollResponse.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Response model for polling mobile unlock status.
/// </summary>
/// <param name="Fulfilled">Whether the request has been fulfilled by the mobile app.</param>
/// <param name="EncryptedDecryptionKey">The encrypted decryption key (base64 encoded) if fulfilled.</param>
/// <param name="Username">The username of the user logging in if fulfilled.</param>
/// <param name="Token">The authentication token if fulfilled.</param>
/// <param name="Salt">The salt for key derivation if fulfilled.</param>
/// <param name="EncryptionType">The encryption type if fulfilled.</param>
/// <param name="EncryptionSettings">The encryption settings if fulfilled.</param>
public record MobileUnlockPollResponse(
    bool Fulfilled,
    string? EncryptedDecryptionKey,
    string? Username,
    TokenModel? Token,
    string? Salt,
    string? EncryptionType,
    string? EncryptionSettings);
