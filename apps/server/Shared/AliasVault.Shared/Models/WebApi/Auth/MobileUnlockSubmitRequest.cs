//-----------------------------------------------------------------------
// <copyright file="MobileUnlockSubmitRequest.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Request model for submitting mobile unlock response from mobile app.
/// </summary>
/// <param name="RequestId">The unique identifier for this unlock request.</param>
/// <param name="EncryptedDecryptionKey">The encrypted decryption key (base64 encoded).</param>
/// <param name="Username">The username of the user logging in.</param>
public record MobileUnlockSubmitRequest(string RequestId, string EncryptedDecryptionKey, string Username);
