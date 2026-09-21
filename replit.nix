{pkgs}: {
  deps = [
    pkgs.python313Packages.filelock
    pkgs.python313Packages.idna
    pkgs.python313Packages.certifi
    pkgs.python313Packages.urllib3
    pkgs.python313Packages.requests
    pkgs.python313Packages.pyyaml
    pkgs.python313Packages.faster-whisper
    pkgs.ffmpeg
    pkgs.espeak-ng
    pkgs.piper-tts
    pkgs.python312Packages.pandas
    pkgs.python312Packages.openpyxl
    pkgs.python312Packages.reportlab
    pkgs.zstd
  ];
}
