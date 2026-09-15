#define AppName "Configurateur de Bijoux Rosebuds"
#define AppVersion "0.5"
#define AppDisplayVersion "v0.5-260914"
#define AppPublisher "Charles Thierry de Ville d'Avray"
#define AppExecutable "Configurateur de Bijoux Rosebuds.exe"
#define ProjectRoot SourcePath + "..\.."

[Setup]
AppId={{0D037883-FAB0-4120-ADE0-8F0E1DF4C889}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppDisplayVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Configurateur de Bijoux Rosebuds
DefaultGroupName=Configurateur de Bijoux Rosebuds
DisableProgramGroupPage=yes
OutputDir=..
OutputBaseFilename=Configurateur de Bijoux v0.5-260914
SetupIconFile={#ProjectRoot}\assets\icons\diamond-launcher.ico
UninstallDisplayIcon={app}\{#AppExecutable}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no
VersionInfoVersion=0.5.0.0
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} {#AppDisplayVersion}
VersionInfoProductName={#AppName}
VersionInfoProductVersion=0.5.0.0
VersionInfoCopyright=Copyright (C) 2026 {#AppPublisher}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "{#ProjectRoot}\{#AppExecutable}"; DestDir: "{app}"; Flags: ignoreversion restartreplace
Source: "{#ProjectRoot}\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\app.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\welcome.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\style.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\welcome.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\install-configurateur.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\VERSION"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#ProjectRoot}\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ProjectRoot}\Documentation\*"; DestDir: "{app}\Documentation"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{app}\relancer-viewer.bat"
Type: files; Name: "{app}\Lancer Configurateur Bijoux.bat"
Type: files; Name: "{app}\.viewer-server.cjs"
Type: filesandordirs; Name: "{app}\MATERIAUX"
Type: filesandordirs; Name: "{app}\MODELES 3D"

[Icons]
Name: "{autoprograms}\Configurateur de Bijoux Rosebuds"; Filename: "{app}\{#AppExecutable}"; WorkingDir: "{app}"; Comment: "Lancer le configurateur de bijoux Rosebuds"
Name: "{autodesktop}\Configurateur de Bijoux"; Filename: "{app}\{#AppExecutable}"; WorkingDir: "{app}"; Comment: "Lancer le configurateur de bijoux Rosebuds"

[Run]
Filename: "{app}\{#AppExecutable}"; Description: "Lancer le configurateur de bijoux"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\*.log"
Type: dirifempty; Name: "{app}"
