#!/bin/bash
set -e  # Exit on any error, except where explicitly ignored
trap 'echo "🛑 Interrupted. Exiting..."; exit 130' INT  # Handle Ctrl+C cleanly

# Function to safely clone or update a repo
clone_or_update() {
  local repo_url=$1
  local dir_name=$(basename "$repo_url" .git)

  if [ -d "$dir_name/.git" ]; then
    echo "Updating existing repository: $dir_name"
    git -C "$dir_name" pull origin master || echo "⚠️  Warning: Failed to pull updates for $dir_name, continuing..."
  else
    echo "Cloning repository: $repo_url"
    git clone --depth=1 "$repo_url" "$dir_name" || echo "⚠️  Warning: Failed to clone $repo_url, continuing..."
  fi
}

# Clone or update both repositories
clone_or_update "https://gitlab.com/fdroid/fdroiddata.git"
clone_or_update "https://gitlab.com/fdroid/fdroidserver.git"

# Build and run the Docker environment
echo "Building Docker images..."
if ! docker compose build; then
  echo "⚠️  Warning: Docker build failed, continuing..."
fi

echo "Running fdroid-buildserver..."
docker compose run --rm fdroid-buildserver