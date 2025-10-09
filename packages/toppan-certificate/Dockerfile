# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution and project files
COPY CertificateService.sln ./
COPY src/CertificateService.Api/CertificateService.Api.csproj src/CertificateService.Api/
COPY src/CertificateService.Core/CertificateService.Core.csproj src/CertificateService.Core/

# Restore dependencies
RUN dotnet restore

# Copy source code
COPY src/ src/

# Build and publish
RUN dotnet publish src/CertificateService.Api/CertificateService.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

# Install dependencies for SkiaSharp
RUN apt-get update && apt-get install -y \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# Copy published app
COPY --from=build /app/publish .

# Copy templates, keys, and verifier app
COPY templates /app/templates
COPY keys /app/keys
COPY verifier-app /app/wwwroot

EXPOSE 3890
ENV ASPNETCORE_URLS=http://+:3890

ENTRYPOINT ["dotnet", "CertificateService.Api.dll"]
