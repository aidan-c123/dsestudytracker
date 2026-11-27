#!/usr/bin/env bash
# Build the StarShooter Android APK from this folder.
#
# No Gradle and no Android Studio: the four SDK tools do the whole job, which
# keeps the build reproducible and the repo free of build-system files.
#
#   aapt2      compile and link resources, produce the base APK
#   javac      compile the single activity against android.jar
#   d8         turn the class files into dex bytecode
#   zipalign   align the archive before signing
#   apksigner  sign it so a phone will install it
#
# Usage:  ANDROID_SDK=/path/to/sdk ./build.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/build"
sdk="${ANDROID_SDK:-${HOME}/sdk}"
bt="$sdk/build-tools/34.0.0"
jar="$sdk/platforms/android-34/android.jar"

for tool in "$bt/aapt2" "$bt/d8" "$bt/zipalign" "$bt/apksigner" "$jar"; do
  [ -e "$tool" ] || { echo "missing: $tool (set ANDROID_SDK)"; exit 1; }
done

rm -rf "$out"
mkdir -p "$out/res" "$out/classes" "$out/dex"

echo "1/6 compiling resources"
"$bt/aapt2" compile --dir "$here/res" -o "$out/res.zip"

echo "2/6 linking resources"
"$bt/aapt2" link \
  -o "$out/base.apk" \
  -I "$jar" \
  --manifest "$here/AndroidManifest.xml" \
  --java "$out/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code 4 --version-name 1.3 \
  "$out/res.zip"

echo "3/6 compiling java"
find "$out/gen" "$here/java" -name '*.java' > "$out/sources.txt"
# The warnings about the bootstrap class path come from compiling against
# android.jar rather than a JDK, and are expected; every other error stops the
# build. Without this, a failed compile would still produce a signed APK from
# whatever classes happened to exist.
if ! javac -source 17 -target 17 -encoding UTF-8 \
    -classpath "$jar" \
    -d "$out/classes" \
    @"$out/sources.txt" 2> "$out/javac.log"; then
  grep -v "bootstrap class path" "$out/javac.log" || true
  echo "compilation failed — no APK written"
  exit 1
fi

echo "4/6 dexing"
find "$out/classes" -name '*.class' > "$out/classes.txt"
"$bt/d8" --release --min-api 24 --lib "$jar" --output "$out/dex" @"$out/classes.txt"

echo "5/6 packaging"
cp "$out/base.apk" "$out/unsigned.apk"
# `zip` is not guaranteed on a build machine, so Python's zipfile does it. The
# dex must be STORED, not deflated, or Android will refuse to load it.
python3 - "$out/unsigned.apk" "$out/dex/classes.dex" <<'PY'
import sys, zipfile
apk, dex = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk, 'a', zipfile.ZIP_STORED) as z:
    z.write(dex, 'classes.dex')
PY

echo "6/6 aligning and signing"
"$bt/zipalign" -f -p 4 "$out/unsigned.apk" "$out/aligned.apk"

ks="$here/keystore.jks"
if [ ! -f "$ks" ]; then
  echo "    creating a signing key (keep keystore.jks — updates need the same key)"
  keytool -genkeypair -v \
    -keystore "$ks" \
    -alias starshooter \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass starshooter -keypass starshooter \
    -dname "CN=StarShooter, O=StarShooter, C=HK" >/dev/null 2>&1
fi

"$bt/apksigner" sign \
  --ks "$ks" \
  --ks-key-alias starshooter \
  --ks-pass pass:starshooter \
  --key-pass pass:starshooter \
  --out "$here/StarShooter.apk" \
  "$out/aligned.apk"

"$bt/apksigner" verify --print-certs "$here/StarShooter.apk" | head -3
ls -lh "$here/StarShooter.apk"
