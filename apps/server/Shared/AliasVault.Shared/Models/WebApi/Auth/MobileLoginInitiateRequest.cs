//-----------------------------------------------------------------------
// <copyright file="MobileLoginInitiateRequest.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Request model for initiating a mobile login request.
/// </summary>
/// <param name="ClientPublicKey">The public key from the client (base64 encoded).</param>
public record MobileLoginInitiateRequest(string ClientPublicKey);
