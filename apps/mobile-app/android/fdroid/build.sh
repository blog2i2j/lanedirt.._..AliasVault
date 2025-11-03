#! /bin/bash
source /etc/profile.d/bsenv.sh
export GRADLE_USER_HOME=$home_vagrant/.gradle
export fdroid="sudo --preserve-env --user vagrant
       env PATH=$fdroidserver:$PATH
       env PYTHONPATH=$fdroidserver:$fdroidserver/examples
       env PYTHONUNBUFFERED=true
       env TERM=$TERM
       env HOME=$home_vagrant
       fdroid"

# Go to build directory
cd build
# Fetch dependent libraries (if any)
$fdroid fetchsrclibs net.aliasvault.app --verbose
# Format build receipe
$fdroid rewritemeta net.aliasvault.app
# Build app and scan for any binary files that are prohibited
$fdroid build --verbose --latest --scan-binary --on-server --no-tarball net.aliasvault.app
