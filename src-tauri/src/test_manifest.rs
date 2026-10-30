//! Native test executables need the same Common Controls v6 dependency as the app.
//! Production executables already receive a manifest from tauri-build.
#[used]
#[link_section = ".drectve"]
static COMMON_CONTROLS: [u8; 184] = *b" /MANIFEST:EMBED /MANIFESTDEPENDENCY:\"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'\" ";
