# Cree (ou remet a jour, a chaque lancement) le raccourci "Kinan Orchestre" sur le Bureau et dans le menu Demarrer,
# avec l'icone du dashboard ET l'identifiant d'application (AppUserModelID) 'kinan-os.dashboard' :
# la fenetre ouverte se regroupe alors sous ce raccourci (nom « Kinan Orchestre », pas « Electron ») et peut etre epinglee.
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KinanAumid {
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)] struct PropVariant {
    [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p;
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    uint GetCount(out uint c); uint GetAt(uint i, out PropertyKey k);
    uint GetValue(ref PropertyKey k, out PropVariant v); uint SetValue(ref PropertyKey k, ref PropVariant v); uint Commit();
  }
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class ShellLink { }
  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPersistFile {
    void GetClassID(out Guid g); [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint m); void Save([MarshalAs(UnmanagedType.LPWStr)] string f, bool r);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f); void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);
  }
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant v);
  public static void Poser(string lnk, string id) {
    object o = new ShellLink();
    ((IPersistFile)o).Load(lnk, 2);
    IPropertyStore ps = (IPropertyStore)o;
    PropertyKey k = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    PropVariant v = new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(id) };
    ps.SetValue(ref k, ref v); ps.Commit(); PropVariantClear(ref v);
    ((IPersistFile)o).Save(lnk, true);
  }
}
'@
  $racine = Split-Path -Parent $PSScriptRoot
  # Bureau et menu Demarrer : crees ou remis a jour. Barre des taches : seulement MIS A JOUR s'il est deja epingle
  # (dossier deplace : la cible et l'icone de l'ancien emplacement sont corrigees ; on n'epingle jamais a la place de l'utilisateur).
  $epingles = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
  $dossiers = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''), $epingles)
  foreach ($d in $dossiers) {
    try {
      $lnk = Join-Path $d 'Kinan Orchestre.lnk'
      if (($d -eq $epingles) -and -not (Test-Path -LiteralPath $lnk)) { continue }
      $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
      $s.TargetPath = Join-Path $racine 'lancer-kinan-os.cmd'
      $s.Arguments = ''
      $s.WorkingDirectory = $racine
      $s.IconLocation = (Join-Path $racine 'assets\icon.ico') + ',0'
      $s.WindowStyle = 7
      $s.Description = 'Kinan Orchestre'
      $s.Save()
      [KinanAumid]::Poser($lnk, 'kinan-os.dashboard')
    } catch { }
  }
} catch { exit 0 }
