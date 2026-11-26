#!/bin/sh
# Builds dist/DaedalusPanel.apk with the Android SDK's own tools, without a Gradle project: package the resources
# and the web folder, compile the one Java file, sign. Needs ANDROID_HOME (build-tools and a platform) and a JDK.
# usage: sh android/build.sh [version name]
set -eu
cd "$(dirname "$0")/.."
SDK=$(echo "${ANDROID_HOME:?set ANDROID_HOME to the Android SDK}" | tr '\\' '/')
BT=$(ls -d "$SDK"/build-tools/* | sort | tail -1)
JAR=$(ls -d "$SDK"/platforms/android-3[4-9]*/android.jar | sort | head -1)
NAME=${1:-0.1.0}
CODE=$(git rev-list --count HEAD 2>/dev/null || echo 1)
OUT=build/android
rm -rf "$OUT"; mkdir -p "$OUT/assets" "$OUT/gen" "$OUT/obj" dist

# The UI: the same web folder the iPad app carries, without the test pages and without a design of one's own.
cp -R web "$OUT/assets/web"
rm -f "$OUT/assets/web/design.js" "$OUT/assets/web/fx-demo.html" "$OUT/assets/web/orb-demo.html"
sed -i "s/<!--BUILD-->/$(git rev-parse --short HEAD 2>/dev/null || echo local)/" "$OUT/assets/web/engine.html"

"$BT/aapt2" compile --dir android/res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" --manifest android/AndroidManifest.xml --java "$OUT/gen" \
    --min-sdk-version 24 --target-sdk-version 34 --version-code "$CODE" --version-name "$NAME" "$OUT/res.zip"
javac -nowarn -Xlint:-options --release 11 -cp "$JAR" -d "$OUT/obj" $(find "$OUT/gen" android/src -name '*.java')
"$BT/d8.bat" --lib "$JAR" --min-api 24 --output "$OUT" $(find "$OUT/obj" -name '*.class')
# The web folder goes in with jar, not with aapt2 -A: on Windows aapt2 stores its paths with backslashes, and the
# device then finds no assets/web/index.html.
(cd "$OUT" && jar uf unsigned.apk classes.dex assets)
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# Signed with a key made here on first use and kept out of the repository. An update only installs over a copy
# signed with the same key; a release needs its own, kept safe.
KS=android/debug.keystore
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias daedalus -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Daedalus Panel test build" >/dev/null 2>&1
"$BT/apksigner.bat" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out dist/DaedalusPanel.apk "$OUT/aligned.apk"
"$BT/apksigner.bat" verify dist/DaedalusPanel.apk
ls -l dist/DaedalusPanel.apk
