//-----------------------------------------------------------------------
// <copyright file="SrpService.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Services.JsInterop.RustCore;

using Microsoft.JSInterop;

/// <summary>
/// JavaScript interop wrapper for the Rust WASM SRP (Secure Remote Password) library.
/// Provides SRP authentication functionality via WASM.
/// </summary>
public class SrpService : IAsyncDisposable
{
    private readonly IJSRuntime jsRuntime;
    private readonly RustCoreService rustCoreService;

    /// <summary>
    /// Initializes a new instance of the <see cref="SrpService"/> class.
    /// </summary>
    /// <param name="jsRuntime">The JS runtime for interop.</param>
    /// <param name="rustCoreService">The Rust core service for WASM availability checks.</param>
    public SrpService(IJSRuntime jsRuntime, RustCoreService rustCoreService)
    {
        this.jsRuntime = jsRuntime;
        this.rustCoreService = rustCoreService;
    }

    /// <summary>
    /// Generate a random salt for SRP registration.
    /// </summary>
    /// <returns>64-character uppercase hex string (32 bytes).</returns>
    /// <exception cref="InvalidOperationException">Thrown if WASM module is unavailable.</exception>
    public async Task<string> GenerateSaltAsync()
    {
        if (!await rustCoreService.WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        return await jsRuntime.InvokeAsync<string>("rustCoreSrpGenerateSalt");
    }

    /// <summary>
    /// Derive a private key from salt, identity, and password hash.
    /// </summary>
    /// <param name="salt">The salt (hex string).</param>
    /// <param name="identity">The SRP identity (username or GUID), will be lowercased.</param>
    /// <param name="passwordHash">The password hash (hex string).</param>
    /// <returns>64-character uppercase hex string (32 bytes).</returns>
    /// <exception cref="InvalidOperationException">Thrown if WASM module is unavailable.</exception>
    public async Task<string> DerivePrivateKeyAsync(string salt, string identity, string passwordHash)
    {
        if (!await rustCoreService.WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        // Make sure the identity is lowercase as the SRP protocol is case sensitive.
        identity = identity.ToLowerInvariant();

        return await jsRuntime.InvokeAsync<string>("rustCoreSrpDerivePrivateKey", salt, identity, passwordHash);
    }

    /// <summary>
    /// Derive a verifier from a private key.
    /// </summary>
    /// <param name="privateKey">The private key (hex string).</param>
    /// <returns>512-character uppercase hex string (256 bytes).</returns>
    /// <exception cref="InvalidOperationException">Thrown if WASM module is unavailable.</exception>
    public async Task<string> DeriveVerifierAsync(string privateKey)
    {
        if (!await rustCoreService.WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        return await jsRuntime.InvokeAsync<string>("rustCoreSrpDeriveVerifier", privateKey);
    }

    /// <summary>
    /// Generate client ephemeral keypair.
    /// </summary>
    /// <returns>Ephemeral object with Public and Secret hex strings.</returns>
    /// <exception cref="InvalidOperationException">Thrown if WASM module is unavailable.</exception>
    public async Task<SrpEphemeral> GenerateEphemeralAsync()
    {
        if (!await rustCoreService.WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        return await jsRuntime.InvokeAsync<SrpEphemeral>("rustCoreSrpGenerateEphemeral");
    }

    /// <summary>
    /// Derive client session from ephemeral values.
    /// </summary>
    /// <param name="clientSecret">Client ephemeral secret (hex string).</param>
    /// <param name="serverPublic">Server ephemeral public (hex string).</param>
    /// <param name="salt">The salt (hex string).</param>
    /// <param name="identity">The SRP identity, will be lowercased.</param>
    /// <param name="privateKey">The private key (hex string).</param>
    /// <returns>Session object with Key and Proof hex strings.</returns>
    /// <exception cref="InvalidOperationException">Thrown if WASM module is unavailable.</exception>
    public async Task<SrpSession> DeriveSessionAsync(string clientSecret, string serverPublic, string salt, string identity, string privateKey)
    {
        if (!await rustCoreService.WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        // Make sure the identity is lowercase as the SRP protocol is case sensitive.
        identity = identity.ToLowerInvariant();

        return await jsRuntime.InvokeAsync<SrpSession>("rustCoreSrpDeriveSession", clientSecret, serverPublic, salt, identity, privateKey);
    }

    /// <summary>
    /// Prepare password change/registration by generating salt and verifier.
    /// </summary>
    /// <param name="identity">The SRP identity (username or GUID).</param>
    /// <param name="passwordHashString">The password hash as hex string.</param>
    /// <returns>Tuple with Salt and Verifier.</returns>
    public async Task<(string Salt, string Verifier)> PreparePasswordChangeAsync(string identity, string passwordHashString)
    {
        var salt = await GenerateSaltAsync();
        var privateKey = await DerivePrivateKeyAsync(salt, identity, passwordHashString);
        var verifier = await DeriveVerifierAsync(privateKey);

        return (salt, verifier);
    }

    /// <summary>
    /// Derive session client-side (convenience method matching old Srp.DeriveSessionClient signature).
    /// </summary>
    /// <param name="privateKey">The private key.</param>
    /// <param name="clientSecretEphemeral">Client ephemeral secret.</param>
    /// <param name="serverEphemeralPublic">Server public ephemeral.</param>
    /// <param name="salt">Salt.</param>
    /// <param name="identity">Identity.</param>
    /// <returns>SrpSession.</returns>
    public async Task<SrpSession> DeriveSessionClientAsync(string privateKey, string clientSecretEphemeral, string serverEphemeralPublic, string salt, string identity)
    {
        return await DeriveSessionAsync(clientSecretEphemeral, serverEphemeralPublic, salt, identity, privateKey);
    }

    /// <summary>
    /// Verify the server's session proof (M2) on the client side.
    /// </summary>
    /// <param name="clientPublic">Client public ephemeral (A).</param>
    /// <param name="clientSession">Client session containing proof (M1) and key (K).</param>
    /// <param name="serverProof">Server proof (M2) to verify.</param>
    /// <returns>A task representing the asynchronous operation.</returns>
    /// <exception cref="InvalidOperationException">Thrown if WASM module is unavailable.</exception>
    /// <exception cref="System.Security.SecurityException">Thrown if verification fails.</exception>
    public async Task VerifySessionAsync(string clientPublic, SrpSession clientSession, string serverProof)
    {
        if (!await rustCoreService.WaitForAvailabilityAsync())
        {
            throw new InvalidOperationException("Rust WASM module is not available.");
        }

        var result = await jsRuntime.InvokeAsync<bool>("rustCoreSrpVerifySession", clientPublic, clientSession.Proof, clientSession.Key, serverProof);

        if (!result)
        {
            throw new System.Security.SecurityException("Server session proof verification failed.");
        }
    }

    /// <inheritdoc/>
    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }
}
