#!/bin/sh
# Builds HomePanel.app on macOS without an Xcode project: compile, assemble the bundle, ad-hoc sign.
# Output: build/HomePanel.app.tar.gz (tar, not zip, so the executable bit survives the artifact upload).
set -eu
APP=build/HomePanel.app
rm -rf build
mkdir -p "$APP"

SDK=$(xcrun --sdk iphoneos --show-sdk-path)
xcrun --sdk iphoneos swiftc -sdk "$SDK" -target arm64-apple-ios15.0 \
    -parse-as-library -O Sources/*.swift -o "$APP/HomePanel"

cp Info.plist "$APP/Info.plist"
cp -R web "$APP/web"
# Stamp the build id into the page so a screenshot proves which build is running.
sed -i '' "s/<!--BUILD-->/${GITHUB_SHA:-local}/" "$APP/web/index.html"

# Ad-hoc signature carrying our entitlements; the unlocked iPads accept it.
codesign -f -s - --entitlements entitlements.plist "$APP"
tar -czf build/HomePanel.app.tar.gz -C build HomePanel.app
