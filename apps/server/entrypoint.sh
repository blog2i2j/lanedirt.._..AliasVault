#!/bin/sh

# Create SSL directory if it doesn't exist
mkdir -p /etc/nginx/ssl

# Select the appropriate nginx configuration based on FORCE_HTTPS_REDIRECT
# Default to true (nginx-443.conf) for backward compatibility
# Only disable redirect if explicitly set to "false"
if [ "${FORCE_HTTPS_REDIRECT:-true}" = "false" ]; then
    echo "Using nginx-80-443.conf (HTTP and HTTPS without redirect)"
    cp /etc/nginx/nginx-80-443.conf /etc/nginx/nginx.conf
else
    echo "Using nginx-443.conf (HTTP to HTTPS redirect enabled - default)"
    cp /etc/nginx/nginx-443.conf /etc/nginx/nginx.conf
fi

# Generate self-signed SSL certificate if not exists
if [ ! -f /etc/nginx/ssl/cert.pem ] || [ ! -f /etc/nginx/ssl/key.pem ]; then
    echo "Generating new SSL certificate (10 years validity)..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/key.pem \
        -out /etc/nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

    # Set proper permissions
    chmod 644 /etc/nginx/ssl/cert.pem
    chmod 600 /etc/nginx/ssl/key.pem
fi

# Create the appropriate SSL configuration based on LETSENCRYPT_ENABLED
if [ "${LETSENCRYPT_ENABLED}" = "true" ]; then
    cat > /etc/nginx/ssl.conf << EOF
    ssl_certificate /etc/nginx/ssl-letsencrypt/live/${HOSTNAME}/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl-letsencrypt/live/${HOSTNAME}/privkey.pem;
EOF
else
    cat > /etc/nginx/ssl.conf << EOF
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
EOF
fi

# Start nginx
nginx -g "daemon off;"