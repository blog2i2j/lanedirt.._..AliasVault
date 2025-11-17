//-----------------------------------------------------------------------
// <copyright file="MobileLoginSubmitRequest.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Request model for submitting mobile login response from mobile app.
/// </summary>
/// <param name="RequestId">The unique identifier for this login request.</param>
/// <param name="EncryptedDecryptionKey">The encrypted decryption key (base64 encoded).</param>
public record MobileLoginSubmitRequest(string RequestId, string EncryptedDecryptionKey);
