//-----------------------------------------------------------------------
// <copyright file="MobileUnlockInitiateRequest.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Request model for initiating a mobile unlock request.
/// </summary>
/// <param name="ClientPublicKey">The public key from the client (base64 encoded).</param>
public record MobileUnlockInitiateRequest(string ClientPublicKey);
