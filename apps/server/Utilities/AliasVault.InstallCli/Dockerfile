﻿FROM mcr.microsoft.com/dotnet/runtime:9.0 AS base
WORKDIR /app

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG TARGETARCH
ARG BUILD_CONFIGURATION=Release
WORKDIR /apps/server

# Copy the entire source code
COPY . .

# Build and publish in one step
RUN dotnet publish "apps/server/Utilities/AliasVault.InstallCli/AliasVault.InstallCli.csproj" \
    -c "$BUILD_CONFIGURATION" \
    -a "$TARGETARCH" \
    -o /app/publish \
    /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AliasVault.InstallCli.dll"]
