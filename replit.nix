{pkgs}: {
  deps = [
    pkgs.python312Packages.pandas
    pkgs.python312Packages.openpyxl
    pkgs.python312Packages.reportlab
    pkgs.zstd
  ];
}
