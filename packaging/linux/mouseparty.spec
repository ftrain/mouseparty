%global debug_package %{nil}
%global _build_id_links none
%global __os_install_post %{nil}
%global source_date_epoch_from_changelog 0
%global __provides_exclude_from ^/opt/mouseparty/.*$
%global __requires_exclude_from ^/opt/mouseparty/resources/.*$

Name:           mouseparty
Version:        %{mp_version}
Release:        1
Summary:        Have friends over online: movies, chat and games
License:        MIT AND GPL-2.0-or-later AND GPL-2.0-only AND (LGPL-3.0-or-later OR GPL-2.0-or-later) AND LGPL-2.1-or-later AND Apache-2.0 AND BSD-2-Clause AND BSD-3-Clause AND ISC AND PSF-2.0 AND Zlib AND FTL AND Bitstream-Vera AND Arev AND bzip2-1.0.6 AND MIT-0 AND MPL-2.0 AND OFL-1.1 AND blessing
URL:            https://github.com/ftrain/mouseparty
ExclusiveArch:  x86_64
Requires:       gtk3
Requires:       webkit2gtk4.1
Requires:       procps-ng

%description
Mouse Party hosts a watch party from this computer. Movies, music, PDFs,
documents and SQLite databases are watched together in friends' browsers,
with chat and games. There is no server, and nothing of a party is left
behind when the app quits.

%prep

%build

%install
mkdir -p %{buildroot}/opt
cp -a %{mp_tree} %{buildroot}/opt/mouseparty
mkdir -p %{buildroot}%{_bindir}
ln -s ../../opt/mouseparty/mouseparty %{buildroot}%{_bindir}/mouseparty
install -Dpm644 %{mp_packaging}/io.github.ftrain.mouseparty.desktop %{buildroot}%{_datadir}/applications/io.github.ftrain.mouseparty.desktop
install -Dpm644 %{mp_packaging}/io.github.ftrain.mouseparty.png %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/io.github.ftrain.mouseparty.png
install -Dpm644 %{mp_packaging}/io.github.ftrain.mouseparty.metainfo.xml %{buildroot}%{_metainfodir}/io.github.ftrain.mouseparty.metainfo.xml

%files
/opt/mouseparty
%{_bindir}/mouseparty
%{_datadir}/applications/io.github.ftrain.mouseparty.desktop
%{_datadir}/icons/hicolor/256x256/apps/io.github.ftrain.mouseparty.png
%{_metainfodir}/io.github.ftrain.mouseparty.metainfo.xml
