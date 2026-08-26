#!/usr/bin/env bash
# Re-signs an iOS app archive with a different provisioning profile. Only the
# signature, embedded profile and entitlements change.
#
# Usage: resign-ipa.sh <input.ipa> <profile.mobileprovision> <identity> <output.ipa>
#
#   identity: a codesign identity in the keychain, e.g. the SHA-1 hash or
#             "Apple Distribution: Example Inc (TEAMID)".

set -euo pipefail

if [ "$#" -ne 4 ]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
fi

input=$1
profile=$2
identity=$3
output=$4

for path in "$input" "$profile"; do
  [ -f "$path" ] || { echo "No such file: $path" >&2; exit 1; }
done

# zip writes relative to its working directory, which changes below.
mkdir -p "$(dirname "$output")"
output=$(cd "$(dirname "$output")" && pwd)/$(basename "$output")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

unzip -q "$input" -d "$work/extracted"
app=$(find "$work/extracted/Payload" -maxdepth 1 -name '*.app' -print -quit)
[ -n "$app" ] || { echo "No .app inside $input" >&2; exit 1; }

# Entitlements have to come from the new profile: keeping the archive's own
# would claim capabilities this profile does not grant, and the install fails.
security cms -D -i "$profile" > "$work/profile.plist"
/usr/libexec/PlistBuddy -x -c 'Print :Entitlements' "$work/profile.plist" \
  > "$work/entitlements.plist"

app_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
profile_app_id=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$work/profile.plist")
# The profile's identifier is prefixed with the team id, and may be a wildcard.
case "$app_id" in
  ${profile_app_id#*.}) ;;
  *) echo "Profile is for ${profile_app_id#*.}, archive is $app_id" >&2; exit 1 ;;
esac

# A wildcard profile grants a family of bundle ids, but the signature has to
# name one: substitute the archive's, as Xcode does when it signs.
if [ "${profile_app_id##*.}" = '*' ]; then
  /usr/libexec/PlistBuddy \
    -c "Set :application-identifier ${profile_app_id%%.*}.${app_id}" \
    "$work/entitlements.plist"
fi

# A profile only vouches for the certificates it was issued against; the
# device reports a mismatch as a missing profile.
/usr/libexec/PlistBuddy -x -c 'Print :DeveloperCertificates' "$work/profile.plist" \
  > "$work/certificates.plist"
profile_certs=$(
  awk '
    /<data>/ { block = ""; inside = 1; next }
    /<\/data>/ { inside = 0; gsub(/[ \t]/, "", block); print block; next }
    inside { block = block $0 }
  ' "$work/certificates.plist" |
    while IFS= read -r encoded; do
      printf '%s' "$encoded" | base64 -d 2>/dev/null |
        openssl x509 -inform DER -noout -fingerprint -sha1 2>/dev/null |
        sed 's/.*=//; s/://g'
    done
)
identity_cert=$(
  security find-identity -v -p codesigning |
    awk -v want="$identity" 'index($0, want) { print $2; exit }'
)
if [ -n "$identity_cert" ] &&
   ! printf '%s\n' "$profile_certs" | grep -qi "$identity_cert"; then
  echo "The profile was not issued to $identity." >&2
  echo "A development profile needs an 'Apple Development' certificate; ad-hoc and store profiles need 'Apple Distribution'." >&2
  exit 1
fi

devices=$(/usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$work/profile.plist" 2>/dev/null |
  grep -cE '^ +[0-9A-Fa-f]' || true)
if [ "${devices:-0}" -eq 0 ]; then
  echo "The profile provisions no devices, so nothing can install this." >&2
  echo "Store profiles list none; use an ad-hoc or development profile." >&2
  exit 1
fi

echo "Re-signing $app_id as $identity (profile lists ${devices} device(s))"

cp "$profile" "$app/embedded.mobileprovision"

# Nested code signs first: a container's signature covers what it holds.
while IFS= read -r nested; do
  rm -rf "$nested/_CodeSignature"
  codesign --force --sign "$identity" "$nested"
done < <(find "$app" -depth \( -name '*.framework' -o -name '*.appex' -o -name '*.dylib' \))

rm -rf "$app/_CodeSignature"
codesign --force --sign "$identity" --entitlements "$work/entitlements.plist" "$app"

codesign --verify --deep --strict "$app"

rm -f "$output"
(cd "$work/extracted" && zip -qry "$output" Payload)
echo "Wrote $output"
