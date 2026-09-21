{pkgs}: {
  deps = [
    pkgs.ffmpeg
    pkgs.espeak-ng
    pkgs.piper-tts
    pkgs.whisper-cpp-vulkan
    pkgs.python312Packages.pandas
    pkgs.python312Packages.openpyxl
    pkgs.python312Packages.reportlab
    pkgs.zstd
  ];
}
