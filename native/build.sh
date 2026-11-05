#!/bin/zsh
# 编译语音 helper（arm64 + x86_64 通用二进制），并把 Info.plist 嵌进二进制，系统才会弹麦克风/语音识别授权
set -e
cd "$(dirname "$0")"
mkdir -p build
for arch in arm64 x86_64; do
  swiftc -O -target ${arch}-apple-macos12 voice-helper.swift -o build/voice-helper-${arch} \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist
done
lipo -create build/voice-helper-arm64 build/voice-helper-x86_64 -output build/voice-helper
rm build/voice-helper-arm64 build/voice-helper-x86_64
codesign --force --sign - build/voice-helper
lipo -info build/voice-helper
